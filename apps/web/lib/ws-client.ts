"use client";

import { ClientMessage, ServerMessage } from "@repo/types";
// Note: logger import removed as it's not available in the client-side code

export type WSEventHandler = (message: ServerMessage) => void;

export class DebateWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private eventHandlers = new Map<string, Set<WSEventHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  constructor(sessionId: string, baseUrl?: string) {
    this.sessionId = sessionId;
    const resolvedBaseUrl =
      baseUrl ||
      (process.env.NEXT_PUBLIC_WS_URL as string) ||
      "ws://localhost:3001";
    this.url = `${resolvedBaseUrl}?sessionId=${sessionId}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("WebSocket connected");
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;

          // Join the session
          this.send({
            type: "JOIN_SESSION",
            sessionId: this.sessionId,
          });

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ServerMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
          }
        };

        this.ws.onclose = (event) => {
          console.log("WebSocket disconnected:", event.code, event.reason);
          this.handleDisconnect();
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(message: ServerMessage): void {
    // Call global handlers
    const globalHandlers = this.eventHandlers.get("*");
    if (globalHandlers) {
      globalHandlers.forEach((handler) => handler(message));
    }

    // Call specific type handlers
    const typeHandlers = this.eventHandlers.get(message.type);
    if (typeHandlers) {
      typeHandlers.forEach((handler) => handler(message));
    }
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error("Reconnection failed:", error);
        });
      }, this.reconnectDelay);

      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    } else {
      console.error("Max reconnection attempts reached");
      this.emit("connection_failed", {} as ServerMessage);
    }
  }

  send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket is not connected");
    }
  }

  on(eventType: string | "*", handler: WSEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  off(eventType: string | "*", handler: WSEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(eventType: string, message: ServerMessage): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }
  }

  requestState(): void {
    this.send({
      type: "REQUEST_STATE",
      sessionId: this.sessionId,
    });
  }

  judgeDebate(winner: "A" | "B" | "TIE"): void {
    this.send({
      type: "USER_JUDGE",
      sessionId: this.sessionId,
      winner,
    });
  }

  ping(): void {
    this.send({ type: "PING" });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
