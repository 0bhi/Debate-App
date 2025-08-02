import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { debateOrchestrator } from "../../../../../server/orchestrator/debateOrchestrator";
import { JudgeRequestSchema } from "../../../../../lib/validators";
import { logger } from "../../../../../server/utils/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    const body = await req.json();

    // Validate request body
    const validatedData = JudgeRequestSchema.parse(body);

    // Check if session exists and is in correct state
    const sessionState = await debateOrchestrator.loadSessionState(sessionId);
    if (!sessionState) {
      return NextResponse.json(
        { error: "Debate session not found" },
        { status: 404 }
      );
    }

    if (
      sessionState.status !== "JUDGING" &&
      sessionState.status !== "FINISHED"
    ) {
      return NextResponse.json(
        { error: "Debate is not ready for judging" },
        { status: 400 }
      );
    }

    // Apply user judgment
    await debateOrchestrator.userJudgeDebate(sessionId, validatedData.winner);

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

    logger.error("Failed to judge debate", { error, sessionId: params.id });

    return NextResponse.json(
      { error: "Failed to process judgment" },
      { status: 500 }
    );
  }
}
