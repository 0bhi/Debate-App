"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { LogIn, LogOut, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse">
        <div className="w-8 h-8 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
        <div className="w-20 h-4 bg-slate-300 dark:bg-slate-600 rounded"></div>
      </div>
    );
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
          {session.user.image ? (
            <Image
              src={session.user.image}
              alt={session.user.name || "User"}
              width={32}
              height={32}
              className="rounded-full"
            />
          ) : (
            <div className="w-8 h-8 bg-slate-500 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
          )}
          <span className="text-sm font-medium text-muted-foreground hidden sm:inline">
            {session.user.name || session.user.email}
          </span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-accent text-muted-foreground hover:text-accent-foreground border border-border rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => signIn()}
        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors font-medium"
      >
        <LogIn className="w-4 h-4" />
        <span className="hidden sm:inline">Sign In</span>
      </button>
      <Link
        href="/auth/signup"
        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 rounded-lg transition-colors font-medium"
      >
        <User className="w-4 h-4" />
        <span className="hidden sm:inline">Sign Up</span>
      </Link>
    </div>
  );
}

