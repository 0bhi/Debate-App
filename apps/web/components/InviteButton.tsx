"use client";

import { useState } from "react";
import { Copy, Check, Share2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiClient } from "../lib/api";

interface InviteButtonProps {
  debateId: string;
  disabled?: boolean;
}

export function InviteButton({ debateId, disabled }: InviteButtonProps) {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGetInviteLink = async () => {
    if (inviteUrl) {
      // If we already have the URL, just copy it
      await copyToClipboard(inviteUrl);
      return;
    }

    if (!debateId) {
      toast.error("Debate ID is missing");
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.getInvitationLink(debateId);
      setInviteUrl(response.inviteUrl);
      await copyToClipboard(response.inviteUrl);
    } catch (error: any) {
      console.error("Failed to get invitation link:", error);
      const errorMessage = error?.message || "Failed to get invitation link";
      
      // Provide more helpful error messages
      if (errorMessage.includes("not found")) {
        toast.error("Debate not found. Please refresh the page and try again.");
      } else if (errorMessage.includes("migration")) {
        toast.error("Database setup required. Please contact support.");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Invitation link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      toast.error("Failed to copy link");
    }
  };

  return (
    <button
      onClick={handleGetInviteLink}
      disabled={disabled || loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      {loading ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          <span>Loading...</span>
        </>
      ) : copied ? (
        <>
          <Check className="w-4 h-4" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <Share2 className="w-4 h-4" />
          <span>Copy Invite Link</span>
        </>
      )}
    </button>
  );
}

