"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SessionState } from "@repo/types";
import { Avatar } from "./Avatar";

interface TranscriptProps {
  sessionState: SessionState;
  currentTurn: {
    speaker: "A" | "B" | null;
    text: string;
    isStreaming: boolean;
  };
}

export function Transcript({ sessionState, currentTurn }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessionState.turns, currentTurn.text]);

  const formatTimestamp = (date: Date | string) => {
    const dateObj = date instanceof Date ? date : new Date(date);

    if (isNaN(dateObj.getTime())) {
      return "Invalid time";
    }

    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(dateObj);
  };

  const MotionDiv = motion.div;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 rounded-lg shadow-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Debate Transcript
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Topic: {sessionState.topic}
        </p>
      </div>

      {/* Transcript Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {sessionState.turns.map((turn, index) => {
            const debaterName =
              turn.speaker === "A"
                ? sessionState.debaterAName || "Debater A"
                : sessionState.debaterBName || "Debater B";
            const isEven = index % 2 === 0;

            return (
              <div
                key={turn.id}
                className={`flex gap-3 ${isEven ? "flex-row" : "flex-row-reverse"}`}
              >
                <MotionDiv
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex gap-3 w-full">
                    <div className="flex-shrink-0">
                      <Avatar name={debaterName} size="sm" isActive={false} />
                    </div>

                    <div
                      className={`flex-1 max-w-3xl ${isEven ? "mr-12" : "ml-12"}`}
                    >
                      <div
                        className={`
                        p-4 rounded-lg relative
                        ${
                          isEven
                            ? "bg-blue-50 dark:bg-blue-900/20 rounded-tl-none"
                            : "bg-slate-50 dark:bg-slate-700 rounded-tr-none"
                        }
                      `}
                      >
                        {/* Speech bubble arrow */}
                        <div
                          className={`
                          absolute top-0 w-0 h-0
                          ${
                            isEven
                              ? "-left-2 border-r-8 border-t-8 border-blue-50 dark:border-blue-900/20"
                              : "-right-2 border-l-8 border-t-8 border-slate-50 dark:border-slate-700"
                          }
                          border-b-0 border-transparent
                        `}
                        />

                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-slate-900 dark:text-white whitespace-pre-wrap">
                              {turn.response}
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {formatTimestamp(turn.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                </MotionDiv>
              </div>
            );
          })}

          {/* Current speaking indicator */}
          {currentTurn.speaker && currentTurn.isStreaming && (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full">
                <Avatar
                  name={
                    currentTurn.speaker === "A"
                      ? sessionState.debaterAName || "Debater A"
                      : sessionState.debaterBName || "Debater B"
                  }
                  size="sm"
                  isActive={true}
                />
                <span className="text-blue-600 dark:text-blue-400 text-sm">
                  {currentTurn.speaker === "A"
                    ? sessionState.debaterAName || "Debater A"
                    : sessionState.debaterBName || "Debater B"}{" "}
                  is speaking...
                </span>
                <div className="flex gap-1">
                  <div
                    className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  ></div>
                  <div
                    className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  ></div>
                  <div
                    className="w-1 h-1 bg-blue-500 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {sessionState.turns.length === 0 && !currentTurn.speaker && (
          <div className="text-center text-slate-500 dark:text-slate-400 py-8">
            <p>The debate will begin shortly...</p>
          </div>
        )}
      </div>
    </div>
  );
}
