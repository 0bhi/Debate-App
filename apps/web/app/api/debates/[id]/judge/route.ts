import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "../../../../../lib/logger";
import { JudgeRequestSchema } from "@repo/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = id;
  
  try {
    const body = await req.json();

    // Validate request body
    const validatedData = JudgeRequestSchema.parse(body);

    // Proxy to server
    const serverUrl = process.env.SERVER_URL || process.env.NEXT_PUBLIC_SERVER_API_URL || `http://localhost:3002`;
    const resp = await fetch(`${serverUrl}/debates/${sessionId}/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validatedData),
    });
    if (!resp.ok) {
      if (resp.status === 404) {
        return NextResponse.json(
          { error: "Debate session not found" },
          { status: 404 }
        );
      }
      const err = await resp.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.error || `Server error ${resp.status}` },
        { status: resp.status }
      );
    }

    logger.info("Manual judgment applied", {
      sessionId,
      winner: validatedData.winner,
    });

    return NextResponse.json({ success: true, winner: validatedData.winner });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to judge debate", { error, sessionId });

    return NextResponse.json(
      { error: "Failed to process judgment" },
      { status: 500 }
    );
  }
}
