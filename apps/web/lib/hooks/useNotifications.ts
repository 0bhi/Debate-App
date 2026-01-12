"use client";

import { useState, useEffect, useCallback } from "react";

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
      const [friendRequestsRes, challengesRes] = await Promise.all([
        fetch("/api/friends/requests?type=received"),
        fetch("/api/challenges?type=received"),
      ]);

      if (friendRequestsRes.ok) {
        const friendRequestsData = await friendRequestsRes.json();
        setFriendRequests(friendRequestsData.map((req: any) => ({
          ...req,
          type: "friend_request" as const,
        })));
      }

      if (challengesRes.ok) {
        const challengesData = await challengesRes.json();
        setChallenges(challengesData.map((ch: any) => ({
          ...ch,
          type: "challenge" as const,
        })));
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
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
