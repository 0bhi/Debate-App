"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { TopicForm } from "../../components/TopicForm";
import { Header } from "../../components/Header";
import { DebatesSidebar } from "../../components/DebatesSidebar";
import { UserSearch } from "../../components/UserSearch";
import { FriendRequests } from "../../components/FriendRequests";
import { useDebateStore } from "../../lib/stores/debate-store";
import { Brain, Plus, Search, UserPlus } from "lucide-react";

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
      <div className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600 dark:text-slate-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 relative">
      <Header />
      <DebatesSidebar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Dashboard
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Create debates, search users, manage friend requests, and more
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-slate-200 dark:border-slate-700">
          <nav className="flex space-x-8">
            <button
              onClick={() => {
                setActiveTab("create");
                setShowCreateForm(false);
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "create"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create Debate
              </div>
            </button>
            <button
              onClick={() => {
                setActiveTab("search");
                setShowCreateForm(false);
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "search"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Search Users
              </div>
            </button>
            <button
              onClick={() => {
                setActiveTab("requests");
                setShowCreateForm(false);
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "requests"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Requests
              </div>
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "create" && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
            {!showCreateForm ? (
              <div className="text-center py-12">
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                    <Brain className="w-12 h-12 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  Create a New Debate
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto">
                  Start a new debate session. Set your topic, configure rounds,
                  and invite an opponent to join.
                </p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 mx-auto"
                >
                  <Plus className="w-5 h-5" />
                  Create Debate
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    Create New Debate
                  </h2>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
              Search Users
            </h2>
            <UserSearch />
          </div>
        )}

        {activeTab === "requests" && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">
              Friend Requests & Challenges
            </h2>
            <FriendRequests />
          </div>
        )}
      </div>
    </div>
  );
}
