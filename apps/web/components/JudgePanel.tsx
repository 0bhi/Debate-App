"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Trophy, Gavel, RefreshCw, AlertCircle } from "lucide-react";
import { SessionState } from "@repo/types";
import { useDebateStore } from "../lib/stores/debate-store";
import toast from "react-hot-toast";

interface JudgePanelProps {
  sessionState: SessionState;
}

export function JudgePanel({ sessionState }: JudgePanelProps) {
  const { retryJudging, isRetryingJudging } = useDebateStore();
  const [isRetrying, setIsRetrying] = useState(false);
  const retryInProgressRef = useRef(false);

  const handleRetry = async () => {
    // Prevent duplicate calls from React StrictMode or double-clicks
    if (isRetrying || retryInProgressRef.current || isRetryingJudging) {
      console.log("[JudgePanel] Retry already in progress, skipping");
      return;
    }

    retryInProgressRef.current = true;
    setIsRetrying(true);

    try {
      console.log(`[JudgePanel] Starting retry for session ${sessionState.id}`);
      await retryJudging(sessionState.id);
      toast.success("Judging retry initiated");
      // Status will be updated via WebSocket
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to retry judging. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsRetrying(false);
      // Reset ref after a delay to prevent rapid clicks
      setTimeout(() => {
        retryInProgressRef.current = false;
      }, 2000);
    }
  };
  const getStatusText = () => {
    // If winner exists, show completed status regardless of status field
    if (sessionState.winner) {
      return "Debate completed!";
    }

    switch (sessionState.status) {
      case "CREATED":
        return "Waiting to start...";
      case "RUNNING":
        return "Debate in progress...";
      case "JUDGING":
        return "AI is judging the debate...";
      case "FINISHED":
        return "Debate completed!";
      case "FAILED":
        return "AI judging failed";
      default:
        return "Unknown status";
    }
  };

  const getWinnerName = (winner: "A" | "B" | "TIE") => {
    if (winner === "TIE") return "Tie";
    return winner === "A"
      ? sessionState.debaterAName || "Debater A"
      : sessionState.debaterBName || "Debater B";
  };

  const formatJudgeReason = (judgeJSON: any) => {
    if (!judgeJSON) return null;

    // AI judge results - check if we have scores for both debaters
    if (judgeJSON.A && judgeJSON.B) {
      const scoreA = judgeJSON.A.score ?? "N/A";
      const scoreB = judgeJSON.B.score ?? "N/A";
      const reasonA = judgeJSON.A.reason ?? "No reason provided";
      const reasonB = judgeJSON.B.reason ?? "No reason provided";

      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-lg">
              <div className="font-semibold text-slate-900 dark:text-slate-300">
                {sessionState.debaterAName || "Debater A"}
              </div>
              <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">
                {scoreA}/10
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                {reasonA}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-lg">
              <div className="font-semibold text-slate-900 dark:text-slate-300">
                {sessionState.debaterBName || "Debater B"}
              </div>
              <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">
                {scoreB}/10
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                {reasonB}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // If judgeJSON exists but doesn't have expected structure, still try to show something
    if (typeof judgeJSON === "object") {
      return (
        <div className="text-sm text-slate-600 dark:text-slate-400 mt-2">
          Judge decision received (details unavailable)
        </div>
      );
    }

    return null;
  };

  const MotionDiv = motion.div;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
      <MotionDiv initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
            <Gavel className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Judge Panel
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {getStatusText()}
            </p>
          </div>
        </div>

        {/* Debate Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400 mb-2">
            <span>Progress</span>
            <span>
              {sessionState.turns.length} / {sessionState.rounds * 2} turns
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
            <div
              className="bg-slate-900 dark:bg-slate-300 h-2 rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  (sessionState.turns.length / (sessionState.rounds * 2)) * 100
                )}%`,
              }}
            />
          </div>
        </div>

        {/* Failed Status - Show Retry Button */}
        {sessionState.status === "FAILED" && !sessionState.winner && (
          <div className="mb-6">
            <MotionDiv
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="text-center p-6 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-3" />
                <h4 className="text-lg font-bold text-red-900 dark:text-red-300 mb-2">
                  Judging Failed
                </h4>
                <p className="text-sm text-red-700 dark:text-red-400 mb-4">
                  {sessionState.judgeJSON?.error ||
                    "AI judging encountered an error. Please retry."}
                </p>
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`}
                  />
                  {isRetrying ? "Retrying..." : "Retry Judging"}
                </button>
              </div>
            </MotionDiv>
          </div>
        )}

        {/* Winner Display */}
        {sessionState.winner && (
          <div className="mb-6">
            <MotionDiv
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className="text-center p-6 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <Trophy className="w-8 h-8 text-yellow-600 dark:text-yellow-400 mx-auto mb-2" />
                <h4 className="text-lg font-bold text-yellow-900 dark:text-yellow-300 mb-1">
                  Winner:{" "}
                  {getWinnerName(sessionState.winner as "A" | "B" | "TIE")}
                </h4>

                {sessionState.judgeJSON && (
                  <div className="mt-4">
                    {formatJudgeReason(sessionState.judgeJSON)}
                  </div>
                )}
              </div>
            </MotionDiv>
          </div>
        )}

        {/* Debate Stats */}
        <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {sessionState.rounds}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Rounds
              </div>
            </div>

            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {sessionState.turns.length}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Turns
              </div>
            </div>

            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                AI
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Judge
              </div>
            </div>
          </div>
        </div>
      </MotionDiv>
    </div>
  );
}
