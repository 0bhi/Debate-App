import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { parse as parseUrl } from "url";
import { redisSub } from "../services/redis";
import { debateOrchestrator } from "../orchestrator/debateOrchestrator";
import { logger } from "../utils/logger";
import { env } from "../env";
import { ServerMessage, ClientMessageSchema } from "@repo/types";
import { verifyNextAuthToken, extractTokenFromRequest } from "../services/auth";
import { prisma } from "@repo/database";

interface AuthenticatedWebSocket extends WebSocket {
  sessionId?: string;
  userId?: string;
  isAlive?: boolean;
}

export class DebateWebSocketServer {
  private wss: WebSocketServer;
  private clients = new Map<string, Set<AuthenticatedWebSocket>>();

  constructor(port: number = env.WS_PORT) {
    try {
      this.wss = new WebSocketServer({
        port,
        verifyClient: this.verifyClient.bind(this),
      });

      this.setupEventHandlers();
      this.setupRedisSubscription();
      this.setupHeartbeat();

      logger.info(`WebSocket server started on port ${port}`);
    } catch (error) {
      logger.error("Failed to create WebSocket server", { error, port });
      throw error;
    }
  }

  private async verifyClient(info: { req: IncomingMessage }): Promise<boolean> {
    try {
      const url = parseUrl(info.req.url || "", true);
      const sessionId = url.query.sessionId as string;

      if (!sessionId) {
        logger.warn("WebSocket connection rejected: missing sessionId");
        return false;
      }

      // Verify debate session exists
      const session = await debateOrchestrator.loadSessionState(sessionId);
      if (!session) {
        logger.warn("WebSocket connection rejected: invalid sessionId", {
          sessionId,
          environment: env.NODE_ENV,
        });
        return false;
      }

      // Extract and verify JWT token
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

      // Verify user has access to this debate session
      // User can access if they are:
      // 1. The creator (userId matches session.userId)
      // 2. Debater A (userId matches session.debaterAId)
      // 3. Debater B (userId matches session.debaterBId)
      // 4. Or if the session is public (no specific access control needed for viewing)
      // For now, we allow authenticated users to connect to any session
      // but we'll enforce permissions in message handlers

      // Verify user exists in database
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

      // Store authenticated userId in request for use in handleConnection
      (info.req as any).authenticatedUserId = userId;

      // Only log in development if verbose logging is enabled
      // Reduce log noise from frequent connections
      if (
        env.NODE_ENV === "development" &&
        process.env.VERBOSE_WS_LOGS === "true"
      ) {
        logger.info("WebSocket connection verified", {
          sessionId,
          userId,
        });
      }

      return true;
    } catch (error) {
      logger.error("WebSocket verification failed", {
        error,
        environment: env.NODE_ENV,
      });
      // Always reject on verification errors for security
      return false;
    }
  }

  private setupEventHandlers(): void {
    this.wss.on(
      "connection",
      (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
        this.handleConnection(ws, req);
      }
    );

    this.wss.on("error", (error) => {
      logger.error("WebSocket server error", { error });
    });
  }

