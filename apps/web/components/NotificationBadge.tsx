"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, UserPlus, Zap, Check, X, Clock } from "lucide-react";
import { useNotifications } from "../lib/hooks/useNotifications";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

interface NotificationBadgeProps {
  className?: string;
}

export function NotificationBadge({ className = "" }: NotificationBadgeProps) {
  const { friendRequests, challenges, totalCount, refresh } =
    useNotifications(true);
  const [isOpen, setIsOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  const visibleFriendRequests = friendRequests.filter(
    (req) => !dismissedIds.has(req.id)
  );
  const visibleChallenges = challenges.filter((ch) => !dismissedIds.has(ch.id));
  const visibleTotalCount =
    visibleFriendRequests.length + visibleChallenges.length;

  if (visibleTotalCount === 0 && totalCount === 0) return null;

  const handleAcceptFriendRequest = async (
    requestId: string,
    userName: string
  ) => {
    try {
      const response = await fetch(
        `/api/friends/requests/${requestId}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ACCEPT" }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to accept friend request");
      }

      toast.success(`Friend request from ${userName} accepted!`);
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to accept friend request"
      );
    }
  };

  const handleRejectFriendRequest = async (requestId: string) => {
    try {
      const response = await fetch(
        `/api/friends/requests/${requestId}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "REJECT" }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to reject friend request");
      }

      toast.success("Friend request rejected");
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to reject friend request"
      );
    }
  };

  const handleAcceptChallenge = async (
    challengeId: string,
    userName: string
  ) => {
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
      setIsOpen(false);

      if (data.debate?.id) {
        router.push(`/debate/${data.debate.id}`);
      } else {
        refresh();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to accept challenge"
      );
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-md hover:bg-muted transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {visibleTotalCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs font-semibold text-primary-foreground bg-primary rounded-full border-2 border-background">
            {visibleTotalCount > 99 ? "99+" : visibleTotalCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-lg shadow-lg z-50 max-h-[500px] overflow-y-auto">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-card-foreground">
              Notifications
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-2">
            {visibleFriendRequests.length === 0 &&
            visibleChallenges.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No notifications</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Friend Requests */}
                {visibleFriendRequests.slice(0, 5).map((request) => (
                  <div
                    key={request.id}
                    className="group relative p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors"
                  >
                    <button
                      onClick={() => handleDismiss(request.id)}
                      className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Dismiss notification"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-start gap-3 pr-6">
                      <div className="flex-shrink-0 mt-1">
                        {request.user.image ? (
                          <img
                            src={request.user.image}
                            alt={request.user.name || request.user.email}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-primary text-xs font-semibold">
                              {(request.user.name ||
                                request.user.email)[0]?.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <UserPlus className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          <p className="text-sm font-medium text-card-foreground">
                            Friend Request
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2 truncate">
                          {request.user.name || request.user.email}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              handleAcceptFriendRequest(
                                request.id,
                                request.user.name || request.user.email
                              )
                            }
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                          >
                            <Check className="w-3 h-3" />
                            Accept
                          </button>
                          <button
                            onClick={() =>
                              handleRejectFriendRequest(request.id)
                            }
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Challenges */}
                {visibleChallenges.slice(0, 5).map((challenge) => (
                  <div
                    key={challenge.id}
                    className="group relative p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted transition-colors"
                  >
                    <button
                      onClick={() => handleDismiss(challenge.id)}
                      className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Dismiss notification"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-start gap-3 pr-6">
                      <div className="flex-shrink-0 mt-1">
                        {challenge.user.image ? (
                          <img
                            src={challenge.user.image}
                            alt={challenge.user.name || challenge.user.email}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                            <span className="text-accent-foreground text-xs font-semibold">
                              {(challenge.user.name ||
                                challenge.user.email)[0]?.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Zap className="w-3.5 h-3.5 text-accent-foreground flex-shrink-0" />
                          <p className="text-sm font-medium text-card-foreground">
                            Challenge
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2 truncate">
                          {challenge.user.name || challenge.user.email}
                        </p>
                        <div className="bg-muted/50 rounded p-2 mb-2">
                          <p className="text-xs font-medium text-card-foreground mb-1">
                            Topic:
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {challenge.topic}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {challenge.rounds} rounds
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            handleAcceptChallenge(
                              challenge.id,
                              challenge.user.name || challenge.user.email
                            )
                          }
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-accent text-accent-foreground hover:opacity-90 transition-opacity w-full justify-center"
                        >
                          <Check className="w-3 h-3" />
                          Accept Challenge
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {(visibleFriendRequests.length > 5 ||
                  visibleChallenges.length > 5) && (
                  <div className="pt-2 border-t border-border">
                    <button
                      onClick={() => {
                        setIsOpen(false);
                        router.push("/dashboard");
                      }}
                      className="w-full text-center text-sm text-primary hover:underline"
                    >
                      View all notifications
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
