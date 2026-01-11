"use client";

import { useState } from "react";
import { CreateDebateRequest } from "../lib/validators";
import toast from "react-hot-toast";
import { useSession } from "next-auth/react";

interface TopicFormProps {
  onSubmit: (request: CreateDebateRequest) => Promise<void>;
  isLoading?: boolean;
}

export function TopicForm({ onSubmit, isLoading = false }: TopicFormProps) {
  const { data: session } = useSession();
  const [topic, setTopic] = useState("");
  const [rounds, setRounds] = useState(2);
  const [debaterBEmail, setDebaterBEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!topic.trim()) {
      toast.error("Please enter a debate topic");
      return;
    }

    if (topic.length < 10) {
      toast.error("Topic must be at least 10 characters long");
      return;
    }

    if (!session?.user) {
      toast.error("Please sign in to create a debate");
      return;
    }

    try {
      await onSubmit({
        topic: topic.trim(),
        rounds,
        autoJudge: true, // Always use AI judging
        // For now, we'll assign debaters after creation
        // The creator will be debater A, and we can assign debater B later
      });
    } catch {
      toast.error("Failed to create debate");
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white dark:bg-slate-800 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-center mb-6 text-slate-900 dark:text-white">
        Create Debate
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Topic Input */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Debate Topic
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What should you and your opponent debate about? (e.g., 'Should social media be regulated like traditional media?')"
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-none"
            maxLength={500}
          />
          <div className="text-xs text-slate-500 mt-1">
            {topic.length}/500 characters
          </div>
        </div>

        {/* Settings */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Number of Rounds
          </label>
          <select
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white"
          >
            <option value={1}>1 Round</option>
            <option value={2}>2 Rounds</option>
            <option value={3}>3 Rounds</option>
            <option value={4}>4 Rounds</option>
            <option value={5}>5 Rounds</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Each debater will speak {rounds} time(s)
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Judging: AI (Automatic)
          </p>
        </div>

        {/* Info */}
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Note:</strong> After creating the debate, you'll need to invite another person to join as the second debater. You'll be assigned as Debater A, and they'll be Debater B.
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !topic.trim() || !session?.user}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Creating Debate...
            </span>
          ) : (
            "Create Debate"
          )}
        </button>
      </form>
    </div>
  );
}
