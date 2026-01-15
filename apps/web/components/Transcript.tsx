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
  };
}

export function Transcript({ sessionState, currentTurn }: TranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessionState.turns]);

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

  return (
    <div className="flex flex-col h-full bg-card/80 backdrop-blur-sm border border-border rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-muted/30">
        <h3 className="text-lg font-bold text-foreground mb-1">
          Debate Transcript
        </h3>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {sessionState.topic}
        </p>
      </div>

      {/* Transcript Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5 bg-gradient-to-b from-background to-muted/20">
        <AnimatePresence>
          {sessionState.turns.map((turn, index) => {
            const debaterName =
              turn.speaker === "A"
                ? sessionState.debaterAName || "Debater A"
                : sessionState.debaterBName || "Debater B";
            const isEven = index % 2 === 0;

            return (
              <motion.div
                key={turn.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{ width: "100%" }}
              >
                <div className={`flex gap-4 ${isEven ? "flex-row" : "flex-row-reverse"}`}>
                  <div className={`flex gap-4 w-full ${isEven ? "flex-row" : "flex-row-reverse"}`}>
                    <div className="flex-shrink-0">
                      <Avatar name={debaterName} size="sm" isActive={false} />
                    </div>

                    <div className={`flex-1 ${isEven ? "max-w-[75%]" : "max-w-[75%]"}`}>
                      <div
                        className={`
                        p-4 rounded-2xl relative shadow-sm
                        ${
                          isEven
                            ? "bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-tl-md"
                            : "bg-gradient-to-br from-muted to-muted/80 border border-border rounded-tr-md"
                        }
                      `}
                      >
                        {/* Speech bubble arrow */}
                        <div
                          className={`
                          absolute top-4 w-0 h-0
                          ${
                            isEven
                              ? "-left-2 border-r-[12px] border-t-[12px] border-primary/10 border-b-0 border-transparent"
                              : "-right-2 border-l-[12px] border-t-[12px] border-muted border-b-0 border-transparent"
                          }
                        `}
                        />

                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                              {debaterName}
                            </div>
                            <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                              {turn.response}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-border/50">
                          <div className="text-xs text-muted-foreground">
                            {formatTimestamp(turn.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}

        </AnimatePresence>

        {/* Empty state */}
        {sessionState.turns.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-full mb-4">
              <span className="text-2xl">💬</span>
            </div>
            <p className="font-medium">The debate will begin shortly...</p>
          </div>
        )}
      </div>
    </div>
  );
}
