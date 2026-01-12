import { prisma, DebateWinner, TurnSpeaker } from "@repo/database";
import { llmService } from "../services/llm";
import { redisPub } from "../services/redis";
import { logger } from "../utils/logger";
import { CreateDebateRequest, SessionState } from "@repo/types";
import { randomBytes } from "crypto";

export class DebateOrchestrator {
  private pendingTurns = new Map<
    string,
    { orderIndex: number; speaker: "A" | "B" }
  >();
  private judgingInProgress = new Set<string>();
  private startingDebates = new Set<string>();

  private generateInviteToken(): string {
    return randomBytes(32).toString("base64url");
  }

  async createDebateSession(
    request: CreateDebateRequest,
    userId?: string
  ): Promise<{ id: string; wsUrl: string }> {
    try {
      const inviteToken = this.generateInviteToken();
      const inviteTokenExpiresAt = new Date();
      inviteTokenExpiresAt.setDate(inviteTokenExpiresAt.getDate() + 7);

      const session = await prisma.debateSession.create({
        data: {
          topic: request.topic,
          debaterAId: request.debaterAId || null,
          debaterBId: request.debaterBId || null,
          rounds: request.rounds,
          autoJudge: true,
          userId,
          status: "CREATED",
          inviteToken,
          inviteTokenExpiresAt,
        },
        include: {
          debaterA: true,
          debaterB: true,
        },
      });

      logger.info("Debate session created", {
        sessionId: session.id,
        topic: request.topic,
        userId,
      });

      return {
        id: session.id,
        wsUrl: `/api/ws?sessionId=${session.id}`,
      };
    } catch (error) {
      logger.error("Failed to create debate session", { error, request });
      throw error;
    }
  }

  async loadSessionState(sessionId: string): Promise<SessionState | null> {
    try {
      const session = await prisma.debateSession.findUnique({
        where: { id: sessionId },
        include: {
          turns: {
            orderBy: { orderIndex: "asc" },
          },
          debaterA: true,
          debaterB: true,
        },
      });

      if (!session) {
        return null;
      }

      return {
        id: session.id,
        topic: session.topic,
        debaterAId: session.debaterAId || undefined,
        debaterBId: session.debaterBId || undefined,
        debaterAName:
          session.debaterA?.name || session.debaterA?.email || "Debater A",
        debaterBName:
          session.debaterB?.name || session.debaterB?.email || "Debater B",
        rounds: session.rounds,
        status: session.status,
        winner: session.winner || undefined,
        judgeJSON: session.judgeJSON,
        autoJudge: session.autoJudge,
        turns: session.turns.map((turn) => ({
          id: turn.id,
          orderIndex: turn.orderIndex,
          speaker: turn.speaker,
          response: turn.response,
          createdAt: turn.createdAt,
        })),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      };
    } catch (error) {
      logger.error("Failed to load session state", { error, sessionId });
      throw error;
    }
  }

  async startDebate(sessionId: string): Promise<void> {
    if (this.startingDebates.has(sessionId)) {
      return;
    }

    try {
      this.startingDebates.add(sessionId);

      const state = await this.loadSessionState(sessionId);
      if (!state) {
        throw new Error("Session not found");
      }

      if (state.status !== "CREATED") {
        return;
      }

      if (!state.debaterAId || !state.debaterBId) {
        throw new Error(
          "Both debaters must be assigned before starting debate"
        );
      }

      const updateResult = await prisma.debateSession.updateMany({
        where: {
          id: sessionId,
          status: "CREATED",
        },
        data: { status: "RUNNING" },
      });

      if (updateResult.count === 0) {
        return;
      }

      await this.initiateNextTurn(sessionId);
    } catch (error) {
      logger.error("Failed to start debate", { sessionId, error });
      await prisma.debateSession.update({
        where: { id: sessionId },
        data: {
          status: "FAILED",
          judgeJSON: {
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          },
        },
      });
      await this.broadcastToSession(sessionId, {
        type: "ERROR",
        message: "Failed to start debate. Please try again.",
      });
      throw error;
    } finally {
      this.startingDebates.delete(sessionId);
    }
  }

