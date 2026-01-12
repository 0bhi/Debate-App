"use client";

import { Avatar } from "../Avatar";
import { InviteButton } from "../InviteButton";
import { SessionState } from "@repo/types";

interface DebatersHeaderProps {
  sessionState: SessionState;
  effectiveCurrentSpeaker: "A" | "B" | null;
  isConnected: boolean;
  userId?: string;
  sessionId: string;
}

export function DebatersHeader({
  sessionState,
  effectiveCurrentSpeaker,
  isConnected,
  userId,
  sessionId,
}: DebatersHeaderProps) {
  return (
    <div className="mb-4">
      <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl shadow-sm p-3 lg:p-4">
        <div className="text-center mb-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full mb-2">
            <div
              className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-xs font-medium text-foreground">
              {isConnected ? "Live" : "Offline"}
            </span>
          </div>
          <h2 className="text-sm lg:text-base font-semibold text-muted-foreground">
            {sessionState.topic}
          </h2>
        </div>

        <div className="flex items-center justify-center gap-4 lg:gap-8">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar
                name={sessionState.debaterAName || "Debater A"}
                size="sm"
                isActive={effectiveCurrentSpeaker === "A"}
                isSpeaking={false}
                showName={false}
              />
              {effectiveCurrentSpeaker === "A" && (
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card animate-pulse" />
              )}
            </div>
            <div>
              <div className="font-medium text-foreground text-sm">
                {sessionState.debaterAName || "Debater A"}
              </div>
              {userId === sessionState.debaterAId && (
                <div className="inline-flex items-center px-1.5 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                  You
                </div>
              )}
            </div>
          </div>

          <div className="px-2 py-1 bg-gradient-to-r from-primary/10 to-accent/10 border border-border rounded-full">
            <span className="text-xs font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              VS
            </span>
          </div>

          <div className="flex items-center gap-3">
            {sessionState.debaterBId ? (
              <>
                <div className="relative">
                  <Avatar
                    name={sessionState.debaterBName || "Debater B"}
                    size="sm"
                    isActive={effectiveCurrentSpeaker === "B"}
                    isSpeaking={false}
                    showName={false}
                  />
                  {effectiveCurrentSpeaker === "B" && (
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card animate-pulse" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-foreground text-sm">
                    {sessionState.debaterBName || "Debater B"}
                  </div>
                  {userId === sessionState.debaterBId && (
                    <div className="inline-flex items-center px-1.5 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                      You
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted border-2 border-dashed border-border flex items-center justify-center">
                  <span className="text-xl text-muted-foreground">?</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Waiting for opponent
                  </div>
                  {userId === sessionState.debaterAId && (
                    <div className="mt-1">
                      <InviteButton debateId={sessionId} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {sessionState.debaterAId &&
          sessionState.debaterBId &&
          sessionState.status === "CREATED" && (
            <div className="mt-3 p-2 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg text-center border border-green-200 dark:border-green-800">
              <p className="text-green-800 dark:text-green-200 text-sm font-medium">
                🎉 Debate Ready! Both debaters have joined. The debate will
                start soon.
              </p>
            </div>
          )}
      </div>
    </div>
  );
}

