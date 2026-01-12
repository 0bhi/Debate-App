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
    <div className="bg-card border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name || user.email}
              className="w-16 h-16 rounded-full object-cover border-2 border-border ring-2 ring-primary/10"
            />
          ) : (
            <div className="w-16 h-16">
              <Avatar name={user.name || user.email} size="sm" />
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-card-foreground truncate">
            {user.name || "Unknown User"}
          </h3>
          <p className="text-sm text-muted-foreground truncate">
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
                transition-opacity
                ${
                  friendRequestStatus.disabled
                    ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                    : "bg-primary text-primary-foreground hover:opacity-90"
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
                transition-opacity
                ${
                  user.friendRequest?.status === "PENDING"
                    ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                    : "bg-accent text-accent-foreground hover:opacity-90"
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
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
            >
              <Sword className="w-4 h-4" />
              Challenge
            </button>
          )}
        </div>
      </div>

      {/* Challenge Modal */}
      {showChallengeModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-card-foreground">
              Challenge {user.name || user.email}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Enter the topic for your debate challenge:
            </p>
            <textarea
              value={challengeTopic}
              onChange={(e) => setChallengeTopic(e.target.value)}
              placeholder="e.g., Should AI be regulated by governments?"
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background mb-4 transition-all"
              rows={4}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowChallengeModal(false);
                  setChallengeTopic("");
                }}
                className="px-4 py-2 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleChallengeUser}
                disabled={isLoading || !challengeTopic.trim()}
                className="px-4 py-2 rounded-md bg-accent text-accent-foreground hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground transition-opacity"
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

