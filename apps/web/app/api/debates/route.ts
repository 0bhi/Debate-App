import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { logger } from "../../../lib/logger";
import { CreateDebateSchema } from "@repo/types";
import { authOptions } from "../../../lib/auth";
import { env } from "../../../lib/env";

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

    // Create debate session via server API
    const serverUrl = process.env.SERVER_URL || process.env.NEXT_PUBLIC_SERVER_API_URL || `http://localhost:3002`;
    const resp = await fetch(`${serverUrl}/debates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validatedData),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${resp.status}`);
    }
    const result = await resp.json();

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
