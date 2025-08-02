import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Debate Club",
  description:
    "Watch AI personas debate in real-time with streaming text, TTS audio, and live judging",
  keywords: ["AI", "debate", "persona", "TTS", "real-time"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
          {children}
        </div>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            className:
              "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100",
          }}
        />
      </body>
    </html>
  );
}
