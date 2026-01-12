"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { X, ChevronRight, MessageSquare, Loader2 } from "lucide-react";
import { logger } from "../lib/logger";

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
        const errorMessage =
          errorData.error || `Failed to fetch debates (${response.status})`;
        setError(errorMessage);
        throw new Error(errorMessage);
      }
      const data = await response.json();
      setDebates(data);
      setError(null);
    } catch (error) {
      logger.error("Failed to fetch debates", { error });
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
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-card border-r border-t border-b border-border rounded-r-lg p-2 shadow-lg hover:bg-muted transition-colors"
          aria-label="Open debates sidebar"
        >
          <ChevronRight className="w-5 h-5 text-foreground" />
        </button>
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full z-50 bg-card border-r border-border shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ width: "320px" }}
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside sidebar from closing it
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground">
              All Debates
            </h2>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-muted rounded transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5 text-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="h-[calc(100vh-64px)] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <MessageSquare className="w-12 h-12 text-destructive mx-auto mb-3" />
              <p className="text-sm text-destructive mb-3">{error}</p>
              <button
                onClick={fetchDebates}
                className="text-xs px-3 py-1 bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : debates.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No debates yet</p>
            </div>
          ) : (
            <div className="p-2">
              {debates.map((debate) => {
                const isRunning = debate.status === "RUNNING";

                return (
                  <button
                    key={debate.id}
                    onClick={(e) => handleDebateClick(debate.id, e)}
                    className="w-full text-left p-3 rounded-lg mb-2 transition-colors hover:bg-muted border border-transparent"
                  >
                    <div className="flex items-start gap-3">
                      {/* Status Indicator */}
                      <div className="relative flex-shrink-0 mt-0.5">
                        <div
                          className={`w-2.5 h-2.5 rounded-full border-2 ${
                            isRunning
                              ? "bg-green-500 border-white dark:border-card animate-pulse"
                              : "bg-slate-400 border-white dark:border-card"
                          }`}
                        />
                      </div>

                      {/* Debate Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground mb-1.5">
                          {debate.topic}
                        </p>
                        <div className="flex items-center gap-2 mb-1.5">
                          {isRunning ? (
                            <span className="text-xs font-medium text-red-500 flex items-center gap-1.5">
                              {getStatusLabel(debate.status)}
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                              Live
                            </span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded border border-border bg-muted/50 text-muted-foreground">
                              {getStatusLabel(debate.status)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
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
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
