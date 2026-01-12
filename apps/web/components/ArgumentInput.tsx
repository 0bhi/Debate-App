"use client";

import { useState, useRef, useEffect } from "react";
import { useDebateStore } from "../lib/stores/debate-store";
import { Send } from "lucide-react";
import toast from "react-hot-toast";

interface ArgumentInputProps {
  sessionId: string;
  disabled?: boolean;
  isMyTurn?: boolean;
  currentSpeaker?: "A" | "B" | null;
  debaterAName?: string;
  debaterBName?: string;
}

export function ArgumentInput({
  sessionId,
  disabled = false,
  isMyTurn = false,
  currentSpeaker = null,
  debaterAName = "Debater A",
  debaterBName = "Debater B",
}: ArgumentInputProps) {
  const [argument, setArgument] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { submitArgument } = useDebateStore();

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = "auto";
      // Set height to scrollHeight, but with min and max constraints
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 48), 200);
      textarea.style.height = `${newHeight}px`;
    }
  }, [argument]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!argument.trim()) {
      return;
    }

    if (argument.trim().length < 10) {
      toast.error("Argument must be at least 10 characters long");
      return;
    }

    if (argument.trim().length > 2000) {
      toast.error("Argument must be less than 2000 characters");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitArgument(sessionId, argument.trim());
      setArgument("");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "48px";
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to submit argument");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (but allow Shift+Enter for new line)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Trigger form submit
      const form = e.currentTarget.closest("form");
      if (form) {
        form.requestSubmit();
      }
    }
  };

  // Determine whose turn it is for display
  const currentTurnName =
    currentSpeaker === "A"
      ? debaterAName
      : currentSpeaker === "B"
        ? debaterBName
        : null;

  // Debug info (can be removed in production)
  const buttonDisabledReason = disabled
    ? "Not your turn"
    : isSubmitting
      ? "Submitting..."
      : !argument.trim()
        ? "No text entered"
        : "";

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex items-end gap-2 bg-card border border-border rounded-lg shadow-sm p-2 focus-within:border-border focus-within:ring-1 focus-within:ring-border">
        <textarea
          ref={textareaRef}
          value={argument}
          onChange={(e) => setArgument(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? `Wait for your turn to submit an argument... (Currently ${currentTurnName}'s turn)`
              : "Type your argument here... (Press Enter to submit, Shift+Enter for new line)"
          }
          disabled={disabled}
          className="flex-1 resize-none bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm py-2 px-3 min-h-[48px] max-h-[200px] overflow-y-auto focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ height: "48px" }}
        />
        <button
          type="submit"
          disabled={disabled || isSubmitting || !argument.trim()}
          className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          title={buttonDisabledReason || "Submit argument"}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
