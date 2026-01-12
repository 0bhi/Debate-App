import { IncomingMessage } from "http";
import { parse as parseUrl } from "url";
import { debateOrchestrator } from "../orchestrator/debateOrchestrator";
import { logger } from "../utils/logger";
import { env } from "../env";
import { verifyNextAuthToken, extractTokenFromRequest } from "../services/auth";
import { prisma } from "@repo/database";

export async function verifyClient(
  info: { req: IncomingMessage }
): Promise<boolean> {
  try {
    const url = parseUrl(info.req.url || "", true);
    const sessionId = url.query.sessionId as string;

    if (!sessionId) {
      logger.warn("WebSocket connection rejected: missing sessionId");
      return false;
    }

    // Authenticate user first
    const token = extractTokenFromRequest(info.req);
    if (!token) {
      logger.warn(
        "WebSocket connection rejected: missing authentication token",
        {
          sessionId,
        }
      );
      return false;
    }

    const decoded = verifyNextAuthToken(token);
    if (!decoded || !decoded.sub) {
      logger.warn(
        "WebSocket connection rejected: invalid authentication token",
        {
          sessionId,
        }
      );
      return false;
    }

    const userId = decoded.sub;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      logger.warn("WebSocket connection rejected: user not found", {
        sessionId,
        userId,
      });
      return false;
    }

    // Verify session exists and user is authorized to access it
    const session = await debateOrchestrator.loadSessionState(sessionId);
    if (!session) {
      logger.warn("WebSocket connection rejected: invalid sessionId", {
        sessionId,
        userId,
        environment: env.NODE_ENV,
      });
      return false;
    }

    // Authorization check: user must be either:
    // 1. The creator (userId)
    // 2. Debater A or B
    // 3. Joining with a valid invitation token (will be handled in acceptInvitation flow)
    // For now, allow if user is creator or assigned debater, or if debate is still in CREATED state (allowing invitation flow)
    const isAuthorized =
      session.userId === userId ||
      session.debaterAId === userId ||
      session.debaterBId === userId ||
      session.status === "CREATED"; // Allow connection if debate is still being set up (for invitation flow)

    if (!isAuthorized) {
      logger.warn("WebSocket connection rejected: user not authorized for session", {
        sessionId,
        userId,
        sessionUserId: session.userId,
        debaterAId: session.debaterAId,
        debaterBId: session.debaterBId,
        status: session.status,
      });
      return false;
    }

    (info.req as any).authenticatedUserId = userId;

    if (
      env.NODE_ENV === "development" &&
      process.env.VERBOSE_WS_LOGS === "true"
    ) {
      logger.info("WebSocket connection verified and authorized", {
        sessionId,
        userId,
        authorized: true,
      });
    }

    return true;
  } catch (error) {
    logger.error("WebSocket verification failed", {
      error,
      environment: env.NODE_ENV,
    });
    return false;
  }
}

export function extractUserIdFromRequest(req: IncomingMessage): string | undefined {
  let userId = (req as any).authenticatedUserId as string | undefined;

  if (!userId) {
    const token = extractTokenFromRequest(req);
    if (token) {
      const decoded = verifyNextAuthToken(token);
      if (decoded?.sub) {
        userId = decoded.sub;
        (req as any).authenticatedUserId = userId;
      }
    }
  }

  return userId;
}