  async initiateNextTurn(sessionId: string): Promise<void> {
    try {
      const state = await this.loadSessionState(sessionId);
      if (!state) {
        throw new Error("Session not found");
      }

      if (state.status !== "RUNNING") {
        return;
      }

      const currentTurnCount = state.turns.length;
      const totalTurns = state.rounds * 2;

      if (currentTurnCount >= totalTurns) {
        if (this.judgingInProgress.has(sessionId)) {
          return;
        }

        const currentSession = await prisma.debateSession.findUnique({
          where: { id: sessionId },
          select: { status: true, winner: true },
        });

        if (
          !currentSession ||
          currentSession.status !== "RUNNING" ||
          currentSession.winner
        ) {
          return;
        }

        await this.startJudging(sessionId);
        return;
      }

      const currentSpeaker: "A" | "B" = currentTurnCount % 2 === 0 ? "A" : "B";
      const orderIndex = currentTurnCount;

      const existingTurn = await prisma.debateTurn.findFirst({
        where: {
          sessionId,
          orderIndex,
        },
      });

      if (existingTurn) {
        this.pendingTurns.delete(sessionId);
        await this.initiateNextTurn(sessionId);
        return;
      }

      this.pendingTurns.set(sessionId, { orderIndex, speaker: currentSpeaker });

      await this.broadcastToSession(sessionId, {
        type: "YOUR_TURN",
        speaker: currentSpeaker,
        orderIndex,
      });

      logger.info("Turn initiated", {
        sessionId,
        orderIndex,
        speaker: currentSpeaker,
      });
    } catch (error) {
      logger.error("Failed to initiate next turn", { sessionId, error });
      throw error;
    }
  }

  async submitArgument(
    sessionId: string,
    userId: string,
    argument: string
  ): Promise<void> {
    try {
      const state = await this.loadSessionState(sessionId);
      if (!state) {
        throw new Error("Session not found");
      }

      if (state.status !== "RUNNING") {
        throw new Error("Debate is not running");
      }

      const pendingTurn = this.pendingTurns.get(sessionId);
      if (!pendingTurn) {
        throw new Error("No pending turn for this session");
      }

      const expectedOrderIndex = state.turns.length;
      if (pendingTurn.orderIndex !== expectedOrderIndex) {
        this.pendingTurns.delete(sessionId);
        throw new Error(
          `Invalid turn order. Expected ${expectedOrderIndex}, got ${pendingTurn.orderIndex}`
        );
      }

      const existingTurn = await prisma.debateTurn.findFirst({
        where: {
          sessionId,
          orderIndex: pendingTurn.orderIndex,
        },
      });

      if (existingTurn) {
        this.pendingTurns.delete(sessionId);
        const updatedState = await this.loadSessionState(sessionId);
        if (updatedState) {
          await this.broadcastToSession(sessionId, {
            type: "SESSION_STATE",
            data: updatedState,
          } as any);
        }
        throw new Error("Turn already submitted for this order");
      }

      const expectedDebaterId =
        pendingTurn.speaker === "A" ? state.debaterAId : state.debaterBId;
      if (userId !== expectedDebaterId) {
        throw new Error("It's not your turn to speak");
      }

      if (!argument || argument.trim().length < 10) {
        throw new Error("Argument must be at least 10 characters long");
      }

      if (argument.trim().length > 2000) {
        throw new Error("Argument must be less than 2000 characters");
      }

      const turn = await prisma.debateTurn
        .create({
          data: {
            sessionId,
            orderIndex: pendingTurn.orderIndex,
            speaker: pendingTurn.speaker as TurnSpeaker,
            response: argument.trim(),
          },
        })
        .catch(async (error: any) => {
          if (
            error.code === "P2002" ||
            error.meta?.target?.includes("sessionId_orderIndex")
          ) {
            this.pendingTurns.delete(sessionId);
            const updatedState = await this.loadSessionState(sessionId);
            if (updatedState) {
              await this.broadcastToSession(sessionId, {
                type: "SESSION_STATE",
                data: updatedState,
              } as any);
            }
            throw new Error("Turn already submitted");
          }
          throw error;
        });

      this.pendingTurns.delete(sessionId);

      // Broadcast updated session state after turn is submitted
      const updatedState = await this.loadSessionState(sessionId);
      if (updatedState) {
        await this.broadcastToSession(sessionId, {
          type: "SESSION_STATE",
          data: updatedState,
        } as any);
      }

      await this.initiateNextTurn(sessionId);
    } catch (error) {
      logger.error("Failed to submit argument", { sessionId, userId, error });
      throw error;
    }
  }

