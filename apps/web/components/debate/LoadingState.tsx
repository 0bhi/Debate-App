"use client";

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading debate..." }: LoadingStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-slate-600 dark:text-slate-400">{message}</p>
      </div>
    </div>
  );
}