  private async handleConnection(
    ws: AuthenticatedWebSocket,
    req: IncomingMessage
  ): Promise<void> {
    const url = parseUrl(req.url || "", true);
    const sessionId = url.query.sessionId as string;

    // Get authenticated userId from verifyClient (stored in req)
    // Fallback: extract and verify token again if not found (handles race conditions)
    let userId = (req as any).authenticatedUserId as string | undefined;

    if (!userId) {
      // Fallback: try to extract and verify token directly
      // This handles cases where verifyClient and handleConnection might have race conditions
      const token = extractTokenFromRequest(req);
      if (token) {
        const decoded = verifyNextAuthToken(token);
        if (decoded?.sub) {
          userId = decoded.sub;
          // Store it for consistency
          (req as any).authenticatedUserId = userId;
        }
      }

      if (!userId) {
        // Only log error if we truly can't get the userId
        logger.error("WebSocket connection missing authenticated userId", {
          sessionId,
          hasToken: !!token,
        });
        ws.close(1008, "Authentication failed");
        return;
      }
    }

    ws.sessionId = sessionId;
    ws.userId = userId; // Use authenticated userId from JWT token
    ws.isAlive = true;

    // Add client to session group early to ensure proper registration
    if (!this.clients.has(sessionId)) {
      this.clients.set(sessionId, new Set());
    }
    this.clients.get(sessionId)!.add(ws);

    // Only log connection in development with verbose logging
    // This reduces log noise from frequent reconnections
    if (
      env.NODE_ENV === "development" &&
      process.env.VERBOSE_WS_LOGS === "true"
    ) {
      logger.info("WebSocket client connected", {
        sessionId,
        userId,
        clientCount: this.clients.get(sessionId)?.size || 0,
      });
    }

    // Load session state and handle debater assignment
    try {
      const sessionState = await debateOrchestrator.loadSessionState(sessionId);
      if (!sessionState) {
        this.sendToClient(ws, {
          type: "ERROR",
          message: "Debate session not found",
        } as ServerMessage);
        ws.close(1008, "Session not found");
        // Remove client from session group on error
        this.clients.get(sessionId)?.delete(ws);
        if (this.clients.get(sessionId)?.size === 0) {
          this.clients.delete(sessionId);
        }
        return;
      }

      // If user is authenticated, try to assign them as a debater
      if (userId) {
        await this.handleDebaterAssignment(sessionId, userId, sessionState);
      }

      // Reload session state after assignment (in case it changed)
      const updatedState = await debateOrchestrator.loadSessionState(sessionId);
      if (updatedState) {
        // Broadcast updated session state to all clients in this session
        this.broadcastToSession(sessionId, {
          type: "SESSION_STATE",
          data: updatedState,
        } as ServerMessage);

        // Auto-start debate if both debaters are assigned and debate is in CREATED status
        // Note: startDebate now has its own lock mechanism, so we don't need to double-check here
        if (
          updatedState.status === "CREATED" &&
          updatedState.debaterAId &&
          updatedState.debaterBId
        ) {
          logger.info("Both debaters assigned, auto-starting debate", {
            sessionId,
            debaterAId: updatedState.debaterAId,
            debaterBId: updatedState.debaterBId,
          });
          try {
            // startDebate has its own lock mechanism and atomic status check
            await debateOrchestrator.startDebate(sessionId);
          } catch (error) {
            logger.error("Failed to auto-start debate", { sessionId, error });
          }
        }
      }
    } catch (error) {
      logger.error("Failed to handle connection", { sessionId, userId, error });
      this.sendToClient(ws, {
        type: "ERROR",
        message: "Failed to initialize connection",
      } as ServerMessage);
      // Ensure client is still registered even if there's an error
      // (they might still be able to receive updates)
    }

    // Handle incoming messages
    ws.on("message", (data: Buffer) => {
      this.handleMessage(ws, data);
    });

    // Handle disconnect
    ws.on("close", () => {
      this.handleDisconnect(ws);
    });

    // Handle pong (heartbeat response)
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("error", (error) => {
      logger.error("WebSocket client error", { sessionId, error });
    });
  }

  private async handleMessage(
    ws: AuthenticatedWebSocket,
    data: Buffer
  ): Promise<void> {
    try {
      const rawMessage = JSON.parse(data.toString());
      const message = ClientMessageSchema.parse(rawMessage);

      logger.info("WebSocket message received", {
        sessionId: ws.sessionId,
        type: (message as any).type,
      });

      switch (message.type) {
        case "JOIN_SESSION":
          logger.info("Handling JOIN_SESSION", {
            sessionId: message.sessionId,
          });
          await this.handleJoinSession(ws, message.sessionId);
          break;

        case "REQUEST_STATE":
          await this.handleRequestState(ws, message.sessionId);
          break;

        case "SUBMIT_ARGUMENT":
          await this.handleSubmitArgument(
            ws,
            message.sessionId,
            message.argument
          );
          break;

        case "PING":
          this.sendToClient(ws, { type: "HEARTBEAT" });
          break;

        default:
          logger.warn("Unknown message type", { type: (message as any).type });
      }
    } catch (error) {
      logger.error("Failed to handle WebSocket message", {
        sessionId: ws.sessionId,
        error,
      });

      this.sendToClient(ws, {
        type: "ERROR",
        message: "Invalid message format",
      } as ServerMessage);
    }
  }

