import { prisma } from "@repo/database";
import { logger } from "../utils/logger";
import { randomBytes } from "crypto";

export class InvitationManager {
  private generateInviteToken(): string {
    return randomBytes(32).toString("base64url");
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

      if (needsNewToken || !session.inviteToken) {
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

  async createInviteToken(sessionId: string): Promise<string> {
    const token = this.generateInviteToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.debateSession.update({
      where: { id: sessionId },
      data: {
        inviteToken: token,
        inviteTokenExpiresAt: expiresAt,
      },
    });

    return token;
  }

  generateTokenForNewSession(): string {
    return this.generateInviteToken();
  }
}

export const invitationManager = new InvitationManager();