  async assignDebater(
    sessionId: string,
    position: "A" | "B",
    userId: string
  ): Promise<void> {
    try {
      const session = await prisma.debateSession.findUnique({
        where: { id: sessionId },
        select: { debaterAId: true, debaterBId: true, status: true },
      });

      if (!session) {
        throw new Error("Session not found");
      }

      const currentDebaterId =
        position === "A" ? session.debaterAId : session.debaterBId;
      if (currentDebaterId && currentDebaterId !== userId) {
        throw new Error(
          `Position ${position} is already assigned to another user`
        );
      }

      if (currentDebaterId === userId) {
        return;
      }

      if (session.status !== "CREATED") {
        throw new Error(
          `Cannot reassign debater when debate is ${session.status}`
        );
      }

      const otherPositionId =
        position === "A" ? session.debaterBId : session.debaterAId;
      if (otherPositionId === userId) {
        throw new Error("User cannot be assigned to both positions");
      }

      const updateData: any = {};
      if (position === "A") {
        updateData.debaterAId = userId;
      } else {
        updateData.debaterBId = userId;
      }

      await prisma.debateSession.update({
        where: { id: sessionId },
        data: updateData,
      });

      const updatedState = await this.loadSessionState(sessionId);
      if (updatedState) {
        await this.broadcastToSession(sessionId, {
          type: "SESSION_STATE",
          data: updatedState,
        } as any);
      }
    } catch (error) {
      logger.error("Failed to assign debater", {
        sessionId,
        position,
        userId,
        error,
      });
      throw error;
    }
  }

  async getInvitationLink(
    sessionId: string
  ): Promise<{ inviteToken: string; inviteUrl: string } | null> {
    try {
      const sessionExists = await prisma.debateSession.findUnique({
        where: { id: sessionId },
        select: { id: true },
      });

      if (!sessionExists) {
        return null;
      }

      let session;
      try {
        session = await prisma.debateSession.findUnique({
          where: { id: sessionId },
          select: { inviteToken: true, inviteTokenExpiresAt: true },
        });
      } catch (error: any) {
        if (error.message?.includes("inviteToken") || error.code === "P2021") {
          throw new Error(
            "Database migration required. Please run: pnpm db:migrate"
          );
        }
        throw error;
      }

      if (!session) {
        return null;
      }

      const needsNewToken =
        !session.inviteToken ||
        (session.inviteTokenExpiresAt &&
          new Date() > session.inviteTokenExpiresAt);

      if (needsNewToken) {
        const newToken = this.generateInviteToken();
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + 7);

        await prisma.debateSession.update({
          where: { id: sessionId },
          data: {
            inviteToken: newToken,
            inviteTokenExpiresAt: newExpiresAt,
          },
        });

        return {
          inviteToken: newToken,
          inviteUrl: `/debate/${sessionId}?invite=${newToken}`,
        };
      }

      if (!session.inviteToken) {
        const newToken = this.generateInviteToken();
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + 7);

        await prisma.debateSession.update({
          where: { id: sessionId },
          data: {
            inviteToken: newToken,
            inviteTokenExpiresAt: newExpiresAt,
          },
        });

        return {
          inviteToken: newToken,
          inviteUrl: `/debate/${sessionId}?invite=${newToken}`,
        };
      }

