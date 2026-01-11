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
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
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

  const isMyTurn =
    sessionState.status === "RUNNING" &&
    currentTurn.speaker &&
    ((currentTurn.speaker === "A" && userId === sessionState.debaterAId) ||
      (currentTurn.speaker === "B" && userId === sessionState.debaterBId));

  return (
    <div className="min-h-screen p-4 relative">
      <DebatesSidebar currentDebateId={sessionId} />
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="text-center mb-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Debate Platform
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
                name={sessionState.debaterAName || "Debater A"}
                size="lg"
                isActive={currentTurn.speaker === "A"}
                isSpeaking={false}
              />
              {userId === sessionState.debaterAId && (
                <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                  (You)
                </div>
              )}
            </div>

            <div className="flex flex-col items-center">
              <div className="text-4xl mb-2">⚡</div>
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
                VS
              </div>
            </div>

            <div className="text-center">
              {sessionState.debaterBId ? (
                <>
                  <Avatar
                    name={sessionState.debaterBName || "Debater B"}
                    size="lg"
                    isActive={currentTurn.speaker === "B"}
                    isSpeaking={false}
                  />
                  {userId === sessionState.debaterBId && (
                    <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                      (You)
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                    <span className="text-2xl">?</span>
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    Waiting for opponent...
                  </div>
                  {userId === sessionState.debaterAId && (
                    <div className="mt-2">
                      <InviteButton debateId={sessionId} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Debate Ready Status */}
          {sessionState.debaterAId &&
            sessionState.debaterBId &&
            sessionState.status === "CREATED" && (
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center border border-green-200 dark:border-green-800">
                <p className="text-green-800 dark:text-green-200 font-medium">
                  🎉 Debate Ready! Both debaters have joined. The debate will
                  start soon.
                </p>
              </div>
            )}
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Transcript - Takes up 2/3 on large screens */}
          <div className="lg:col-span-2">
            <Transcript sessionState={sessionState} currentTurn={currentTurn} />

            {/* Argument Input Form - Show when it's user's turn */}
            {isMyTurn && (
              <div className="mt-4">
                <ArgumentInput
                  onSubmit={(argument) => submitArgument(sessionId, argument)}
                  isSubmitting={false}
                />
              </div>
            )}

            {/* Waiting for opponent */}
            {sessionState.status === "RUNNING" &&
              currentTurn.speaker &&
              !isMyTurn && (
                <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-center">
                  <p className="text-yellow-800 dark:text-yellow-200">
                    Waiting for{" "}
                    {currentTurn.speaker === "A"
                      ? sessionState.debaterAName
                      : sessionState.debaterBName}{" "}
                    to respond...
                  </p>
                </div>
              )}
          </div>

          {/* Judge Panel - Takes up 1/3 on large screens */}
          <div className="lg:col-span-1">
            <JudgePanel sessionState={sessionState} />
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
