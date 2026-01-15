import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sign } from "jsonwebtoken";
import { authOptions } from "../../../../lib/auth";
import { logger } from "../../../../lib/logger";
import { env } from "../../../../lib/env";

/**
 * GET /api/ws/token
 * Returns a JWT token for WebSocket authentication
 * This endpoint requires authentication and creates a short-lived token
 * that can be verified by the WebSocket server using the same NEXTAUTH_SECRET
 */
export async function GET(req: NextRequest) {
  try {
    // Verify user is authenticated
    const session = await getServerSession(authOptions);
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

    // Ensure NEXTAUTH_SECRET is available (required for JWT signing)
    if (!env.NEXTAUTH_SECRET) {
      logger.error("NEXTAUTH_SECRET is not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Create a JWT token for WebSocket authentication
    // This token is signed with the same secret as NextAuth, so the server can verify it
    // Token expires in 1 hour (sufficient for WebSocket connections)
    const token = sign(
      {
        sub: userId, // User ID (matches NextAuth JWT structure)
        email: session.user.email,
        name: session.user.name,
        picture: session.user.image,
        iat: Math.floor(Date.now() / 1000),
      },
      env.NEXTAUTH_SECRET,
      {
        expiresIn: "1h", // Token valid for 1 hour
      }
    );

    return NextResponse.json({ token });
  } catch (error) {
    logger.error("Error getting WebSocket token", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

