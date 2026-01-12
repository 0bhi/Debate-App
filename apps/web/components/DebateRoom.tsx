"use client";

import { useEffect, useState, useRef } from "react";
import { useDebateStore } from "../lib/stores/debate-store";
import { Avatar } from "./Avatar";
import { Transcript } from "./Transcript";
import { JudgePanel } from "./JudgePanel";
import { ArgumentInput } from "./ArgumentInput";
import { DebatesSidebar } from "./DebatesSidebar";
import { InviteButton } from "./InviteButton";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";

interface DebateRoomProps {
  sessionId: string;
}

export function DebateRoom({ sessionId }: DebateRoomProps) {
  const { data: session, status: sessionStatus } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    sessionState,
    currentTurn,
    isConnected,
    error,
    loadDebate,
    connectWebSocket,
    disconnectWebSocket,
    submitArgument,
    clearError,
    setCurrentTurn,
  } = useDebateStore();

  const [invitationAccepted, setInvitationAccepted] = useState(false);
  const isInitializedRef = useRef(false);
  const currentSessionIdRef = useRef<string | null>(null);
  const inviteToken = searchParams.get("invite");

  // Check authentication BEFORE trying to load debate when invite token is present
  useEffect(() => {
    if (sessionStatus === "loading") {
      // Still loading session, wait
      return;
    }

    // If there's an invite token but user is not authenticated, redirect to sign in
    if (inviteToken && sessionStatus === "unauthenticated") {
      const callbackUrl = `/debate/${sessionId}?invite=${inviteToken}`;
      router.push(
        `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`
      );
      return;
    }
  }, [sessionStatus, inviteToken, sessionId, router]);

  useEffect(() => {
    const initializeRoom = async () => {
      // Prevent multiple initializations for the same session
      if (
        isInitializedRef.current &&
        currentSessionIdRef.current === sessionId
      ) {
        return;
      }

      // Don't initialize if we have an invite token but user is not authenticated
      if (inviteToken && sessionStatus === "unauthenticated") {
        return;
      }

      try {
        const userId = (session?.user as any)?.id;
        await loadDebate(sessionId);
        await connectWebSocket(sessionId, userId);
        isInitializedRef.current = true;
        currentSessionIdRef.current = sessionId;
      } catch (error) {
        console.error("Failed to initialize debate room:", error);
        toast.error("Failed to connect to debate");
        isInitializedRef.current = false;
      }
    };

    // Only initialize when session is loaded and user is authenticated (or no invite token)
    if (sessionStatus !== "loading") {
      if (!inviteToken || sessionStatus === "authenticated") {
        initializeRoom();
      }
    }

    // Cleanup: disconnect WebSocket when component unmounts or sessionId changes
    return () => {
      if (currentSessionIdRef.current === sessionId) {
        disconnectWebSocket();
        isInitializedRef.current = false;
        currentSessionIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session?.user?.id, sessionStatus, inviteToken]); // Only depend on primitive values, store functions are stable

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]); // clearError is stable, no need to include it

  // Define variables that depend on sessionState (but hooks must come before early returns)
  const userId = (session?.user as any)?.id;

  // Fix: Set currentTurn when debate starts and when turns change
  // This handles the case where the user misses the YOUR_TURN message
  useEffect(() => {
    if (!sessionState || !userId || sessionState.status !== "RUNNING") {
      return;
    }

    // If debate just started (no turns yet), first turn is always debater A
    if (sessionState.turns.length === 0) {
      if (!currentTurn.speaker) {
        setCurrentTurn("A");
      }
      return;
    }

    // If we have turns, determine who should go next
    const lastTurn = sessionState.turns[sessionState.turns.length - 1];
    if (lastTurn) {
      const nextSpeaker: "A" | "B" = lastTurn.speaker === "A" ? "B" : "A";

      // Only update if currentTurn is not set or doesn't match expected next speaker
      if (!currentTurn.speaker || currentTurn.speaker !== nextSpeaker) {
        setCurrentTurn(nextSpeaker);
      }
    }
  }, [
    sessionState?.turns.length,
    sessionState?.status,
    userId,
    currentTurn.speaker,
    setCurrentTurn,
  ]);

  // Handle invitation acceptance separately after debate state is loaded and WebSocket is connected
  // This hook must be called before any early returns to follow Rules of Hooks
  useEffect(() => {
    const handleInvitation = async () => {
      if (!sessionState || invitationAccepted || !isConnected) return;

      if (inviteToken && userId && session?.user) {
        // Check if debater B is already assigned
        if (!sessionState.debaterBId && sessionState.debaterAId !== userId) {
          try {
            const { apiClient } = await import("../lib/api");
            await apiClient.acceptInvitation(sessionId, inviteToken);
            toast.success("Invitation accepted! You are now Debater B.");
            setInvitationAccepted(true);
            // Reload debate state after accepting to get updated state
            // The WebSocket will also receive the broadcast with updated state
            await loadDebate(sessionId);
            // Remove invite token from URL
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.delete("invite");
              window.history.replaceState({}, "", url.toString());
            }
          } catch (error: any) {
            console.error("Failed to accept invitation:", error);
            const errorMessage = error.message || "Failed to accept invitation";
            toast.error(errorMessage);
            setInvitationAccepted(true); // Mark as attempted to prevent retries
          }
        } else if (sessionState.debaterBId === userId) {
          // User is already debater B, mark as accepted
          setInvitationAccepted(true);
          // Remove invite token from URL
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.delete("invite");
            window.history.replaceState({}, "", url.toString());
          }
        }
      }
    };

    // Only attempt to accept invitation when WebSocket is connected
    if (isConnected) {
      handleInvitation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sessionState?.id,
    session?.user?.id,
    invitationAccepted,
    userId,
    inviteToken,
    sessionId,
    isConnected,
  ]); // Only depend on primitive values, not objects/functions

  // Show loading state while session is being checked or debate is loading
  if (sessionStatus === "loading" || (!sessionState && !inviteToken)) {
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

  // Show loading state if we have an invite token but are waiting for authentication
  if (inviteToken && sessionStatus === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">
            Redirecting to sign in...
          </p>
        </div>
      </div>
    );
  }

  // Show loading state if sessionState is not loaded yet (for authenticated users)
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

  // Calculate if it's the user's turn
  // Determine current speaker from turns if currentTurn is not set
  const lastTurn =
    sessionState.turns.length > 0
      ? sessionState.turns[sessionState.turns.length - 1]
      : null;

  // If there's a currentTurn set, use it; otherwise infer from last turn
  const effectiveCurrentSpeaker: "A" | "B" | null =
    currentTurn.speaker ||
    (lastTurn
      ? lastTurn.speaker === "A"
        ? "B"
        : "A" // Next speaker alternates
      : sessionState.status === "RUNNING" && sessionState.turns.length === 0
        ? "A"
        : null); // First turn is always A

  // Calculate if it's the user's turn
  const isMyTurn =
    sessionState.status === "RUNNING" &&
    effectiveCurrentSpeaker !== null &&
    ((effectiveCurrentSpeaker === "A" && userId === sessionState.debaterAId) ||
      (effectiveCurrentSpeaker === "B" && userId === sessionState.debaterBId));

  // Check if debate is over
  const isDebateOver =
    sessionState.status === "FINISHED" || sessionState.winner !== undefined;

  // Dynamic grid layout: during debate main content is larger, after debate judge panel is larger
  // During debate: Transcript 75%, Judge 25% | After debate: Judge 67%, Transcript 33%
  const transcriptColSpan = isDebateOver ? "lg:col-span-4" : "lg:col-span-9";
  const judgeColSpan = isDebateOver ? "lg:col-span-8" : "lg:col-span-3";

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 relative flex flex-col">
      <DebatesSidebar currentDebateId={sessionId} />
      <div className="flex-1 flex flex-col max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-0 w-full">
        {/* Compact Debaters Section */}
        <div className="mb-4">
          <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl shadow-sm p-3 lg:p-4">
            {/* Topic Header - Compact */}
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

            {/* Compact Debaters Display */}
            <div className="flex items-center justify-center gap-4 lg:gap-8">
              {/* Debater A */}
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

              {/* VS Divider - Compact */}
              <div className="px-2 py-1 bg-gradient-to-r from-primary/10 to-accent/10 border border-border rounded-full">
                <span className="text-xs font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  VS
                </span>
              </div>

              {/* Debater B */}
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

            {/* Debate Ready Status - Compact */}
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

        {/* Main Content Area - Dynamic grid layout */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="grid lg:grid-cols-12 gap-4 flex-1 min-h-0">
            {/* Transcript Section - Larger during debate, smaller after */}
            <div
              className={`${transcriptColSpan} flex flex-col min-h-0 ${isMyTurn && !isDebateOver ? "pb-24" : ""}`}
            >
              <div className="flex-1 min-h-0 overflow-y-auto">
                <Transcript
                  sessionState={sessionState}
                  currentTurn={{ speaker: effectiveCurrentSpeaker, text: "" }}
                />
              </div>

              {/* Waiting for opponent - only show when not user's turn */}
              {sessionState.status === "RUNNING" &&
                effectiveCurrentSpeaker &&
                !isMyTurn && (
                  <div className="mt-4 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center">
                    <p className="text-amber-800 dark:text-amber-200 text-sm font-medium">
                      ⏳ Waiting for{" "}
                      {effectiveCurrentSpeaker === "A"
                        ? sessionState.debaterAName
                        : sessionState.debaterBName}{" "}
                      to respond...
                    </p>
                  </div>
                )}
            </div>

            {/* Judge Panel - Smaller during debate, larger after */}
            <div className={judgeColSpan}>
              <JudgePanel sessionState={sessionState} />
            </div>
          </div>
        </div>

        {/* Sticky Input Area - Always visible during running debate */}
        {sessionState.status === "RUNNING" && !isDebateOver && (
          <div className="sticky bottom-0 left-0 right-0 z-50 bg-background backdrop-blur-sm -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4">
            <div className="max-w-7xl mx-auto">
              <ArgumentInput
                sessionId={sessionId}
                disabled={!isMyTurn}
                isMyTurn={isMyTurn}
                currentSpeaker={effectiveCurrentSpeaker}
                debaterAName={sessionState.debaterAName || "Debater A"}
                debaterBName={sessionState.debaterBName || "Debater B"}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
