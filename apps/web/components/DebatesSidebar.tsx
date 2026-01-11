"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { 
  X, 
  ChevronRight, 
  MessageSquare, 
  Circle,
  Loader2 
} from "lucide-react";

interface Debate {
  id: string;
  topic: string;
  status: string;
  winner: string | null;
  rounds: number;
  autoJudge: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivity: string;
  debaterA: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
  debaterB: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  } | null;
  isCreator: boolean;
  isDebaterA: boolean;
  isDebaterB: boolean;
}

interface DebatesSidebarProps {
  currentDebateId?: string;
}

export function DebatesSidebar(_props: DebatesSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [debates, setDebates] = useState<Debate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { data: session, status } = useSession();

  const fetchDebates = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/debates");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Failed to fetch debates (${response.status})`;
        setError(errorMessage);
        throw new Error(errorMessage);
      }
      const data = await response.json();
      setDebates(data);
      setError(null);
    } catch (error) {
      console.error("Failed to fetch debates:", error);
      // Don't set debates to empty array on error, keep previous data
      // setDebates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && isOpen) {
      fetchDebates();
    }
  }, [status, isOpen, fetchDebates]);

  const handleDebateClick = (debateId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling to overlay
    setIsOpen(false); // Close sidebar when navigating
    router.push(`/debate/${debateId}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "RUNNING":
        return "bg-green-500";
      case "CREATED":
        return "bg-blue-500";
      case "JUDGING":
        return "bg-purple-500";
      case "FINISHED":
        return "bg-slate-400";
      case "FAILED":
        return "bg-red-500";
      default:
        return "bg-slate-400";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "RUNNING":
        return "Running";
      case "CREATED":
        return "Created";
      case "JUDGING":
        return "Judging";
      case "FINISHED":
        return "Finished";
      case "FAILED":
        return "Failed";
      default:
        return status;
    }
  };

  if (status !== "authenticated") {
    return null;
  }

  return (
    <>
      {/* Toggle Button - Visible when sidebar is closed */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-white dark:bg-slate-800 border-r border-t border-b border-slate-200 dark:border-slate-700 rounded-r-lg p-2 shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          aria-label="Open debates sidebar"
        >
          <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full z-50 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: "320px" }}
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside sidebar from closing it
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              All Debates
            </h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Content */}
        <div className="h-[calc(100vh-64px)] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <MessageSquare className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                {error}
              </p>
              <button
                onClick={fetchDebates}
                className="text-xs px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : debates.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No debates yet
              </p>
            </div>
          ) : (
            <div className="p-2">
              {debates.map((debate) => {
                const isRunning = debate.status === "RUNNING";

                return (
                  <button
                    key={debate.id}
                    onClick={(e) => handleDebateClick(debate.id, e)}
                    className="w-full text-left p-3 rounded-lg mb-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 border border-transparent"
                  >
                    <div className="flex items-start gap-3">
                      {/* Status Indicator */}
                      <div className="flex flex-col items-center gap-1 pt-1">
                        <Circle
                          className={`w-3 h-3 ${getStatusColor(debate.status)} ${
                            isRunning ? "animate-pulse" : ""
                          }`}
                          fill="currentColor"
                        />
                        {isRunning && (
                          <div className="w-1 h-1 bg-green-500 rounded-full animate-ping" />
                        )}
                      </div>

                      {/* Debate Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium truncate text-slate-900 dark:text-white">
                            {debate.topic}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              isRunning
                                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {getStatusLabel(debate.status)}
                          </span>
                          {isRunning && (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                              <Circle className="w-2 h-2 fill-current" />
                              Live
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                          {debate.debaterA
                            ? debate.debaterA.name || debate.debaterA.email
                            : "Waiting..."}{" "}
                          vs{" "}
                          {debate.debaterB
                            ? debate.debaterB.name || debate.debaterB.email
                            : "Waiting..."}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Overlay - Visible when sidebar is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

