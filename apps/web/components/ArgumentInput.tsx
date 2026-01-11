"use client";

import { useState } from "react";
import { Send } from "lucide-react";

interface ArgumentInputProps {
  onSubmit: (argument: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function ArgumentInput({ onSubmit, isSubmitting = false }: ArgumentInputProps) {
  const [argument, setArgument] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!argument.trim() || argument.trim().length < 10) {
      return;
    }

    if (argument.trim().length > 2000) {
      return;
    }

    try {
      await onSubmit(argument.trim());
      setArgument("");
    } catch (error) {
      console.error("Failed to submit argument:", error);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-4">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
        Your Turn - Submit Your Argument
      </h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={argument}
          onChange={(e) => setArgument(e.target.value)}
          placeholder="Type your argument here... (minimum 10 characters)"
          rows={4}
          className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white resize-none"
          maxLength={2000}
          disabled={isSubmitting}
        />
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {argument.length}/2000 characters (minimum 10)
          </div>
          <button
            type="submit"
            disabled={isSubmitting || argument.trim().length < 10 || argument.trim().length > 2000}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Argument
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

