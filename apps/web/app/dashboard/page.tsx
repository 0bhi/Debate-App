"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { TopicForm } from "../../components/TopicForm";
import { DebatesSidebar } from "../../components/DebatesSidebar";
import { UserSearch } from "../../components/UserSearch";
import { FriendRequests } from "../../components/FriendRequests";
import { useDebateStore } from "../../lib/stores/debate-store";
import { Brain, Plus, Search, UserPlus, Sparkles } from "lucide-react";

type TabType = "create" | "search" | "requests";

export default function Dashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("create");
  const { createDebate } = useDebateStore();

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  const handleCreateDebate = async (request: any) => {
    setIsCreating(true);
    try {
      const userId = (session?.user as any)?.id;
      const sessionId = await createDebate(request, userId);
      // Redirect immediately to the debate room
      // No need to reset isCreating since we're navigating away
      router.push(`/debate/${sessionId}`);
    } catch (error) {
      console.error("Failed to create debate:", error);
      setIsCreating(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-background relative">
      <DebatesSidebar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-foreground tracking-tight">
                Dashboard
              </h1>
              <p className="text-muted-foreground mt-1">
                Create debates, connect with friends, and challenge others
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <nav className="flex gap-1 p-1 bg-muted/50 rounded-lg border border-border">
            <button
              onClick={() => {
                setActiveTab("create");
                setShowCreateForm(false);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-md font-medium text-sm transition-all ${
                activeTab === "create"
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Plus className="w-4 h-4" />
              Create Debate
            </button>
            <button
              onClick={() => {
                setActiveTab("search");
                setShowCreateForm(false);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-md font-medium text-sm transition-all ${
                activeTab === "search"
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Search className="w-4 h-4" />
              Search Users
            </button>
            <button
              onClick={() => {
                setActiveTab("requests");
                setShowCreateForm(false);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-md font-medium text-sm transition-all ${
                activeTab === "requests"
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <UserPlus className="w-4 h-4" />
              Requests
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "create" && (
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-8">
            {!showCreateForm ? (
              <div className="text-center py-12">
                <div className="flex justify-center mb-6">
                  <div className="p-5 bg-primary/10 rounded-2xl">
                    <Brain className="w-14 h-14 text-primary" />
                  </div>
                </div>
                <h2 className="text-3xl font-bold text-foreground mb-3">
                  Create a New Debate
                </h2>
                <p className="text-muted-foreground mb-8 max-w-md mx-auto text-lg">
                  Start a new debate session. Set your topic, configure rounds,
                  and invite an opponent to join.
                </p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-8 py-4 bg-primary text-primary-foreground font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 mx-auto shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  Create Debate
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-foreground">
                    Create New Debate
                  </h2>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                <TopicForm
                  onSubmit={handleCreateDebate}
                  isLoading={isCreating}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === "search" && (
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-foreground mb-6">
              Search Users
            </h2>
            <UserSearch />
          </div>
        )}

        {activeTab === "requests" && (
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-foreground mb-6">
              Friend Requests & Challenges
            </h2>
            <FriendRequests />
          </div>
        )}
      </div>
    </div>
  );
}
