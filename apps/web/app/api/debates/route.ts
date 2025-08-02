import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { debateOrchestrator } from "../../../server/orchestrator/debateOrchestrator";
import { CreateDebateSchema } from "../../../lib/validators";
import { logger } from "../../../server/utils/logger";
import { authOptions } from "../auth/[...nextauth]/route";

export async function POST(req: NextRequest) {
  try {
    // Handle auth errors gracefully
    let session = null;
    try {
      session = await getServerSession(authOptions);
    } catch (authError) {
      logger.warn("Auth error (continuing without session)", { authError });
      // Continue without session - debates can be created anonymously
    }

    const body = await req.json();

    // Validate request body
    const validatedData = CreateDebateSchema.parse(body);

    // Create debate session
    const result = await debateOrchestrator.createDebateSession(
      validatedData,
      (session?.user as any)?.id
    );

    logger.info("Debate created via API", {
      sessionId: result.id,
      userId: (session?.user as any)?.id,
      topic: validatedData.topic,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to create debate", { error });

    return NextResponse.json(
      { error: "Failed to create debate" },
      { status: 500 }
    );
  }
}
