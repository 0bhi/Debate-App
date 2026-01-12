import { prisma } from "@repo/database";
import { logger } from "../utils/logger";
import { CreateDebateRequest, SessionState } from "@repo/types";
import { invitationManager } from "./invitation-manager";
import { judgingManager } from "./judging-manager";
import { turnManager } from "./turn-manager";
import { redisPub } from "../services/redis";

export class DebateOrchestrator {
  private startingDebates = new Set<string>();

  async createDebateSession(
    request: CreateDebateRequest,
    userId?: string
  ): Promise<{ id: string; wsUrl: string }> {
    try {
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
          inviteToken: invitationManager.generateTokenForNewSession(),
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
        userId: session.userId || undefined,
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
    const state = await this.loadSessionState(sessionId);
    if (!state) {
      throw new Error("Session not found");
    }

    if (judgingManager.isJudgingInProgress(sessionId)) {
      return;
    }

    await turnManager.initiateNextTurn(sessionId, state, (id) =>
      this.coordinateJudgingSession(id)
    );
  }

  async submitArgument(
    sessionId: string,
    userId: string,
    argument: string
  ): Promise<void> {
    const state = await this.loadSessionState(sessionId);
    if (!state) {
      throw new Error("Session not found");
    }

    await turnManager.submitArgument(
      sessionId,
      userId,
      argument,
      state,
      (id) => this.initiateNextTurn(id),
      (id) => this.loadSessionState(id),
      (id, msg) => this.broadcastToSession(id, msg)
    );
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
    return invitationManager.getInvitationLink(sessionId);
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

  private async coordinateJudgingSession(sessionId: string): Promise<void> {
    await judgingManager.coordinateJudgingSession(sessionId, (id) =>
      this.loadSessionState(id)
    );
  }

  async performDebateJudgment(sessionId: string): Promise<void> {
    const state = await this.loadSessionState(sessionId);
    if (!state) {
      throw new Error("Session not found");
    }
    await judgingManager.performDebateJudgment(sessionId, state, (id) =>
      this.loadSessionState(id)
    );
  }

  async retryJudging(sessionId: string): Promise<void> {
    await judgingManager.retryJudging(sessionId, (id) =>
      this.loadSessionState(id)
    );
  }

  async recoverPendingTurns(): Promise<void> {
    await turnManager.recoverPendingTurns(
      (id) => this.loadSessionState(id),
      (id) => this.coordinateJudgingSession(id)
    );
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
