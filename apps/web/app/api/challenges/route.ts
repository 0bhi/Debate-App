import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";
import { z } from "zod";

const createChallengeSchema = z.object({
  challengedId: z.string().min(1, "Challenged user ID is required"),
  topic: z.string().min(1, "Topic is required"),
  rounds: z.number().int().min(1).max(10).optional().default(3),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "User ID not found" }, { status: 400 });
    }

    const body = await req.json();
    const { challengedId, topic, rounds } = createChallengeSchema.parse(body);

    if (userId === challengedId) {
      return NextResponse.json(
        { error: "Cannot challenge yourself" },
        { status: 400 }
      );
    }

    // Check if challenged user exists
    const challengedUser = await prisma.user.findUnique({
      where: { id: challengedId },
    });

    if (!challengedUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if there's already a pending challenge between these users
    const existingChallenge = await prisma.debateChallenge.findFirst({
      where: {
        OR: [
          { challengerId: userId, challengedId, status: "PENDING" },
          { challengerId: challengedId, challengedId: userId, status: "PENDING" },
        ],
      },
    });

    if (existingChallenge) {
      return NextResponse.json(
        { error: "There is already a pending challenge between you and this user" },
        { status: 400 }
      );
    }

    // Create challenge
    const challenge = await prisma.debateChallenge.create({
      data: {
        challengerId: userId,
        challengedId,
        topic,
        rounds: rounds || 3,
        status: "PENDING",
      },
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

    return NextResponse.json(challenge, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    console.error("Failed to create challenge:", error);
    return NextResponse.json(
      { error: "Failed to create challenge" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "User ID not found" }, { status: 400 });
    }

    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type") || "received"; // "sent" or "received"

    let challenges;

    if (type === "sent") {
      // Get challenges sent by user
      challenges = await prisma.debateChallenge.findMany({
        where: {
          challengerId: userId,
          status: "PENDING",
        },
        include: {
          challenged: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    } else {
      // Get challenges received by user (default)
      challenges = await prisma.debateChallenge.findMany({
        where: {
          challengedId: userId,
          status: "PENDING",
        },
        include: {
          challenger: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }

    const formattedChallenges = challenges.map((challenge) => ({
      id: challenge.id,
      topic: challenge.topic,
      rounds: challenge.rounds,
      status: challenge.status,
      debateId: challenge.debateId,
      createdAt: challenge.createdAt,
      updatedAt: challenge.updatedAt,
      user: type === "sent" ? challenge.challenged : challenge.challenger,
    }));

    return NextResponse.json(formattedChallenges);
  } catch (error) {
    console.error("Failed to fetch challenges:", error);
    return NextResponse.json(
      { error: "Failed to fetch challenges" },
      { status: 500 }
    );
  }
}
