import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { logger } from "../../../lib/logger";
import { CreateDebateSchema } from "@repo/types";
import { authOptions } from "../../../lib/auth";
import { env } from "../../../lib/env";
import { prisma } from "../../../lib/prisma";

export async function GET(req: NextRequest) {
  try {
    let session = null;
    try {
      session = await getServerSession(authOptions);
    } catch (authError) {
      logger.error("Error getting session", { error: authError });
      return NextResponse.json(
        { error: "Authentication error" },
        { status: 401 }
      );
    }

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    if (!userId) {
      logger.warn("User ID not found in session", { session });
      return NextResponse.json(
        { error: "User ID not found in session" },
        { status: 400 }
      );
    }

    // Fetch debates where user is creator, debater A, or debater B
    const debates = await prisma.debateSession.findMany({
      where: {
        OR: [{ userId }, { debaterAId: userId }, { debaterBId: userId }],
      },
      include: {
        debaterA: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        debaterB: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        turns: {
          orderBy: { orderIndex: "desc" },
          take: 1,
          select: {
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedDebates = debates.map((debate) => ({
      id: debate.id,
      topic: debate.topic,
      status: debate.status,
      winner: debate.winner,
      rounds: debate.rounds,
      autoJudge: debate.autoJudge,
      createdAt: debate.createdAt,
      updatedAt: debate.updatedAt,
      debaterA: debate.debaterA
        ? {
            id: debate.debaterA.id,
            name: debate.debaterA.name,
            email: debate.debaterA.email,
            image: debate.debaterA.image,
          }
        : null,
      debaterB: debate.debaterB
        ? {
            id: debate.debaterB.id,
            name: debate.debaterB.name,
            email: debate.debaterB.email,
            image: debate.debaterB.image,
          }
        : null,
      lastActivity: debate.turns[0]?.createdAt || debate.updatedAt,
      isCreator: debate.userId === userId,
      isDebaterA: debate.debaterAId === userId,
      isDebaterB: debate.debaterBId === userId,
    }));

    return NextResponse.json(formattedDebates);
  } catch (error) {
    logger.error("Failed to fetch user debates", {
      error,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error: "Failed to fetch debates",
        message: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

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
    const serverUrl =
      process.env.SERVER_URL ||
      process.env.NEXT_PUBLIC_SERVER_API_URL ||
      `http://localhost:3002`;
    const userId = (session?.user as any)?.id;

    // If user is logged in, assign them as debater A
    const requestData = {
      ...validatedData,
      debaterAId: userId || validatedData.debaterAId,
    };

    const resp = await fetch(`${serverUrl}/debates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestData),
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
