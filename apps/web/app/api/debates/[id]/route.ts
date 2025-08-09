import { NextRequest, NextResponse } from "next/server";
import { logger } from "../../../../lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = id;

  try {
    const serverUrl =
      process.env.SERVER_URL ||
      process.env.NEXT_PUBLIC_SERVER_API_URL ||
      `http://localhost:3002`;
    const resp = await fetch(`${serverUrl}/debates/${sessionId}`);
    if (!resp.ok) {
      if (resp.status === 404) {
        return NextResponse.json(
          { error: "Debate session not found" },
          { status: 404 }
        );
      }
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${resp.status}`);
    }
    const sessionState = await resp.json();

    if (!sessionState) {
      return NextResponse.json(
        { error: "Debate session not found" },
        { status: 404 }
      );
    }

    logger.info("Debate session retrieved", { sessionId });

    return NextResponse.json(sessionState);
  } catch (error) {
    logger.error("Failed to get debate session", {
      error,
      sessionId,
    });

    return NextResponse.json(
      { error: "Failed to retrieve debate session" },
      { status: 500 }
    );
  }
}
