import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { SessionState, CreateDebateRequest, ServerMessage } from "@repo/types";
import { DebateWebSocketClient } from "../ws-client";
import { apiClient } from "../api";
import { logger } from "../logger";

interface DebateStore {
  // State
  sessionState: SessionState | null;
  wsClient: DebateWebSocketClient | null;
  isConnected: boolean;
  currentTurn: {
    speaker: "A" | "B" | null;
    text: string;
  };
  error: string | null;
  isRetryingJudging: boolean; // Track if retry is in progress

  // Actions
  createDebate: (
    request: CreateDebateRequest,
    userId?: string
  ) => Promise<string>;
  loadDebate: (sessionId: string) => Promise<void>;
  connectWebSocket: (sessionId: string, userId?: string) => Promise<void>;
  disconnectWebSocket: () => void;
  submitArgument: (sessionId: string, argument: string) => Promise<void>;
  retryJudging: (sessionId: string) => Promise<void>;
  clearError: () => void;

  // Internal
  setSessionState: (state: SessionState) => void;
  setCurrentTurn: (speaker: "A" | "B" | null) => void;
  setError: (error: string) => void;
  handleWebSocketMessage: (message: ServerMessage) => void;
}

export const useDebateStore = create<DebateStore>()(
  subscribeWithSelector((set, get) => {
    // Debounce timer for session state reloads
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    return {
      // Initial state
      sessionState: null,
      wsClient: null,
      isConnected: false,
      currentTurn: {
        speaker: null,
        text: "",
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

          logger.error("Failed to load debate", { error, sessionId });

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
            if (
              wsClient.isConnected() &&
              wsClient.getSessionId() === sessionId
            ) {
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
          return;
        }

        try {
          set({ error: null, isRetryingJudging: true });

          await apiClient.retryJudging(sessionId);

          // Don't call loadDebate here - WebSocket will broadcast the updated state
          // This prevents unnecessary API calls
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Failed to retry judging";
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

      setCurrentTurn: (speaker: "A" | "B" | null) =>
        set({
          currentTurn: {
            speaker,
            text: "",
          },
        }),

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
                // Set currentTurn based on debate state
                let newCurrentTurn = state.currentTurn;
                if (incoming.status === "RUNNING") {
                  if (incoming.turns.length === 0) {
                    // Debate just started, first turn is always A
                    newCurrentTurn = { speaker: "A", text: "" };
                  } else {
                    // Determine next speaker based on last turn
                    const lastTurn = incoming.turns[incoming.turns.length - 1];
                    if (lastTurn) {
                      const nextSpeaker: "A" | "B" =
                        lastTurn.speaker === "A" ? "B" : "A";
                      newCurrentTurn = { speaker: nextSpeaker, text: "" };
                    }
                  }
                } else if (incoming.status === "FINISHED") {
                  newCurrentTurn = { speaker: null, text: "" };
                }

                return {
                  ...state,
                  sessionState: {
                    ...incoming,
                    turns: [...incoming.turns].sort(
                      (a, b) => a.orderIndex - b.orderIndex
                    ),
                  },
                  currentTurn: newCurrentTurn,
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
                // Update currentTurn based on new turns
                let newCurrentTurn = state.currentTurn;
                if (incoming.status === "RUNNING") {
                  if (incoming.turns.length === 0) {
                    // Debate just started, first turn is always A
                    newCurrentTurn = { speaker: "A", text: "" };
                  } else {
                    // Determine next speaker based on last turn
                    const lastTurn = incoming.turns[incoming.turns.length - 1];
                    if (lastTurn) {
                      const nextSpeaker: "A" | "B" =
                        lastTurn.speaker === "A" ? "B" : "A";
                      newCurrentTurn = { speaker: nextSpeaker, text: "" };
                    }
                  }
                } else if (incoming.status === "FINISHED") {
                  // Debate is over, clear current turn
                  newCurrentTurn = { speaker: null, text: "" };
                }

                return {
                  ...state,
                  sessionState: {
                    ...incoming,
                    turns: [...incoming.turns].sort(
                      (a, b) => a.orderIndex - b.orderIndex
                    ),
                  },
                  currentTurn: newCurrentTurn,
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
              },
            });
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
            logger.warn("Unknown WebSocket message type", {
              type: (message as any).type,
            });
        }
      },
    };
  })
);
