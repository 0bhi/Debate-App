import { AuthenticatedWebSocket } from "./types";
import { debateOrchestrator } from "../orchestrator/debateOrchestrator";
import { logger } from "../utils/logger";
import { ServerMessage } from "@repo/types";

export async function handleJoinSession(
  ws: AuthenticatedWebSocket,
  sessionId: string,
  broadcastToSession: (sessionId: string, message: ServerMessage) => void,
  sendToClient: (ws: AuthenticatedWebSocket, message: ServerMessage) => void,
  handleDebaterAssignment: (
    sessionId: string,
    userId: string,
    sessionState: any
  ) => Promise<void>
): Promise<void> {

  const sessionState = await debateOrchestrator.loadSessionState(sessionId);
  if (sessionState && ws.userId) {
    await handleDebaterAssignment(sessionId, ws.userId, sessionState);

    const updatedState = await debateOrchestrator.loadSessionState(sessionId);
    if (updatedState) {
      broadcastToSession(sessionId, {
        type: "SESSION_STATE",
        data: updatedState,
      } as ServerMessage);

      if (
        updatedState.status === "CREATED" &&
        updatedState.debaterAId &&
        updatedState.debaterBId
      ) {
        try {
          const verifyState =
            await debateOrchestrator.loadSessionState(sessionId);
          if (verifyState?.status === "CREATED") {
            await debateOrchestrator.startDebate(sessionId);
          } else {
            logger.info(
              "Debate status changed before auto-start in handleJoinSession, skipping",
              {
                sessionId,
                status: verifyState?.status,
              }
            );
          }
        } catch (error) {
          logger.error("Failed to auto-start debate in handleJoinSession", {
            sessionId,
            error,
          });
        }
      }
    }
  } else if (sessionState) {
    sendToClient(ws, {
      type: "SESSION_STATE",
      data: sessionState,
    } as ServerMessage);
  }
}

export async function handleRequestState(
  ws: AuthenticatedWebSocket,
  sessionId: string,
  sendToClient: (ws: AuthenticatedWebSocket, message: ServerMessage) => void
): Promise<void> {
  try {
    const sessionState = await debateOrchestrator.loadSessionState(sessionId);
    if (sessionState) {
      sendToClient(ws, {
        type: "SESSION_STATE",
        data: sessionState,
      } as ServerMessage);
    }
  } catch (error) {
    logger.error("Failed to get session state", { sessionId, error });
  }
}

export async function handleSubmitArgument(
  ws: AuthenticatedWebSocket,
  sessionId: string,
  argument: string,
  sendToClient: (ws: AuthenticatedWebSocket, message: ServerMessage) => void
): Promise<void> {
  try {
    const userId = ws.userId;
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const sessionState = await debateOrchestrator.loadSessionState(sessionId);
    if (!sessionState) {
      throw new Error("Debate session not found");
    }

    const isDebaterA = sessionState.debaterAId === userId;
    const isDebaterB = sessionState.debaterBId === userId;

    if (!isDebaterA && !isDebaterB) {
      logger.warn("Unauthorized argument submission attempt", {
        sessionId,
        userId,
        debaterAId: sessionState.debaterAId,
        debaterBId: sessionState.debaterBId,
      });
      throw new Error("Only assigned debaters can submit arguments");
    }

    await debateOrchestrator.submitArgument(sessionId, userId, argument);
  } catch (error: any) {
    logger.error("Failed to submit argument", {
      sessionId,
      userId: ws.userId,
      error,
    });
    sendToClient(ws, {
      type: "ERROR",
      message: error.message || "Failed to submit argument",
    } as ServerMessage);
  }
}

