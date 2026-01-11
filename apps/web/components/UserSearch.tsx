"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Users } from "lucide-react";
import { UserCard } from "./UserCard";
import { useDebounce } from "../lib/hooks/useDebounce";

export function UserSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debouncedQuery = useDebounce(query, 500);

  const searchUsers = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        throw new Error("Failed to search users");
      }
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error("Failed to search users:", error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debouncedQuery) {
      searchUsers(debouncedQuery);
    } else {
      setResults([]);
      setHasSearched(false);
    }
  }, [debouncedQuery, searchUsers]);

  const handleUpdate = () => {
    // Refresh search results after friend request or challenge
    if (debouncedQuery) {
      searchUsers(debouncedQuery);
    }
  };

  return (
    <div className="w-full">
      {/* Search Input */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for users by name or email..."
          className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>

      {/* Results */}
      {hasSearched && (
        <div>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <p className="text-slate-600 dark:text-slate-400">Searching...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3">
                Found {results.length} {results.length === 1 ? "user" : "users"}
              </h3>
              {results.map((user) => (
                <UserCard key={user.id} user={user} onUpdate={handleUpdate} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-slate-400 mx-auto mb-2" />
              <p className="text-slate-600 dark:text-slate-400">
                No users found. Try a different search query.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Initial State */}
      {!hasSearched && !isLoading && (
        <div className="text-center py-12">
          <Search className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">
            Enter at least 2 characters to search for users
          </p>
        </div>
      )}
    </div>
  );
}

