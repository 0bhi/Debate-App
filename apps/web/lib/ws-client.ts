"use client";

import { ClientMessage, ServerMessage } from "@repo/types";
// Note: logger import removed as it's not available in the client-side code

export type WSEventHandler = (message: ServerMessage) => void;

export class DebateWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private sessionId: string;
  private userId?: string;
  private authToken: string | null = null;
  private tokenExpiry: number | null = null; // Track when token expires
  private eventHandlers = new Map<string, Set<WSEventHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualDisconnect = false; // Track manual disconnects to prevent reconnection
  private connectionPromise: Promise<void> | null = null; // Track ongoing connection attempts
  private lastConnectionAttempt: number = 0; // Track last connection attempt time
  private readonly CONNECTION_THROTTLE_MS = 500; // Minimum time between connection attempts

  constructor(sessionId: string, userId?: string, baseUrl?: string) {
    this.sessionId = sessionId;
    this.userId = userId;
    const resolvedBaseUrl =
      baseUrl ||
      (process.env.NEXT_PUBLIC_WS_URL as string) ||
      "ws://localhost:3001";
    // URL will be built in connect() after fetching token
    this.url = `${resolvedBaseUrl}?sessionId=${sessionId}`;
  }

  /**
   * Fetch authentication token from the API
   * Caches the token and only fetches a new one if the current token is missing or expired
   */
  private async fetchAuthToken(forceRefresh: boolean = false): Promise<string | null> {
    // Check if we have a valid cached token (valid for at least 5 more minutes)
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    if (!forceRefresh && this.authToken && this.tokenExpiry) {
      const timeUntilExpiry = this.tokenExpiry - now;
      if (timeUntilExpiry > fiveMinutes) {
        // Token is still valid, return cached token
        return this.authToken;
      }
    }

    try {
      const response = await fetch("/api/ws/token", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for authentication
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Failed to fetch WebSocket token: ${response.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If parsing fails, use the status text
          errorMessage = errorText || errorMessage;
        }
        
        if (response.status === 401) {
          console.error("Authentication required for WebSocket token:", errorMessage);
        } else {
          console.error("Failed to fetch WebSocket token:", errorMessage);
        }
        return null;
      }
      
      const data = await response.json();
      const token = data.token || null;
      
      if (token) {
        this.authToken = token;
        // Token expires in 1 hour, set expiry to 55 minutes to be safe
        this.tokenExpiry = now + (55 * 60 * 1000);
      }
      
      return token;
    } catch (error) {
      // Handle network errors more gracefully
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        console.error(
          "Network error: Unable to reach the server. Please check if the server is running and accessible.",
          error
        );
      } else {
        console.error("Error fetching WebSocket token:", error);
      }
      return null;
    }
  }

  /**
   * Build WebSocket URL with authentication token
   */
  private buildUrl(baseUrl: string, token: string | null): string {
    const params = new URLSearchParams({ sessionId: this.sessionId });
    if (token) {
      params.append("token", token);
    }
    // Keep userId for backward compatibility (though server will use token)
    if (this.userId) {
      params.append("userId", this.userId);
    }
    return `${baseUrl}?${params.toString()}`;
  }

  async connect(): Promise<void> {
    // Throttle connection attempts to prevent rapid reconnection loops
    const now = Date.now();
    const timeSinceLastAttempt = now - this.lastConnectionAttempt;
    if (timeSinceLastAttempt < this.CONNECTION_THROTTLE_MS && this.connectionPromise) {
      // Return existing connection promise if we're throttling
      return this.connectionPromise;
    }

    // If there's an ongoing connection attempt, return that promise
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.lastConnectionAttempt = now;

    // Create connection promise
    this.connectionPromise = this._doConnect().finally(() => {
      // Clear the promise after connection completes (success or failure)
      this.connectionPromise = null;
    });

    return this.connectionPromise;
  }

  private async _doConnect(): Promise<void> {
    // Fetch authentication token first (will use cached token if valid)
    const token = await this.fetchAuthToken();
    if (!token) {
      throw new Error("Failed to obtain authentication token");
    }

    // Build URL with token
    const resolvedBaseUrl =
      (process.env.NEXT_PUBLIC_WS_URL as string) || "ws://localhost:3001";
    this.url = this.buildUrl(resolvedBaseUrl, this.authToken);

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

    this.reconnectTimer = setTimeout(async () => {
      // Refresh token on reconnection (will use cached token if still valid)
      const token = await this.fetchAuthToken();
      if (!token) {
        console.error("Failed to get token for reconnection");
        this.handleDisconnect(); // Try again
        return;
      }
      
      // Rebuild URL with token for reconnection
      const resolvedBaseUrl =
        (process.env.NEXT_PUBLIC_WS_URL as string) || "ws://localhost:3001";
      this.url = this.buildUrl(resolvedBaseUrl, token);

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
    
    // Note: We keep the token cached even after disconnect
    // so it can be reused if reconnecting soon
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
