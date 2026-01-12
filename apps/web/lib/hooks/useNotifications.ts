"use client";

import { useState, useEffect, useCallback } from "react";
import { logger } from "../logger";

export interface FriendRequestNotification {
  id: string;
  type: "friend_request";
  status: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

export interface ChallengeNotification {
  id: string;
  type: "challenge";
  topic: string;
  rounds: number;
  status: string;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

export type Notification = FriendRequestNotification | ChallengeNotification;

export function useNotifications(enabled: boolean = true, pollInterval: number = 30000) {
  const [friendRequests, setFriendRequests] = useState<FriendRequestNotification[]>([]);
  const [challenges, setChallenges] = useState<ChallengeNotification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;
    
    try {
      setIsLoading(true);
      
      // Fetch friend requests and challenges in parallel
      // Use Promise.allSettled to handle individual failures gracefully
      const [friendRequestsResult, challengesResult] = await Promise.allSettled([
        fetch("/api/friends/requests?type=received", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include", // Include cookies for authentication
        }),
        fetch("/api/challenges?type=received", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include", // Include cookies for authentication
        }),
      ]);

      // Handle friend requests
      if (friendRequestsResult.status === "fulfilled") {
        const friendRequestsRes = friendRequestsResult.value;
        if (friendRequestsRes.ok) {
          try {
            const friendRequestsData = await friendRequestsRes.json();
            setFriendRequests(friendRequestsData.map((req: any) => ({
              ...req,
              type: "friend_request" as const,
            })));
          } catch (parseError) {
            logger.error("Failed to parse friend requests response", { error: parseError });
            // Keep existing friend requests on parse error
          }
        } else {
          // Log non-OK responses but don't throw
          if (friendRequestsRes.status !== 404 && friendRequestsRes.status !== 401) {
            logger.warn("Friend requests API returned non-OK status", { status: friendRequestsRes.status });
          }
        }
      } else {
        // Log fetch errors but don't break the whole hook
        const error = friendRequestsResult.reason;
        logger.error("Failed to fetch friend requests", {
          error: error instanceof Error ? error.message : String(error),
          isNetworkError: error instanceof TypeError && error.message === "Failed to fetch",
        });
      }

      // Handle challenges
      if (challengesResult.status === "fulfilled") {
        const challengesRes = challengesResult.value;
        if (challengesRes.ok) {
          try {
            const challengesData = await challengesRes.json();
            setChallenges(challengesData.map((ch: any) => ({
              ...ch,
              type: "challenge" as const,
            })));
          } catch (parseError) {
            logger.error("Failed to parse challenges response", { error: parseError });
            // Keep existing challenges on parse error
          }
        } else {
          // Log non-OK responses but don't throw
          if (challengesRes.status !== 404 && challengesRes.status !== 401) {
            logger.warn("Challenges API returned non-OK status", { status: challengesRes.status });
          }
        }
      } else {
        // Log fetch errors but don't break the whole hook
        const error = challengesResult.reason;
        logger.error("Failed to fetch challenges", {
          error: error instanceof Error ? error.message : String(error),
          isNetworkError: error instanceof TypeError && error.message === "Failed to fetch",
        });
      }
    } catch (error) {
      // This should rarely happen with Promise.allSettled, but handle it just in case
      logger.error("Unexpected error in fetchNotifications", { error });
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    // Fetch immediately
    fetchNotifications();

    // Set up polling
    const interval = setInterval(fetchNotifications, pollInterval);

    return () => clearInterval(interval);
  }, [enabled, fetchNotifications, pollInterval]);

  const totalCount = friendRequests.length + challenges.length;

  return {
    friendRequests,
    challenges,
    totalCount,
    isLoading,
    refresh: fetchNotifications,
  };
}
