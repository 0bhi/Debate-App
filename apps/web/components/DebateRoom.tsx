"use client";

import { useEffect } from "react";
import { useDebateStore } from "../lib/stores/debate-store";
import { Avatar } from "./Avatar";
import { Transcript } from "./Transcript";
import { JudgePanel } from "./JudgePanel";
import toast from "react-hot-toast";

interface DebateRoomProps {
  sessionId: string;
}

export function DebateRoom({ sessionId }: DebateRoomProps) {
  const {
    sessionState,
    currentTurn,
    isConnected,
    error,
    loadDebate,
    connectWebSocket,
    judgeDebate,
    clearError,
  } = useDebateStore();

  useEffect(() => {
    const initializeRoom = async () => {
      try {
        await loadDebate(sessionId);
        await connectWebSocket(sessionId);
      } catch (error) {
        console.error("Failed to initialize debate room:", error);
        toast.error("Failed to connect to debate");
      }
    };

    initializeRoom();
  }, [sessionId, loadDebate, connectWebSocket]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  if (!sessionState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">
            Loading debate...
          </p>
        </div>
      </div>
    );
  }

  const canJudge = !sessionState.autoJudge && sessionState.status === "JUDGING";

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="text-center mb-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              AI Debate Club
            </h1>
            <div className="flex items-center justify-center gap-2 text-sm">
              <div
                className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}
              />
              <span className="text-slate-600 dark:text-slate-400">
                {isConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>

          {/* Debaters */}
          <div className="flex items-center justify-center gap-8 mb-6">
            <div className="text-center">
              <Avatar
                persona={sessionState.personaA}
                size="lg"
                isActive={currentTurn.speaker === "A"}
                isSpeaking={
                  currentTurn.speaker === "A" && currentTurn.isStreaming
                }
              />
            </div>

            <div className="flex flex-col items-center">
              <div className="text-4xl mb-2">⚡</div>
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                VS
              </div>
            </div>

            <div className="text-center">
              <Avatar
                persona={sessionState.personaB}
                size="lg"
                isActive={currentTurn.speaker === "B"}
                isSpeaking={
                  currentTurn.speaker === "B" && currentTurn.isStreaming
                }
              />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Transcript - Takes up 2/3 on large screens */}
          <div className="lg:col-span-2">
            <Transcript sessionState={sessionState} currentTurn={currentTurn} />
          </div>

          {/* Judge Panel - Takes up 1/3 on large screens */}
          <div className="lg:col-span-1">
            <JudgePanel
              sessionState={sessionState}
              onJudge={judgeDebate}
              canJudge={canJudge}
            />
          </div>
        </div>

        {/* Status Footer */}
        <div className="mt-6 text-center">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Session ID: <span className="font-mono">{sessionId}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
