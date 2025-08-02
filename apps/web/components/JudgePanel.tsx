"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Users, Brain, Gavel } from "lucide-react";
import { SessionState } from "../server/orchestrator/debateOrchestrator";

interface JudgePanelProps {
  sessionState: SessionState;
  onJudge?: (winner: "A" | "B" | "TIE") => void;
  canJudge?: boolean;
}

export function JudgePanel({
  sessionState,
  onJudge,
  canJudge = false,
}: JudgePanelProps) {
  const [selectedWinner, setSelectedWinner] = useState<
    "A" | "B" | "TIE" | null
  >(null);

  const handleJudge = () => {
    if (selectedWinner && onJudge) {
      onJudge(selectedWinner);
    }
  };

  const getStatusText = () => {
    switch (sessionState.status) {
      case "CREATED":
        return "Waiting to start...";
      case "RUNNING":
        return "Debate in progress...";
      case "JUDGING":
        return sessionState.autoJudge
          ? "AI is judging the debate..."
          : "Ready for manual judgment";
      case "FINISHED":
        return "Debate completed!";
      case "FAILED":
        return "Debate failed";
      default:
        return "Unknown status";
    }
  };

  const getWinnerName = (winner: "A" | "B" | "TIE") => {
    if (winner === "TIE") return "Tie";
    return winner === "A"
      ? sessionState.personaA.name
      : sessionState.personaB.name;
  };

  const formatJudgeReason = (judgeJSON: any) => {
    if (!judgeJSON) return null;

    if (judgeJSON.method === "user") {
      return "Decided by user vote";
    }

    // AI judge results
    if (judgeJSON.A && judgeJSON.B) {
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <div className="font-semibold text-blue-900 dark:text-blue-300">
                {sessionState.personaA.name}
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {judgeJSON.A.score}/10
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                {judgeJSON.A.reason}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-lg">
              <div className="font-semibold text-slate-900 dark:text-slate-300">
                {sessionState.personaB.name}
              </div>
              <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">
                {judgeJSON.B.score}/10
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300 mt-1">
                {judgeJSON.B.reason}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <Gavel className="w-6 h-6 text-purple-600 dark:text-purple-400" />
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
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(100, (sessionState.turns.length / (sessionState.rounds * 2)) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Winner Display */}
      {sessionState.winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-6"
        >
          <div className="text-center p-6 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
            <Trophy className="w-8 h-8 text-yellow-600 dark:text-yellow-400 mx-auto mb-2" />
            <h4 className="text-lg font-bold text-yellow-900 dark:text-yellow-300 mb-1">
              Winner: {getWinnerName(sessionState.winner)}
            </h4>

            {sessionState.judgeJSON && (
              <div className="mt-4">
                {formatJudgeReason(sessionState.judgeJSON)}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Manual Judging Controls */}
      {canJudge &&
        sessionState.status === "JUDGING" &&
        !sessionState.autoJudge &&
        !sessionState.winner && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <h4 className="font-semibold text-slate-900 dark:text-white">
              Cast Your Vote
            </h4>

            <div className="space-y-3">
              {[
                {
                  value: "A" as const,
                  label: sessionState.personaA.name,
                  color: "blue",
                },
                {
                  value: "B" as const,
                  label: sessionState.personaB.name,
                  color: "slate",
                },
                { value: "TIE" as const, label: "Tie", color: "purple" },
              ].map(({ value, label, color }) => (
                <button
                  key={value}
                  onClick={() => setSelectedWinner(value)}
                  className={`
                  w-full p-3 rounded-lg border-2 transition-all
                  ${
                    selectedWinner === value
                      ? `border-${color}-500 bg-${color}-50 dark:bg-${color}-900/20`
                      : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                  }
                `}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 dark:text-white">
                      {label}
                    </span>
                    <div
                      className={`
                    w-4 h-4 rounded-full border-2
                    ${
                      selectedWinner === value
                        ? `bg-${color}-500 border-${color}-500`
                        : "border-slate-300 dark:border-slate-600"
                    }
                  `}
                    />
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={handleJudge}
              disabled={!selectedWinner}
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              Submit Judgment
            </button>
          </motion.div>
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
              {sessionState.autoJudge ? "AI" : "Manual"}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Judge
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
