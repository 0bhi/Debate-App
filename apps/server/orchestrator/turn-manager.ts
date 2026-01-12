import { prisma, TurnSpeaker } from "@repo/database";
import { logger } from "../utils/logger";
import { SessionState } from "@repo/types";
import { redisPub } from "../services/redis";

export class TurnManager {
  private pendingTurns = new Map<
    string,
    { orderIndex: number; speaker: "A" | "B" }
  >();

  async initiateNextTurn(
    sessionId: string,
    state: SessionState,
    onJudgingNeeded: (sessionId: string) => Promise<void>
  ): Promise<void> {
    try {
      if (state.status !== "RUNNING") {
        return;
      }

      const currentTurnCount = state.turns.length;
      const totalTurns = state.rounds * 2;

      if (currentTurnCount >= totalTurns) {
        await onJudgingNeeded(sessionId);
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
    argument: string,
    state: SessionState,
    onNextTurn: (sessionId: string) => Promise<void>,
    loadSessionState: (id: string) => Promise<SessionState | null>,
    broadcastToSession: (sessionId: string, message: any) => Promise<void>
  ): Promise<void> {
    try {
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
        const updatedState = await loadSessionState(sessionId);
        if (updatedState) {
          await broadcastToSession(sessionId, {
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
            const updatedState = await loadSessionState(sessionId);
            if (updatedState) {
              await broadcastToSession(sessionId, {
                type: "SESSION_STATE",
                data: updatedState,
              } as any);
            }
            throw new Error("Turn already submitted");
          }
          throw error;
        });

      this.pendingTurns.delete(sessionId);

      const updatedState = await loadSessionState(sessionId);
      if (updatedState) {
        await broadcastToSession(sessionId, {
          type: "SESSION_STATE",
          data: updatedState,
        } as any);
      }

      await onNextTurn(sessionId);
    } catch (error) {
      logger.error("Failed to submit argument", { sessionId, userId, error });
      throw error;
    }
  }

  getPendingTurn(sessionId: string) {
    return this.pendingTurns.get(sessionId);
  }

  setPendingTurn(
    sessionId: string,
    turn: { orderIndex: number; speaker: "A" | "B" }
  ) {
    this.pendingTurns.set(sessionId, turn);
  }

  deletePendingTurn(sessionId: string) {
    this.pendingTurns.delete(sessionId);
  }

  async recoverPendingTurns(
    loadSessionState: (id: string) => Promise<SessionState | null>,
    onJudgingNeeded: (sessionId: string) => Promise<void>
  ): Promise<void> {
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
            await onJudgingNeeded(debate.id);
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
            const state = await loadSessionState(debate.id);
            if (state) {
              await this.initiateNextTurn(debate.id, state, onJudgingNeeded);
            }
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

export const turnManager = new TurnManager();
