import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { SessionState } from "../../server/orchestrator/debateOrchestrator";
import { DebateWebSocketClient } from "../ws-client";
import { CreateDebateRequest, Persona, ServerMessage } from "../validators";
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

  // Actions
  createDebate: (request: CreateDebateRequest) => Promise<string>;
  loadDebate: (sessionId: string) => Promise<void>;
  connectWebSocket: (sessionId: string) => Promise<void>;
  disconnectWebSocket: () => void;
  judgeDebate: (winner: "A" | "B" | "TIE") => void;
  clearError: () => void;

  // Internal
  setSessionState: (state: SessionState) => void;
  setError: (error: string) => void;
  handleWebSocketMessage: (message: ServerMessage) => void;
}

export const useDebateStore = create<DebateStore>()(
  subscribeWithSelector((set, get) => ({
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

    // Actions
    createDebate: async (request: CreateDebateRequest) => {
      try {
        set({ error: null });
        const result = await apiClient.createDebate(request);

        // Auto-connect to WebSocket after creating debate
        await get().connectWebSocket(result.id);

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

    connectWebSocket: async (sessionId: string) => {
      try {
        const { wsClient } = get();

        // Disconnect existing connection
        if (wsClient) {
          wsClient.disconnect();
        }

        const newClient = new DebateWebSocketClient(sessionId);

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

    judgeDebate: (winner: "A" | "B" | "TIE") => {
      const { wsClient, sessionState } = get();
      if (wsClient && sessionState) {
        wsClient.judgeDebate(winner);
      }
    },

    clearError: () => set({ error: null }),

    // Internal methods
    setSessionState: (sessionState: SessionState) => set({ sessionState }),

    setError: (error: string) => set({ error }),

    handleWebSocketMessage: (message: ServerMessage) => {
      const { sessionState } = get();

      switch (message.type) {
        case "SESSION_STATE":
          set({ sessionState: message.data });
          break;

        case "TURN_START":
          set({
            currentTurn: {
              speaker: message.speaker,
              text: "",
              isStreaming: true,
            },
          });
          break;

        case "TURN_TOKEN":
          set((state) => ({
            currentTurn: {
              ...state.currentTurn,
              text: state.currentTurn.text + message.chunk,
            },
          }));
          break;

        case "TURN_END":
          set((state) => ({
            currentTurn: {
              ...state.currentTurn,
              text: message.text,
              isStreaming: false,
            },
          }));

          // Refresh session state to get the new turn
          if (sessionState) {
            get().loadDebate(sessionState.id);
          }
          break;

        case "WINNER":
          // Update session state with winner
          if (sessionState) {
            set({
              sessionState: {
                ...sessionState,
                winner: message.winner,
                judgeJSON: message.judgeJSON,
                status: "FINISHED" as any,
              },
            });
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
  }))
);

// Preset personas for easy selection
export const PRESET_PERSONAS: Record<string, Persona> = {
  "steve-jobs": {
    name: "Steve Jobs",
    bio: "Co-founder and former CEO of Apple Inc. Known for revolutionary thinking, minimalist design philosophy, and transforming multiple industries including personal computing, animated movies, music, phones, tablet computing, and digital publishing.",
    style:
      "Passionate, direct, and uncompromising. Focuses on user experience and elegant simplicity. Uses reality distortion field to push boundaries.",
    voice: "steve-jobs",
  },
  "elon-musk": {
    name: "Elon Musk",
    bio: "CEO of Tesla and SpaceX, founder of multiple companies. Visionary entrepreneur focused on sustainable energy, space exploration, and advancing human civilization. Known for bold predictions and ambitious timelines.",
    style:
      "Visionary, occasionally sarcastic, data-driven. References first principles thinking and long-term species survival. Unafraid of controversial positions.",
    voice: "elon-musk",
  },
  "warren-buffett": {
    name: "Warren Buffett",
    bio: 'Chairman and CEO of Berkshire Hathaway, legendary investor. Known as the "Oracle of Omaha" for his investing acumen and folksy wisdom about business and life.',
    style:
      "Folksy, wise, uses simple analogies. Focuses on long-term value and practical common sense. Often references his experiences in Omaha.",
    voice: "calm",
  },
  "oprah-winfrey": {
    name: "Oprah Winfrey",
    bio: "Media executive, actress, talk show host, television producer, and philanthropist. Known for her empathetic interviewing style and focus on personal growth and social issues.",
    style:
      "Empathetic, inspiring, focuses on human stories and personal growth. Asks probing questions about deeper meaning and impact on people.",
    voice: "energetic",
  },
};
