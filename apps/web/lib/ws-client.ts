"use client";

import { ClientMessage, ServerMessage } from "@repo/types";
// Note: logger import removed as it's not available in the client-side code

export type WSEventHandler = (message: ServerMessage) => void;

export class DebateWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private userId?: string;
  private eventHandlers = new Map<string, Set<WSEventHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualDisconnect = false; // Track manual disconnects to prevent reconnection

  constructor(sessionId: string, userId?: string, baseUrl?: string) {
    this.sessionId = sessionId;
    this.userId = userId;
    const resolvedBaseUrl =
      baseUrl ||
      (process.env.NEXT_PUBLIC_WS_URL as string) ||
      "ws://localhost:3001";
    const params = new URLSearchParams({ sessionId });
    if (userId) {
      params.append("userId", userId);
    }
    this.url = `${resolvedBaseUrl}?${params.toString()}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Prevent duplicate connection attempts
      if (this.ws) {
        if (this.ws.readyState === WebSocket.CONNECTING) {
          // Already connecting, wait for it
          const checkConnection = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
              clearInterval(checkConnection);
              resolve();
            } else if (this.ws?.readyState === WebSocket.CLOSED) {
              clearInterval(checkConnection);
              reject(new Error("Connection closed"));
            }
          }, 100);
          return;
        } else if (this.ws.readyState === WebSocket.OPEN) {
          // Already connected
          resolve();
          return;
        }
      }

      try {
        this.ws = new WebSocket(this.url);
        this.isManualDisconnect = false; // Reset flag on new connection attempt

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.isManualDisconnect = false;

          // Clear any pending reconnect timer
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }

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
          this.ws = null; // Clear reference

          // Only attempt reconnection if it wasn't a manual disconnect
          if (!this.isManualDisconnect) {
            this.handleDisconnect();
          }
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          // Don't reject immediately, let onclose handle reconnection
          // Only reject if we're still in CONNECTING state
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            // Wait a bit for the close event
            setTimeout(() => {
              if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                reject(error);
              }
            }, 100);
          }
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
    // Don't reconnect if it was a manual disconnect
    if (this.isManualDisconnect) {
      return;
    }

    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      this.emit("connection_failed", {} as ServerMessage);
      return;
    }

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      // Rebuild URL with userId for reconnection
      const resolvedBaseUrl =
        (process.env.NEXT_PUBLIC_WS_URL as string) || "ws://localhost:3001";
      const params = new URLSearchParams({ sessionId: this.sessionId });
      if (this.userId) {
        params.append("userId", this.userId);
      }
      this.url = `${resolvedBaseUrl}?${params.toString()}`;

      this.connect().catch((error) => {
        console.error("Reconnection failed:", error);
      });
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
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

  submitArgument(argument: string): void {
    this.send({
      type: "SUBMIT_ARGUMENT",
      sessionId: this.sessionId,
      argument,
    });
  }

  ping(): void {
    this.send({ type: "PING" });
  }

  disconnect(): void {
    this.isManualDisconnect = true; // Set flag before disconnecting

    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Remove event listeners to prevent reconnection
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }

    // Reset reconnection state
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getUserId(): string | undefined {
    return this.userId;
  }
}
