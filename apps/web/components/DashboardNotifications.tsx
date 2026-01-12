"use client";

import { useState, useEffect } from "react";
import { X, UserPlus, Zap, Check, X as XIcon, Clock } from "lucide-react";
import { useNotifications } from "../lib/hooks/useNotifications";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

export function DashboardNotifications() {
  const { friendRequests, challenges, refresh } = useNotifications(true, 20000); // Poll every 20s
  const [isOpen, setIsOpen] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  // Auto-hide after 10 seconds if there are no notifications
  useEffect(() => {
    if (friendRequests.length === 0 && challenges.length === 0) {
      const timer = setTimeout(() => setIsOpen(false), 10000);
      return () => clearTimeout(timer);
    } else {
      setIsOpen(true);
    }
  }, [friendRequests.length, challenges.length]);

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  const handleAcceptFriendRequest = async (requestId: string, userName: string) => {
    try {
      const response = await fetch(`/api/friends/requests/${requestId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ACCEPT" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to accept friend request");
      }

      toast.success(`Friend request from ${userName} accepted!`);
      handleDismiss(requestId);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to accept friend request");
    }
  };

  const handleRejectFriendRequest = async (requestId: string) => {
    try {
      const response = await fetch(`/api/friends/requests/${requestId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT" }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to reject friend request");
      }

      toast.success("Friend request rejected");
      handleDismiss(requestId);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject friend request");
    }
  };

  const handleAcceptChallenge = async (challengeId: string, userName: string) => {
    try {
      const response = await fetch(`/api/challenges/${challengeId}/accept`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to accept challenge");
      }

      const data = await response.json();
      toast.success(`Challenge from ${userName} accepted! Creating debate...`);
      handleDismiss(challengeId);

      if (data.debate?.id) {
        router.push(`/debate/${data.debate.id}`);
      } else {
        refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to accept challenge");
    }
  };

  const visibleFriendRequests = friendRequests.filter(
    (req) => !dismissedIds.has(req.id)
  );
  const visibleChallenges = challenges.filter((ch) => !dismissedIds.has(ch.id));
  const hasVisibleNotifications = visibleFriendRequests.length > 0 || visibleChallenges.length > 0;

  if (!hasVisibleNotifications || !isOpen) return null;

  return (
    <div className="mb-6 space-y-3">
      {/* Friend Requests */}
      {visibleFriendRequests.slice(0, 3).map((request) => (
        <div
          key={request.id}
          className="group relative bg-card border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <button
            onClick={() => handleDismiss(request.id)}
            className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-4 pr-8">
            <div className="flex-shrink-0">
              {request.user.image ? (
                <img
                  src={request.user.image}
                  alt={request.user.name || request.user.email}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/20"
                />
              ) : (
                <div className="w-12 h-12 rounded-full ring-2 ring-primary/20 bg-primary/20 flex items-center justify-center">
                  <span className="text-primary font-semibold text-sm">
                    {(request.user.name || request.user.email)
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="w-4 h-4 text-primary flex-shrink-0" />
                <h3 className="font-semibold text-card-foreground">
                  New Friend Request
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                <span className="font-medium">{request.user.name || request.user.email}</span> wants to be your friend
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => handleAcceptFriendRequest(request.id, request.user.name || request.user.email)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  <Check className="w-4 h-4" />
                  Accept
                </button>
                <button
                  onClick={() => handleRejectFriendRequest(request.id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  <XIcon className="w-4 h-4" />
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Challenges */}
      {visibleChallenges.slice(0, 3).map((challenge) => (
        <div
          key={challenge.id}
          className="group relative bg-card border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <button
            onClick={() => handleDismiss(challenge.id)}
            className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-4 pr-8">
            <div className="flex-shrink-0">
              {challenge.user.image ? (
                <img
                  src={challenge.user.image}
                  alt={challenge.user.name || challenge.user.email}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-accent/20"
                />
              ) : (
                <div className="w-12 h-12 rounded-full ring-2 ring-accent/20 bg-accent/20 flex items-center justify-center">
                  <span className="text-accent-foreground font-semibold text-sm">
                    {(challenge.user.name || challenge.user.email)
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-accent-foreground flex-shrink-0" />
                <h3 className="font-semibold text-card-foreground">
                  Debate Challenge
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                <span className="font-medium">{challenge.user.name || challenge.user.email}</span> challenged you to a debate
              </p>

              <div className="bg-muted/50 rounded-md p-3 mb-3">
                <p className="text-sm font-medium text-card-foreground mb-1">
                  Topic:
                </p>
                <p className="text-sm text-muted-foreground">
                  {challenge.topic}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {challenge.rounds} rounds
                  </span>
                </div>
              </div>

              <button
                onClick={() => handleAcceptChallenge(challenge.id, challenge.user.name || challenge.user.email)}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
              >
                <Check className="w-4 h-4" />
                Accept Challenge
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
