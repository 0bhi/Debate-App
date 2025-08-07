import { NextRequest, NextResponse } from "next/server";

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

  const baseWsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
  const wsUrl = `${baseWsUrl}?sessionId=${sessionId}`;

  return NextResponse.json({
    message: "WebSocket server is running",
    wsUrl,
    sessionId,
  });
}