  private async handleJoinSession(
    ws: AuthenticatedWebSocket,
    sessionId: string
  ): Promise<void> {
    if (ws.sessionId !== sessionId) {
      // Move client to new session
      if (ws.sessionId) {
        this.clients.get(ws.sessionId)?.delete(ws);
      }

      ws.sessionId = sessionId;

      if (!this.clients.has(sessionId)) {
        this.clients.set(sessionId, new Set());
      }
      this.clients.get(sessionId)!.add(ws);
    }

    // Load session state and handle debater assignment
    const sessionState = await debateOrchestrator.loadSessionState(sessionId);
    if (sessionState && ws.userId) {
      await this.handleDebaterAssignment(sessionId, ws.userId, sessionState);

      // Reload and broadcast updated state
      const updatedState = await debateOrchestrator.loadSessionState(sessionId);
      if (updatedState) {
        // Broadcast to all clients
        this.broadcastToSession(sessionId, {
          type: "SESSION_STATE",
          data: updatedState,
        } as ServerMessage);

        // Check if we should auto-start (with race condition protection)
        if (
          updatedState.status === "CREATED" &&
          updatedState.debaterAId &&
          updatedState.debaterBId
        ) {
          try {
            // Double-check status hasn't changed (race condition protection)
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
      // If no userId but session exists, just send state
      this.sendToClient(ws, {
        type: "SESSION_STATE",
        data: sessionState,
      } as ServerMessage);
    }
  }

  private async handleDebaterAssignment(
    sessionId: string,
    userId: string,
    sessionState: any
  ): Promise<void> {
    try {
      // If user is already assigned as debater A or B, do nothing
      if (
        sessionState.debaterAId === userId ||
        sessionState.debaterBId === userId
      ) {
        logger.info("User already assigned to debate", {
          sessionId,
          userId,
          debaterAId: sessionState.debaterAId,
          debaterBId: sessionState.debaterBId,
        });
        return;
      }

      // If debater A is not assigned, assign this user as debater A (creator)
      if (!sessionState.debaterAId) {
        logger.info("Assigning user as debater A", { sessionId, userId });
        await debateOrchestrator.assignDebater(sessionId, "A", userId);
        return;
      }

      // Debater B assignment should only happen via invitation token (handled via API)
      // If user is not assigned and debater B slot is open, they need an invitation
      if (sessionState.debaterAId && !sessionState.debaterBId) {
        if (sessionState.debaterAId !== userId) {
          logger.info(
            "Debater B slot is open but user needs invitation token",
            {
              sessionId,
              userId,
            }
          );
          // Don't auto-assign - user must use invitation link
          return;
        }
      }

      // Both debaters are already assigned, user is neither
      logger.info(
        "Debate already has both debaters assigned or user needs invitation",
        {
          sessionId,
          userId,
          debaterAId: sessionState.debaterAId,
          debaterBId: sessionState.debaterBId,
        }
      );
    } catch (error) {
      logger.error("Failed to assign debater", { sessionId, userId, error });
      throw error;
    }
  }

  private async handleRequestState(
    ws: AuthenticatedWebSocket,
    sessionId: string
  ): Promise<void> {
    try {
      const sessionState = await debateOrchestrator.loadSessionState(sessionId);
      if (sessionState) {
        this.sendToClient(ws, {
          type: "SESSION_STATE",
          data: sessionState,
        } as ServerMessage);
      }
    } catch (error) {
      logger.error("Failed to get session state", { sessionId, error });
    }
  }

  private async handleSubmitArgument(
    ws: AuthenticatedWebSocket,
    sessionId: string,
    argument: string
  ): Promise<void> {
    try {
      const userId = ws.userId;
      if (!userId) {
        throw new Error("User not authenticated");
      }

      // Verify user is authorized to submit arguments (must be debater A or B)
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
      this.sendToClient(ws, {
        type: "ERROR",
        message: error.message || "Failed to submit argument",
      } as ServerMessage);
    }
  }

  private handleDisconnect(ws: AuthenticatedWebSocket): void {
    if (ws.sessionId) {
      this.clients.get(ws.sessionId)?.delete(ws);

      // Clean up empty session groups
      if (this.clients.get(ws.sessionId)?.size === 0) {
        this.clients.delete(ws.sessionId);
      }

      logger.info("WebSocket client disconnected", {
        sessionId: ws.sessionId,
        remainingClients: this.clients.get(ws.sessionId)?.size || 0,
      });
    }
  }

  private setupRedisSubscription(): void {
    redisSub.subscribe("ws-events", (err) => {
      if (err) {
        logger.error("Failed to subscribe to Redis channel", { error: err });
      } else {
        logger.info("Subscribed to ws-events Redis channel");
      }
    });

    redisSub.on("message", (channel, message) => {
      if (channel === "ws-events") {
        this.handleRedisMessage(message);
      }
    });
  }

  private handleRedisMessage(message: string): void {
    try {
      const data = JSON.parse(message);
      const { sessionId, ...messageData } = data;

      if (sessionId && this.clients.has(sessionId)) {
        this.broadcastToSession(sessionId, messageData);
      }
    } catch (error) {
      logger.error("Failed to handle Redis message", { error, message });
    }
  }

  private setupHeartbeat(): void {
    const interval = setInterval(() => {
      this.wss.clients.forEach((ws: AuthenticatedWebSocket) => {
        if (!ws.isAlive) {
          ws.terminate();
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds

    this.wss.on("close", () => {
      clearInterval(interval);
    });
  }

  public broadcastToSession(
    sessionId: string,
    message: Omit<ServerMessage, "sessionId">
  ): void {
    const clients = this.clients.get(sessionId);
    if (!clients) return;

    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        this.sendToClient(client, message);
      }
    });
  }

  private sendToClient(
    ws: WebSocket,
    message: Omit<ServerMessage, "sessionId">
  ): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error("Failed to send message to client", { error });
    }
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        logger.info("WebSocket server closed");
        resolve();
      });
    });
  }
}

// Export singleton instance
let wsServer: DebateWebSocketServer | null = null;

export function getWebSocketServer(): DebateWebSocketServer {
  if (!wsServer) {
    wsServer = new DebateWebSocketServer();
  }
  return wsServer;
}
