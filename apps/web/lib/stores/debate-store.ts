import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  SessionState,
  CreateDebateRequest,
  ServerMessage,
} from "@repo/types";
import { DebateWebSocketClient } from "../ws-client";
import { apiClient } from "../api";

interface DebateStore {
  // State
  sessionState: SessionState | null;
  wsClient: DebateWebSocketClient | null;
  isConnected: boolean;
  currentTurn: {
    speaker: "A" | "B" | null;
    text: string;
    isStreaming: boolean;
  };
  error: string | null;
  isRetryingJudging: boolean; // Track if retry is in progress

  // Actions
  createDebate: (request: CreateDebateRequest, userId?: string) => Promise<string>;
  loadDebate: (sessionId: string) => Promise<void>;
  connectWebSocket: (sessionId: string, userId?: string) => Promise<void>;
  disconnectWebSocket: () => void;
  submitArgument: (sessionId: string, argument: string) => Promise<void>;
  retryJudging: (sessionId: string) => Promise<void>;
  clearError: () => void;

  // Internal
  setSessionState: (state: SessionState) => void;
  setError: (error: string) => void;
  handleWebSocketMessage: (message: ServerMessage) => void;
}

export const useDebateStore = create<DebateStore>()(
  subscribeWithSelector((set, get) => {
    // Debounce timer for TURN_END reloads
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    return {
      // Initial state
      sessionState: null,
      wsClient: null,
      isConnected: false,
      currentTurn: {
        speaker: null,
        text: "",
        isStreaming: false,
      },
      error: null,
      isRetryingJudging: false,

      // Actions
      createDebate: async (request: CreateDebateRequest, userId?: string) => {
        try {
          set({ error: null });
          const result = await apiClient.createDebate(request);

          // Auto-connect to WebSocket after creating debate
          await get().connectWebSocket(result.id, userId);

          return result.id;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to create debate";
          set({ error: errorMessage });
          throw error;
        }
      },

      loadDebate: async (sessionId: string) => {
        try {
          set({ error: null });
          const sessionState = await apiClient.getDebate(sessionId);
          set({ sessionState });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to load debate";
          set({ error: errorMessage });
          throw error;
        }
      },

      connectWebSocket: async (sessionId: string, userId?: string) => {
        try {
          const { wsClient } = get();

          // Only disconnect if we're connected to a different session or not connected at all
          if (wsClient) {
            // Check if already connected to the same session
            if (wsClient.isConnected() && wsClient.getSessionId() === sessionId) {
              // Already connected to the same session, no need to reconnect
              return;
            }
            // Disconnect existing connection to different session or closed connection
            wsClient.disconnect();
          }

          const newClient = new DebateWebSocketClient(sessionId, userId);

          // Set up event handlers
          newClient.on("*", get().handleWebSocketMessage);

          // Connect
          await newClient.connect();

          set({
            wsClient: newClient,
            isConnected: true,
            error: null,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to connect to WebSocket";
          set({ error: errorMessage, isConnected: false });
          throw error;
        }
      },

      disconnectWebSocket: () => {
        const { wsClient } = get();
        if (wsClient) {
          wsClient.disconnect();
          set({ wsClient: null, isConnected: false });
        }
      },

      submitArgument: async (sessionId: string, argument: string) => {
        const { wsClient } = get();
        if (wsClient) {
          wsClient.submitArgument(argument);
        } else {
          throw new Error("WebSocket not connected");
        }
      },

      retryJudging: async (sessionId: string) => {
        const { isRetryingJudging } = get();
        
        // Prevent duplicate retry calls
        if (isRetryingJudging) {
          console.log("Retry judging already in progress, skipping duplicate call");
          return;
        }

        try {
          set({ error: null, isRetryingJudging: true });
          console.log(`[Retry Judging] Starting retry for session ${sessionId}`);
          
          await apiClient.retryJudging(sessionId);
          
          console.log(`[Retry Judging] Retry API call completed for session ${sessionId}`);
          // Don't call loadDebate here - WebSocket will broadcast the updated state
          // This prevents unnecessary API calls
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to retry judging";
          console.error(`[Retry Judging] Error for session ${sessionId}:`, errorMessage);
          set({ error: errorMessage });
          throw error;
        } finally {
          // Reset retry flag after a short delay to allow for any pending operations
          setTimeout(() => {
            set({ isRetryingJudging: false });
          }, 1000);
        }
      },

      clearError: () => set({ error: null }),

      // Internal methods
      setSessionState: (sessionState: SessionState) => set({ sessionState }),

      setError: (error: string) => set({ error }),

      handleWebSocketMessage: (message: ServerMessage) => {
        const { sessionState } = get();

        switch (message.type) {
          case "SESSION_STATE": {
            const incoming = message.data as SessionState;
            // Update if turns changed, status changed, winner changed, or debater assignment changed
            set((state) => {
              const prev = state.sessionState;
              if (!prev) {
                // No previous state, always update
                return {
                  ...state,
                  sessionState: {
                    ...incoming,
                    turns: [...incoming.turns].sort(
                      (a, b) => a.orderIndex - b.orderIndex
                    ),
                  },
                };
              }

              const prevLen = prev.turns.length ?? 0;
              const newLen = incoming.turns.length;
              const prevLastId = prev.turns[prevLen - 1]?.id;
              const newLastId = incoming.turns[newLen - 1]?.id;

              const turnsChanged =
                prevLen !== newLen || (prevLen > 0 && prevLastId !== newLastId);
              const statusChanged = prev.status !== incoming.status;
              const winnerChanged = prev.winner !== incoming.winner;
              const debaterAChanged = prev.debaterAId !== incoming.debaterAId;
              const debaterBChanged = prev.debaterBId !== incoming.debaterBId;

              // Update if any significant change occurred
              if (
                turnsChanged ||
                statusChanged ||
                winnerChanged ||
                debaterAChanged ||
                debaterBChanged
              ) {
                return {
                  ...state,
                  sessionState: {
                    ...incoming,
                    turns: [...incoming.turns].sort(
                      (a, b) => a.orderIndex - b.orderIndex
                    ),
                  },
                };
              }

              return state; // no-op to avoid re-render
            });
            break;
          }

          case "YOUR_TURN": {
            // It's the user's turn to submit an argument
            set({
              currentTurn: {
                speaker: message.speaker,
                text: "",
                isStreaming: false,
              },
            });
            break;
          }

          case "TURN_START":
            // Just show a simple indicator that someone is speaking
            set({
              currentTurn: {
                speaker: message.speaker,
                text: "Speaking...",
                isStreaming: true,
              },
            });
            break;

          case "TURN_TOKEN":
            // Ignore individual tokens - we'll wait for the complete turn
            break;

          case "TURN_END": {
            // Clear the speaking indicator
            set({
              currentTurn: {
                speaker: null,
                text: "",
                isStreaming: false,
              },
            });

            // Debounce the DB reload to avoid rapid re-renders
            if (reloadTimer) clearTimeout(reloadTimer);
            if (sessionState) {
              const id = sessionState.id;
              reloadTimer = setTimeout(() => {
                get()
                  .loadDebate(id)
                  .catch(() => {});
              }, 200);
            }
            break;
          }

          case "WINNER":
            // Update session state with winner immediately for responsive UI
            if (sessionState) {
              set({
                sessionState: {
                  ...sessionState,
                  winner: message.winner,
                  judgeJSON: message.judgeJSON,
                  status: "FINISHED" as any,
                },
              });
              
              // Reload from database after a short delay to ensure consistency
              if (reloadTimer) clearTimeout(reloadTimer);
              reloadTimer = setTimeout(() => {
                get()
                  .loadDebate(sessionState.id)
                  .catch(() => {});
              }, 300);
            }
            break;

          case "ERROR":
            set({ error: message.message });
            break;

          case "HEARTBEAT":
            // Keep connection alive
            break;

          default:
            console.warn(
              "Unknown WebSocket message type:",
              (message as any).type
            );
        }
      },
    };
  })
);