      return {
        inviteToken: session.inviteToken,
        inviteUrl: `/debate/${sessionId}?invite=${session.inviteToken}`,
      };
    } catch (error) {
      logger.error("Failed to get invitation link", { sessionId, error });
      throw error;
    }
  }

  async acceptInvitation(
    sessionId: string,
    token: string,
    userId: string
  ): Promise<boolean> {
    try {
      const session = await prisma.debateSession.findUnique({
        where: { id: sessionId },
        select: {
          inviteToken: true,
          inviteTokenExpiresAt: true,
          debaterAId: true,
          debaterBId: true,
          status: true,
        },
      });

      if (!session) {
        return false;
      }

      if (session.inviteToken !== token) {
        return false;
      }

      if (
        session.inviteTokenExpiresAt &&
        new Date() > session.inviteTokenExpiresAt
      ) {
        return false;
      }

      if (session.debaterBId) {
        return false;
      }

      if (session.debaterAId === userId) {
        return false;
      }

      await this.assignDebater(sessionId, "B", userId);

      const updatedState = await this.loadSessionState(sessionId);
      if (
        updatedState &&
        updatedState.status === "CREATED" &&
        updatedState.debaterAId &&
        updatedState.debaterBId
      ) {
        try {
          await this.startDebate(sessionId);
        } catch (error) {
          logger.error(
            "Failed to auto-start debate after invitation acceptance",
            {
              sessionId,
              error,
            }
          );
        }
      }

      return true;
    } catch (error) {
      logger.error("Failed to accept invitation", {
        sessionId,
        token,
        userId,
        error,
      });
      return false;
    }
  }

  private async startJudging(sessionId: string): Promise<void> {
    if (this.judgingInProgress.has(sessionId)) {
      return;
    }

    try {
      await prisma.debateSession.update({
        where: { id: sessionId },
        data: { status: "JUDGING" },
      });

      const state = await this.loadSessionState(sessionId);
      if (!state) throw new Error("Session not found");

      if (state.winner) {
        return;
      }

      this.judgingInProgress.add(sessionId);

      this.autoJudgeDebate(sessionId)
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
              const failedState = await this.loadSessionState(sessionId);
              if (failedState) {
                await this.broadcastToSession(sessionId, {
                  type: "SESSION_STATE",
                  data: failedState,
                } as any);
              }
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
      } catch (updateError) {
        logger.error(
          `Failed to mark debate ${sessionId} as failed:`,
          updateError
        );
      }
      throw error;
    }
  }

  async autoJudgeDebate(sessionId: string): Promise<void> {
    try {
      const currentSession = await prisma.debateSession.findUnique({
        where: { id: sessionId },
        select: { status: true, winner: true },
      });

      if (!currentSession) {
        throw new Error("Session not found");
      }

      if (
        currentSession.status === "FAILED" ||
        currentSession.status !== "JUDGING" ||
        currentSession.winner
      ) {
        return;
      }

      const state = await this.loadSessionState(sessionId);
      if (!state) {
        throw new Error("Session not found");
      }

      if (state.winner) {
        return;
      }

      const transcript = this.buildTranscript(state);

      logger.info(`Calling LLM judgeDebate for session ${sessionId}`, {
        topic: state.topic,
        transcriptLength: transcript.length,
        turnCount: state.turns.length,
      });

      const judgeResult = await llmService.judgeDebate(state.topic, transcript);

      logger.info(`LLM judgeDebate completed for session ${sessionId}`, {
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

      const finishedState = await this.loadSessionState(sessionId);

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

  async retryJudging(sessionId: string): Promise<void> {
    try {
      const state = await this.loadSessionState(sessionId);
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

      if (this.judgingInProgress.has(sessionId)) {
        throw new Error("Judging is already in progress for this debate");
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

      this.autoJudgeDebate(sessionId)
        .catch(async (error) => {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(
            `Retry auto-judging failed for ${sessionId}:`,
            errorMessage
          );

          try {
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
            const failedState = await this.loadSessionState(sessionId);
            if (failedState) {
              await this.broadcastToSession(sessionId, {
                type: "SESSION_STATE",
                data: failedState,
              } as any);
            }
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

  async recoverPendingTurns(): Promise<void> {
    try {
      const runningDebates = await prisma.debateSession.findMany({
        where: { status: "RUNNING" },
        include: {
          turns: {
            orderBy: { orderIndex: "asc" },
          },
        },
      });

      logger.info("Recovering pending turns", {
        count: runningDebates.length,
      });

      for (const debate of runningDebates) {
        try {
          const currentTurnCount = debate.turns.length;
          const totalTurns = debate.rounds * 2;

          if (currentTurnCount >= totalTurns) {
            await this.startJudging(debate.id);
            continue;
          }

          const expectedOrderIndex = currentTurnCount;
          const currentSpeaker: "A" | "B" =
            expectedOrderIndex % 2 === 0 ? "A" : "B";

          const existingTurn = await prisma.debateTurn.findFirst({
            where: {
              sessionId: debate.id,
              orderIndex: expectedOrderIndex,
            },
          });

          if (existingTurn) {
            await this.initiateNextTurn(debate.id);
            continue;
          }

          this.pendingTurns.set(debate.id, {
            orderIndex: expectedOrderIndex,
            speaker: currentSpeaker,
          });

          await this.broadcastToSession(debate.id, {
            type: "YOUR_TURN",
            speaker: currentSpeaker,
            orderIndex: expectedOrderIndex,
          });
        } catch (error) {
          logger.error("Failed to recover pending turn for debate", {
            sessionId: debate.id,
            error,
          });
        }
      }

      logger.info("Pending turns recovery completed");
    } catch (error) {
      logger.error("Failed to recover pending turns", { error });
      throw error;
    }
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

export const debateOrchestrator = new DebateOrchestrator();
