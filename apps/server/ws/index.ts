import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { parse as parseUrl } from "url";
import { parse as parseQuery } from "querystring";
import { verify } from "jsonwebtoken";
import { getServerSession } from "next-auth";
import { redisSub } from "../services/redis";
import { debateOrchestrator } from "../orchestrator/debateOrchestrator";
import { logger } from "../utils/logger";
import { env } from "../env";
import { ClientMessage, ServerMessage, ClientMessageSchema } from "@repo/types";

interface AuthenticatedWebSocket extends WebSocket {
  sessionId?: string;
  userId?: string;
  isAlive?: boolean;
}

export class DebateWebSocketServer {
  private wss: WebSocketServer;
  private clients = new Map<string, Set<AuthenticatedWebSocket>>();

  constructor(port: number = env.WS_PORT) {
    console.log("🔍 Debug - env.WS_PORT:", env.WS_PORT);
    console.log("🔍 Debug - port parameter:", port);
    console.log("🔍 Debug - process.env.WS_PORT:", process.env.WS_PORT);

    this.wss = new WebSocketServer({
      port,
      verifyClient: this.verifyClient.bind(this),
    });

    this.setupEventHandlers();
    this.setupRedisSubscription();
    this.setupHeartbeat();

    logger.info(`WebSocket server started on port ${port}`);
  }

  private async verifyClient(info: { req: IncomingMessage }): Promise<boolean> {
    try {
      const url = parseUrl(info.req.url || "", true);
      const sessionId = url.query.sessionId as string;

      if (!sessionId) {
        logger.warn("WebSocket connection rejected: missing sessionId");
        return false;
      }

      // Verify session exists
      const session = await debateOrchestrator.loadSessionState(sessionId);
      if (!session) {
        logger.warn("WebSocket connection rejected: invalid sessionId", {
          sessionId,
        });
        return false;
      }

      return true;
    } catch (error) {
      logger.error("WebSocket verification failed", { error });
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

    ws.sessionId = sessionId;
    ws.isAlive = true;

    // Add client to session group
    if (!this.clients.has(sessionId)) {
      this.clients.set(sessionId, new Set());
    }
    this.clients.get(sessionId)!.add(ws);

    logger.info("WebSocket client connected", {
      sessionId,
      clientCount: this.clients.get(sessionId)!.size,
    });

    // Send current session state
    try {
      const sessionState = await debateOrchestrator.loadSessionState(sessionId);
      if (sessionState) {
        this.sendToClient(ws, {
          type: "SESSION_STATE",
          data: sessionState,
        } as ServerMessage);
      }
    } catch (error) {
      logger.error("Failed to send session state", { sessionId, error });
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

      logger.debug("WebSocket message received", {
        sessionId: ws.sessionId,
        type: message.type,
      });

      switch (message.type) {
        case "JOIN_SESSION":
          await this.handleJoinSession(ws, message.sessionId);
          break;

        case "REQUEST_STATE":
          await this.handleRequestState(ws, message.sessionId);
          break;

        case "USER_JUDGE":
          await this.handleUserJudge(ws, message.sessionId, message.winner);
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

    // Start debate if it's in CREATED status
    const sessionState = await debateOrchestrator.loadSessionState(sessionId);
    if (sessionState?.status === "CREATED") {
      await debateOrchestrator.startDebate(sessionId);
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

  private async handleUserJudge(
    ws: AuthenticatedWebSocket,
    sessionId: string,
    winner: "A" | "B" | "TIE"
  ): Promise<void> {
    try {
      await debateOrchestrator.userJudgeDebate(sessionId, winner);
    } catch (error) {
      logger.error("Failed to process user judge", {
        sessionId,
        winner,
        error,
      });
      this.sendToClient(ws, {
        type: "ERROR",
        message: "Failed to process judgment",
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

export function closeWebSocketServer(): Promise<void> | undefined {
  if (wsServer) {
    const closePromise = wsServer.close();
    wsServer = null;
    return closePromise;
  }
}
