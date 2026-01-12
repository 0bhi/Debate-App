import type { Metadata } from "next";
import { Poppins, Libre_Baskerville, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { Providers } from "../components/Providers";
import { Header } from "../components/Header";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Debate Club",
  description:
    "Watch AI personas debate in real-time with streaming text and live judging",
  keywords: ["AI", "debate", "persona", "real-time"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${poppins.variable} ${libreBaskerville.variable} ${ibmPlexMono.variable} font-sans antialiased`}
      >
        <Providers>
          <Header />
          <div className="min-h-screen bg-background">{children}</div>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              className: "bg-card text-card-foreground border border-border shadow-lg",
              style: {
                background: "hsl(var(--card))",
                color: "hsl(var(--card-foreground))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "calc(var(--radius) + 2px)",
                padding: "12px 16px",
                fontSize: "14px",
              },
              success: {
                iconTheme: {
                  primary: "hsl(var(--primary))",
                  secondary: "hsl(var(--primary-foreground))",
                },
              },
              error: {
                iconTheme: {
                  primary: "hsl(var(--destructive))",
                  secondary: "hsl(var(--destructive-foreground))",
                },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
