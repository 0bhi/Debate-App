"use client";

import { useState } from "react";
import { Avatar } from "./Avatar";
import { UserPlus, Sword, Check, X, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface UserCardProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    friendRequest?: {
      id: string;
      status: "PENDING" | "ACCEPTED" | "REJECTED";
      isSender: boolean;
    } | null;
    isFriend: boolean;
  };
  onUpdate?: () => void;
}

export function UserCard({ user, onUpdate }: UserCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [challengeTopic, setChallengeTopic] = useState("");
  const router = useRouter();

  const handleSendFriendRequest = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: user.id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send friend request");
      }

      toast.success("Friend request sent!");
      onUpdate?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send friend request");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChallengeUser = async () => {
    if (!challengeTopic.trim()) {
      toast.error("Please enter a topic for the debate");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengedId: user.id,
          topic: challengeTopic.trim(),
          rounds: 3,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send challenge");
      }

      toast.success("Challenge sent!");
      setShowChallengeModal(false);
      setChallengeTopic("");
      onUpdate?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send challenge");
    } finally {
      setIsLoading(false);
    }
  };

  const getFriendRequestStatus = () => {
    if (user.isFriend) {
      return { label: "Friends", icon: Check, disabled: true, variant: "success" };
    }
    if (user.friendRequest) {
      if (user.friendRequest.status === "PENDING") {
        if (user.friendRequest.isSender) {
          return { label: "Request Sent", icon: Clock, disabled: true, variant: "pending" };
        } else {
          return { label: "Accept Request", icon: Check, disabled: false, variant: "pending" };
        }
      }
    }
    return { label: "Add Friend", icon: UserPlus, disabled: false, variant: "default" };
  };

  const friendRequestStatus = getFriendRequestStatus();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-md hover:shadow-lg transition-shadow">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name || user.email}
              className="w-16 h-16 rounded-full object-cover border-2 border-slate-300 dark:border-slate-600"
            />
          ) : (
            <div className="w-16 h-16">
              <Avatar name={user.name || user.email} size="sm" />
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 dark:text-white truncate">
            {user.name || "Unknown User"}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
            {user.email}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {!user.isFriend && friendRequestStatus.label !== "Accept Request" && (
            <button
              onClick={handleSendFriendRequest}
              disabled={isLoading || friendRequestStatus.disabled}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
                transition-colors
                ${
                  friendRequestStatus.disabled
                    ? "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }
              `}
            >
              <friendRequestStatus.icon className="w-4 h-4" />
              {friendRequestStatus.label}
            </button>
          )}

          {!user.isFriend && (
            <button
              onClick={() => setShowChallengeModal(true)}
              disabled={isLoading || user.friendRequest?.status === "PENDING"}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
                transition-colors
                ${
                  user.friendRequest?.status === "PENDING"
                    ? "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                    : "bg-amber-500 hover:bg-amber-600 text-white"
                }
              `}
            >
              <Sword className="w-4 h-4" />
              Challenge
            </button>
          )}

          {user.isFriend && (
            <button
              onClick={() => setShowChallengeModal(true)}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
            >
              <Sword className="w-4 h-4" />
              Challenge
            </button>
          )}
        </div>
      </div>

      {/* Challenge Modal */}
      {showChallengeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">
              Challenge {user.name || user.email}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Enter the topic for your debate challenge:
            </p>
            <textarea
              value={challengeTopic}
              onChange={(e) => setChallengeTopic(e.target.value)}
              placeholder="e.g., Should AI be regulated by governments?"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
              rows={4}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowChallengeModal(false);
                  setChallengeTopic("");
                }}
                className="px-4 py-2 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleChallengeUser}
                disabled={isLoading || !challengeTopic.trim()}
                className="px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-600 text-white disabled:bg-slate-300 disabled:text-slate-500 transition-colors"
              >
                {isLoading ? "Sending..." : "Send Challenge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

