"use client";

import { useState, useEffect } from "react";
import { UserPlus, Check, X, Clock, Users } from "lucide-react";
import { Avatar } from "./Avatar";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

interface FriendRequest {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

interface Challenge {
  id: string;
  topic: string;
  rounds: number;
  status: string;
  debateId: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

export function FriendRequests() {
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"requests" | "challenges">("requests");
  const router = useRouter();

  useEffect(() => {
    fetchFriendRequests();
    fetchChallenges();
  }, []);

  const fetchFriendRequests = async () => {
    try {
      const response = await fetch("/api/friends/requests?type=received");
      if (!response.ok) {
        throw new Error("Failed to fetch friend requests");
      }
      const data = await response.json();
      setFriendRequests(data);
    } catch (error) {
      console.error("Failed to fetch friend requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChallenges = async () => {
    try {
      const response = await fetch("/api/challenges?type=received");
      if (!response.ok) {
        throw new Error("Failed to fetch challenges");
      }
      const data = await response.json();
      setChallenges(data);
    } catch (error) {
      console.error("Failed to fetch challenges:", error);
    }
  };

  const handleRespondToRequest = async (requestId: string, action: "ACCEPT" | "REJECT") => {
    try {
      const response = await fetch(`/api/friends/requests/${requestId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to respond to friend request");
      }

      toast.success(
        action === "ACCEPT" ? "Friend request accepted!" : "Friend request rejected"
      );
      fetchFriendRequests();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to respond to friend request");
    }
  };

  const handleAcceptChallenge = async (challengeId: string) => {
    try {
      const response = await fetch(`/api/challenges/${challengeId}/accept`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to accept challenge");
      }

      const data = await response.json();
      toast.success("Challenge accepted! Creating debate...");
      
      // Navigate to debate if created
      if (data.debate?.id) {
        router.push(`/debate/${data.debate.id}`);
      } else {
        fetchChallenges();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to accept challenge");
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Tabs */}
      <div className="flex gap-2 mb-6 p-1 bg-muted/50 rounded-lg border border-border">
        <button
          onClick={() => setActiveTab("requests")}
          className={`flex-1 px-4 py-2 font-medium transition-all rounded-md relative ${
            activeTab === "requests"
              ? "bg-background text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          Friend Requests
          {friendRequests.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full font-semibold">
              {friendRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("challenges")}
          className={`flex-1 px-4 py-2 font-medium transition-all rounded-md relative ${
            activeTab === "challenges"
              ? "bg-background text-foreground shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          Debate Challenges
          {challenges.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-accent/20 text-accent-foreground rounded-full font-semibold">
              {challenges.length}
            </span>
          )}
        </button>
      </div>

      {/* Friend Requests Tab */}
      {activeTab === "requests" && (
        <div>
          {friendRequests.length > 0 ? (
            <div className="space-y-3">
              {friendRequests.map((request) => (
                <div
                  key={request.id}
                  className="bg-card border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    {request.user.image ? (
                      <img
                        src={request.user.image}
                        alt={request.user.name || request.user.email}
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-primary/20"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full ring-2 ring-primary/20 bg-primary/20 flex items-center justify-center flex-shrink-0">
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
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-card-foreground">
                        {request.user.name || "Unknown User"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {request.user.email}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        Sent {new Date(request.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRespondToRequest(request.id, "ACCEPT")}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                      >
                        <Check className="w-4 h-4" />
                        Accept
                      </button>
                      <button
                        onClick={() => handleRespondToRequest(request.id, "REJECT")}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <UserPlus className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">
                No pending friend requests
              </p>
            </div>
          )}
        </div>
      )}

      {/* Challenges Tab */}
      {activeTab === "challenges" && (
        <div>
          {challenges.length > 0 ? (
            <div className="space-y-3">
              {challenges.map((challenge) => (
                <div
                  key={challenge.id}
                  className="bg-card border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    {challenge.user.image ? (
                      <img
                        src={challenge.user.image}
                        alt={challenge.user.name || challenge.user.email}
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-accent/20"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full ring-2 ring-accent/20 bg-accent/20 flex items-center justify-center flex-shrink-0">
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
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-card-foreground">
                        {challenge.user.name || "Unknown User"}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {challenge.user.email}
                      </p>
                      <div className="bg-muted/50 rounded-md p-3 mt-2">
                        <p className="text-sm font-medium text-card-foreground mb-1">
                          Debate Topic:
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {challenge.topic}
                        </p>
                        <p className="text-xs text-muted-foreground/70 mt-2">
                          {challenge.rounds} rounds • Sent{" "}
                          {new Date(challenge.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleAcceptChallenge(challenge.id)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
                      >
                        <Check className="w-4 h-4" />
                        Accept
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">
                No pending debate challenges
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

