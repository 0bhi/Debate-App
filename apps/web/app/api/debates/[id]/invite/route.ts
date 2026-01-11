import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { logger } from "../../../../../lib/logger";
import { authOptions } from "../../../../../lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = id;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const serverUrl =
      process.env.SERVER_URL ||
      process.env.NEXT_PUBLIC_SERVER_API_URL ||
      `http://localhost:3002`;

    // Get the base URL for constructing the full invitation URL
    const baseUrl = process.env.NEXTAUTH_URL || req.headers.get("origin") || "http://localhost:3000";

    const resp = await fetch(`${serverUrl}/debates/${sessionId}/invite`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const errorMessage = err.error || `Server error ${resp.status}`;
      
      if (resp.status === 404) {
        logger.warn("Debate session not found for invitation", { sessionId });
        return NextResponse.json(
          { error: errorMessage },
          { status: 404 }
        );
      }
      
      logger.error("Failed to get invitation link from server", {
        sessionId,
        status: resp.status,
        error: errorMessage,
      });
      throw new Error(errorMessage);
    }

    const { inviteToken, inviteUrl } = await resp.json();

    // Construct full URL with base URL
    const fullInviteUrl = `${baseUrl}${inviteUrl}`;

    logger.info("Invitation link retrieved", { sessionId });

    return NextResponse.json({
      inviteToken,
      inviteUrl: fullInviteUrl,
    });
  } catch (error) {
    logger.error("Failed to get invitation link", {
      error,
      sessionId,
    });

    return NextResponse.json(
      { error: "Failed to retrieve invitation link" },
      { status: 500 }
    );
  }
}

