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
      return;
    }

    retryInProgressRef.current = true;
    setIsRetrying(true);

    try {
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
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
              <div className="font-semibold text-foreground text-sm mb-2">
                {sessionState.debaterAName || "Debater A"}
              </div>
              <div className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent mb-2">
                {scoreA}/10
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                {reasonA}
              </div>
            </div>

            <div className="bg-card border border-border p-4 rounded-xl shadow-sm">
              <div className="font-semibold text-foreground text-sm mb-2">
                {sessionState.debaterBName || "Debater B"}
              </div>
              <div className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent mb-2">
                {scoreB}/10
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">
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
    <div className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl shadow-lg p-6 sticky top-4">
      <MotionDiv initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
          <div className="p-2.5 bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/40 rounded-xl shadow-sm">
            <Gavel className="w-5 h-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground mb-0.5">
              Judge Panel
            </h3>
            <p className="text-sm text-muted-foreground">
              {getStatusText()}
            </p>
          </div>
        </div>

        {/* Debate Progress */}
        <div className="mb-6">
          <div className="flex justify-between items-center text-sm mb-3">
            <span className="font-medium text-foreground">Progress</span>
            <span className="text-muted-foreground font-medium">
              {sessionState.turns.length} / {sessionState.rounds * 2} turns
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-primary to-primary/80 h-2.5 rounded-full transition-all duration-500 shadow-sm"
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
              transition={{ duration: 0.3 }}
            >
              <div className="text-center p-6 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/20 rounded-xl border-2 border-red-200 dark:border-red-800 shadow-lg">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 dark:bg-red-900/40 rounded-full mb-3">
                  <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <h4 className="text-lg font-bold text-red-900 dark:text-red-200 mb-2">
                  Judging Failed
                </h4>
                <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                  {sessionState.judgeJSON?.error ||
                    "AI judging encountered an error. Please retry."}
                </p>
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-sm hover:shadow-md"
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
              transition={{ duration: 0.3 }}
            >
              <div className="text-center p-6 bg-gradient-to-br from-yellow-50 via-amber-50 to-yellow-100 dark:from-yellow-900/30 dark:via-amber-900/20 dark:to-yellow-900/30 rounded-xl border-2 border-yellow-300 dark:border-yellow-700 shadow-lg relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/10 to-amber-400/10" />
                <div className="relative">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full mb-3 shadow-lg">
                    <Trophy className="w-8 h-8 text-white" />
                  </div>
                  <h4 className="text-xl font-bold text-yellow-900 dark:text-yellow-100 mb-1">
                    Winner
                  </h4>
                  <p className="text-base font-semibold text-yellow-800 dark:text-yellow-200 mb-4">
                    {getWinnerName(sessionState.winner as "A" | "B" | "TIE")}
                  </p>

                  {sessionState.judgeJSON && (
                    <div className="mt-4 pt-4 border-t border-yellow-300/50 dark:border-yellow-700/50">
                      {formatJudgeReason(sessionState.judgeJSON)}
                    </div>
                  )}
                </div>
              </div>
            </MotionDiv>
          </div>
        )}

        {/* Debate Stats */}
        <div className="pt-6 border-t border-border">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-muted/50 rounded-xl">
              <div className="text-2xl font-bold text-foreground mb-1">
                {sessionState.rounds}
              </div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Rounds
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-xl">
              <div className="text-2xl font-bold text-foreground mb-1">
                {sessionState.turns.length}
              </div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Turns
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-xl">
              <div className="text-2xl font-bold text-foreground mb-1">
                AI
              </div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Judge
              </div>
            </div>
          </div>
        </div>
      </MotionDiv>
    </div>
  );
}
