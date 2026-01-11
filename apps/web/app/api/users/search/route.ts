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
    const query = searchParams.get("q");

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ error: "Search query must be at least 2 characters" }, { status: 400 });
    }

    // Search users by name or email (excluding current user)
    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            id: { not: userId },
          },
          {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
      },
      take: 20,
    });

    // Get existing friend requests and friendships to show status
    const friendRequests = await prisma.friendRequest.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: { in: users.map((u) => u.id) } },
          { receiverId: userId, senderId: { in: users.map((u) => u.id) } },
        ],
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        status: true,
      },
    });

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { user1Id: userId, user2Id: { in: users.map((u) => u.id) } },
          { user2Id: userId, user1Id: { in: users.map((u) => u.id) } },
        ],
      },
      select: {
        user1Id: true,
        user2Id: true,
      },
    });

    const friendRequestMap = new Map();
    friendRequests.forEach((fr) => {
      const otherUserId = fr.senderId === userId ? fr.receiverId : fr.senderId;
      friendRequestMap.set(otherUserId, {
        id: fr.id,
        status: fr.status,
        isSender: fr.senderId === userId,
      });
    });

    const friendshipSet = new Set();
    friendships.forEach((f) => {
      const otherUserId = f.user1Id === userId ? f.user2Id : f.user1Id;
      friendshipSet.add(otherUserId);
    });

    const usersWithStatus = users.map((user) => ({
      ...user,
      friendRequest: friendRequestMap.get(user.id) || null,
      isFriend: friendshipSet.has(user.id),
    }));

    return NextResponse.json(usersWithStatus);
  } catch (error) {
    console.error("Failed to search users:", error);
    return NextResponse.json(
      { error: "Failed to search users" },
      { status: 500 }
    );
  }
}

