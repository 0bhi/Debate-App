"use client";

import { AuthButton } from "./AuthButton";
import { Brain } from "lucide-react";
import Link from "next/link";

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Brain className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-white">
              Debate Platform
            </span>
          </Link>
          <AuthButton />
        </div>
      </div>
    </header>
  );
}

