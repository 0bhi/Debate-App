"use client";

import { AuthButton } from "./AuthButton";
import { Brain } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { NotificationBadge } from "./NotificationBadge";
import { usePathname } from "next/navigation";

export function Header() {
  const { status } = useSession();
  const pathname = usePathname();
  const showNotifications =
    status === "authenticated" && pathname === "/dashboard";

  return (
    <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-sm border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="p-2 bg-primary/10 rounded-lg">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">
              Debate Platform
            </span>
          </Link>
          <div className="flex items-center gap-4">
            {showNotifications && <NotificationBadge />}
            <AuthButton />
          </div>
        </div>
      </div>
    </header>
  );
}
