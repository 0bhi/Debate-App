import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { prisma } from "../../../../lib/prisma";

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

    let friendRequests;

    if (type === "sent") {
      // Get sent friend requests
      friendRequests = await prisma.friendRequest.findMany({
        where: {
          senderId: userId,
          status: "PENDING",
        },
        include: {
          receiver: {
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
      // Get received friend requests (default)
      friendRequests = await prisma.friendRequest.findMany({
        where: {
          receiverId: userId,
          status: "PENDING",
        },
        include: {
          sender: {
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

    const formattedRequests = friendRequests.map((fr) => ({
      id: fr.id,
      status: fr.status,
      createdAt: fr.createdAt,
      updatedAt: fr.updatedAt,
      user: type === "sent" ? fr.receiver : fr.sender,
    }));

    return NextResponse.json(formattedRequests);
  } catch (error) {
    console.error("Failed to fetch friend requests:", error);
    return NextResponse.json(
      { error: "Failed to fetch friend requests" },
      { status: 500 }
    );
  }
}

