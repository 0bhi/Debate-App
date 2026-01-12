import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../lib/auth";
import { prisma } from "../../../../../lib/prisma";
import { env } from "../../../../../lib/env";
import { logger } from "../../../../../lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "User ID not found" }, { status: 400 });
    }

    const { id } = await params;

    // Find the challenge
    const challenge = await prisma.debateChallenge.findUnique({
      where: { id },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    if (!challenge) {
      return NextResponse.json(
        { error: "Challenge not found" },
        { status: 404 }
      );
    }

    // Verify the challenge is for the current user
    if (challenge.challengedId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized to accept this challenge" },
        { status: 403 }
      );
    }

    // Check if challenge is still pending
    if (challenge.status !== "PENDING") {
      return NextResponse.json(
        { error: "Challenge is no longer pending" },
        { status: 400 }
      );
    }

    // Create debate session via server API
    const serverUrl =
      process.env.SERVER_URL ||
      process.env.NEXT_PUBLIC_SERVER_API_URL ||
      `http://localhost:3002`;

    const debateData = {
      topic: challenge.topic,
      rounds: challenge.rounds,
      debaterAId: challenge.challengerId,
      debaterBId: challenge.challengedId,
    };

    const resp = await fetch(`${serverUrl}/debates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(debateData),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${resp.status}`);
    }

    const debateResult = await resp.json();

    // Update challenge with debate ID and mark as accepted
    await prisma.debateChallenge.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        debateId: debateResult.id,
      },
    });

    return NextResponse.json({
      success: true,
      debate: debateResult,
      message: "Challenge accepted and debate created",
    });
  } catch (error) {
    logger.error("Failed to accept challenge", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to accept challenge" },
      { status: 500 }
    );
  }
}

