import { WebSocket } from "ws";

export interface AuthenticatedWebSocket extends WebSocket {
  sessionId?: string;
  userId?: string;
  isAlive?: boolean;
}

