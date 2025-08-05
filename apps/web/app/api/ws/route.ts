import { NextRequest, NextResponse } from "next/server";
import { getWebSocketServer } from "@repo/server";

// Initialize WebSocket server when this route is first accessed
getWebSocketServer();

export async function GET(req: NextRequest) {
  // For Next.js App Router, WebSocket upgrades are handled differently
  // This endpoint just returns information about connecting to the WebSocket

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId parameter is required" },
      { status: 400 }
    );
  }

  const wsUrl = `ws://localhost:3001?sessionId=${sessionId}`;

  return NextResponse.json({
    message: "WebSocket server is running",
    wsUrl,
    sessionId,
  });
}
