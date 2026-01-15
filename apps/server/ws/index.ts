import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server as HttpServer } from "http";
import { parse as parseUrl } from "url";
import { redisSub } from "../services/redis";
import { debateOrchestrator } from "../orchestrator/debateOrchestrator";
import { logger } from "../utils/logger";
import { env } from "../env";
import { ServerMessage, ClientMessageSchema } from "@repo/types";
import { verifyClient, extractUserIdFromRequest } from "./auth";
import { AuthenticatedWebSocket } from "./types";
import {
  handleJoinSession,
  handleRequestState,
  handleSubmitArgument,
} from "./message-handlers";

export class DebateWebSocketServer {
  private wss: WebSocketServer;
  private clients = new Map<string, Set<AuthenticatedWebSocket>>();

  constructor(httpServer: HttpServer) {
    try {
      // Attach WebSocket server to the existing HTTP server
      this.wss = new WebSocketServer({
        server: httpServer,
        verifyClient: verifyClient,
      });

      this.setupEventHandlers();
      this.setupRedisSubscription();
      this.setupHeartbeat();

      logger.info("WebSocket server attached to HTTP server");
    } catch (error) {
      logger.error("Failed to create WebSocket server", { error });
      throw error;
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

    const userId = extractUserIdFromRequest(req);
    if (!userId) {
      logger.error("WebSocket connection missing authenticated userId", {
        sessionId,
      });
      ws.close(1008, "Authentication failed");
      return;
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
          if (ws.sessionId !== message.sessionId) {
            if (ws.sessionId) {
              this.clients.get(ws.sessionId)?.delete(ws);
            }
            ws.sessionId = message.sessionId;
            if (!this.clients.has(message.sessionId)) {
              this.clients.set(message.sessionId, new Set());
            }
            this.clients.get(message.sessionId)!.add(ws);
          }
          await handleJoinSession(
            ws,
            message.sessionId,
            (id, msg) => this.broadcastToSession(id, msg),
            (ws, msg) => this.sendToClient(ws, msg),
            (id, uid, state) => this.handleDebaterAssignment(id, uid, state)
          );
          break;

        case "REQUEST_STATE":
          await handleRequestState(
            ws,
            message.sessionId,
            (ws, msg) => this.sendToClient(ws, msg)
          );
          break;

        case "SUBMIT_ARGUMENT":
          await handleSubmitArgument(
            ws,
            message.sessionId,
            message.argument,
            (ws, msg) => this.sendToClient(ws, msg)
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

export function createWebSocketServer(httpServer: HttpServer): DebateWebSocketServer {
  if (!wsServer) {
    wsServer = new DebateWebSocketServer(httpServer);
  }
  return wsServer;
}

export function getWebSocketServer(): DebateWebSocketServer | null {
  return wsServer;
}
