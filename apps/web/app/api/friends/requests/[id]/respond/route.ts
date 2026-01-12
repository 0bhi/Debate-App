import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../../../lib/auth";
import { prisma } from "../../../../../../lib/prisma";
import { z } from "zod";
import { logger } from "../../../../../../lib/logger";

const respondFriendRequestSchema = z.object({
  action: z.enum(["ACCEPT", "REJECT"], {
    errorMap: () => ({ message: "Action must be 'ACCEPT' or 'REJECT'" }),
  }),
});

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
    const body = await req.json();
    const { action } = respondFriendRequestSchema.parse(body);

    // Find the friend request
    const friendRequest = await prisma.friendRequest.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    if (!friendRequest) {
      return NextResponse.json(
        { error: "Friend request not found" },
        { status: 404 }
      );
    }

    // Verify the request is for the current user
    if (friendRequest.receiverId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized to respond to this request" },
        { status: 403 }
      );
    }

    // Check if already processed
    if (friendRequest.status !== "PENDING") {
      return NextResponse.json(
        { error: "Friend request already processed" },
        { status: 400 }
      );
    }

    if (action === "ACCEPT") {
      // Update friend request status and create friendship
      await prisma.$transaction(async (tx) => {
        // Update friend request status
        await tx.friendRequest.update({
          where: { id },
          data: { status: "ACCEPTED" },
        });

        // Create friendship (ensure user1Id < user2Id for consistency)
        const user1Id = friendRequest.senderId < friendRequest.receiverId
          ? friendRequest.senderId
          : friendRequest.receiverId;
        const user2Id = friendRequest.senderId < friendRequest.receiverId
          ? friendRequest.receiverId
          : friendRequest.senderId;

        await tx.friendship.upsert({
          where: {
            user1Id_user2Id: {
              user1Id,
              user2Id,
            },
          },
          update: {},
          create: {
            user1Id,
            user2Id,
          },
        });
      });

      return NextResponse.json({
        success: true,
        message: "Friend request accepted",
      });
    } else {
      // Reject friend request
      await prisma.friendRequest.update({
        where: { id },
        data: { status: "REJECTED" },
      });

      return NextResponse.json({
        success: true,
        message: "Friend request rejected",
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0].message },
        { status: 400 }
      );
    }

    logger.error("Failed to respond to friend request", { error });
    return NextResponse.json(
      { error: "Failed to respond to friend request" },
      { status: 500 }
    );
  }
}

