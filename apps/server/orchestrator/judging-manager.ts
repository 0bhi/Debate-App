import { prisma, DebateWinner } from "@repo/database";
import { llmService } from "../services/llm";
import { logger } from "../utils/logger";
import { SessionState } from "@repo/types";
import { redisPub } from "../services/redis";

export class JudgingManager {
  private judgingInProgress = new Set<string>();

  async coordinateJudgingSession(
    sessionId: string,
    loadSessionState: (id: string) => Promise<SessionState | null>
  ): Promise<void> {
    if (this.judgingInProgress.has(sessionId)) {
      return;
    }

    try {
      await prisma.debateSession.update({
        where: { id: sessionId },
        data: { status: "JUDGING" },
      });

      const state = await loadSessionState(sessionId);
      if (!state) throw new Error("Session not found");

      if (state.winner) {
        return;
      }

      this.judgingInProgress.add(sessionId);

      this.performDebateJudgment(sessionId, state, loadSessionState)
        .catch(async (error) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(`Auto-judging failed for ${sessionId}:`, errorMessage);

          try {
            const currentState = await prisma.debateSession.findUnique({
              where: { id: sessionId },
              select: { status: true },
            });

            if (currentState && currentState.status !== "FAILED") {
              await this.markAsFailed(sessionId, errorMessage, loadSessionState);
            }
          } catch (updateError) {
            logger.error(
              `Failed to mark debate ${sessionId} as failed:`,
              updateError
            );
          }
        })
        .finally(() => {
          this.judgingInProgress.delete(sessionId);
        });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Judging failed for ${sessionId}:`, errorMessage);
      try {
        await this.markAsFailed(sessionId, errorMessage, loadSessionState);
      } catch (updateError) {
        logger.error(
          `Failed to mark debate ${sessionId} as failed:`,
          updateError
        );
      }
      throw error;
    }
  }

  async performDebateJudgment(
    sessionId: string,
    state: SessionState,
    loadSessionState: (id: string) => Promise<SessionState | null>
  ): Promise<void> {
    try {
      const currentSession = await prisma.debateSession.findUnique({
        where: { id: sessionId },
        select: { status: true, winner: true },
      });

      if (
        !currentSession ||
        currentSession.status === "FAILED" ||
        currentSession.status !== "JUDGING" ||
        currentSession.winner
      ) {
        return;
      }

      if (state.winner) {
        return;
      }

      const transcript = this.buildTranscript(state);

      logger.info(`Requesting judgment from Gemini for session ${sessionId}`, {
        topic: state.topic,
        transcriptLength: transcript.length,
        turnCount: state.turns.length,
      });

      const judgeResult = await llmService.requestJudgmentFromGemini(
        state.topic,
        transcript
      );

      logger.info(`Gemini judgment completed for session ${sessionId}`, {
        winner: judgeResult.winner,
        tokensIn: judgeResult.tokensIn,
        tokensOut: judgeResult.tokensOut,
        durationMs: judgeResult.durationMs,
      });

      if (
        !judgeResult.winner ||
        !["A", "B", "TIE"].includes(judgeResult.winner)
      ) {
        throw new Error(`Invalid winner value: ${judgeResult.winner}`);
      }
      if (!judgeResult.judgeJSON) {
        throw new Error("Judge JSON is missing");
      }

      await this.saveJudgeResult(
        sessionId,
        judgeResult.winner,
        judgeResult.judgeJSON
      );

      const finishedState = await loadSessionState(sessionId);

      await this.broadcastToSession(sessionId, {
        type: "WINNER",
        winner: judgeResult.winner,
        judgeJSON: judgeResult.judgeJSON,
      });

      if (finishedState) {
        await this.broadcastToSession(sessionId, {
          type: "SESSION_STATE",
          data: finishedState,
        } as any);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Auto-judging failed for session ${sessionId}:`,
        errorMessage
      );
      throw error;
    }
  }

  async retryJudging(
    sessionId: string,
    loadSessionState: (id: string) => Promise<SessionState | null>
  ): Promise<void> {
    if (this.judgingInProgress.has(sessionId)) {
      throw new Error("Judging is already in progress for this debate");
    }

    try {
      const state = await loadSessionState(sessionId);
      if (!state) {
        throw new Error("Session not found");
      }

      if (state.status !== "FAILED") {
        throw new Error("Debate is not in FAILED status");
      }

      const currentTurnCount = state.turns.length;
      const totalTurns = state.rounds * 2;
      if (currentTurnCount < totalTurns) {
        throw new Error("Debate rounds are not complete");
      }

      await prisma.debateSession.update({
        where: { id: sessionId },
        data: {
          status: "JUDGING",
          winner: null,
          judgeJSON: undefined,
        },
      });

      this.judgingInProgress.add(sessionId);

      this.performDebateJudgment(sessionId, state, loadSessionState)
        .catch(async (error) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(
            `Retry auto-judging failed for ${sessionId}:`,
            errorMessage
          );

          try {
            await this.markAsFailed(sessionId, errorMessage, loadSessionState);
          } catch (updateError) {
            logger.error(
              `Failed to mark debate ${sessionId} as failed after retry:`,
              updateError
            );
          }
        })
        .finally(() => {
          this.judgingInProgress.delete(sessionId);
        });
    } catch (error) {
      logger.error(`Failed to retry judging for ${sessionId}:`, error);
      this.judgingInProgress.delete(sessionId);
      throw error;
    }
  }

  isJudgingInProgress(sessionId: string): boolean {
    return this.judgingInProgress.has(sessionId);
  }

  private async saveJudgeResult(
    sessionId: string,
    winner: "A" | "B" | "TIE",
    judgeJSON: any
  ): Promise<void> {
    await prisma.debateSession.update({
      where: { id: sessionId },
      data: {
        status: "FINISHED",
        winner: winner as DebateWinner,
        judgeJSON,
      },
    });

    logger.info("Debate finished", { sessionId, winner });
  }

  private buildTranscript(state: SessionState): string {
    return state.turns
      .map((turn) => {
        const speakerName =
          turn.speaker === "A" ? state.debaterAName : state.debaterBName;
        return `${speakerName}: ${turn.response}`;
      })
      .join("\n\n");
  }

  private async markAsFailed(
    sessionId: string,
    errorMessage: string,
    loadSessionState: (id: string) => Promise<SessionState | null>
  ): Promise<void> {
    await prisma.debateSession.update({
      where: { id: sessionId },
      data: {
        status: "FAILED",
        judgeJSON: {
          error: errorMessage,
          timestamp: new Date().toISOString(),
        },
      },
    });
    await this.broadcastToSession(sessionId, {
      type: "ERROR",
      message: "AI judging failed. Please retry judging.",
    } as any);
    const failedState = await loadSessionState(sessionId);
    if (failedState) {
      await this.broadcastToSession(sessionId, {
        type: "SESSION_STATE",
        data: failedState,
      } as any);
    }
  }

  private async broadcastToSession(
    sessionId: string,
    message: any
  ): Promise<void> {
    await redisPub.publish(
      "ws-events",
      JSON.stringify({
        sessionId,
        ...message,
      })
    );
  }
}

export const judgingManager = new JudgingManager();

