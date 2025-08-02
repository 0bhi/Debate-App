import { NextRequest, NextResponse } from "next/server";
import { debateOrchestrator } from "../../../../server/orchestrator/debateOrchestrator";
import { logger } from "../../../../server/utils/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params;
    const sessionId = id;

    const sessionState = await debateOrchestrator.loadSessionState(sessionId);

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
      sessionId: params.id,
    });

    return NextResponse.json(
      { error: "Failed to retrieve debate session" },
      { status: 500 }
    );
  }
}
