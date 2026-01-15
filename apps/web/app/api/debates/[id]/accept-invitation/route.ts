import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sign } from "jsonwebtoken";
import { z } from "zod";
import { logger } from "../../../../../lib/logger";
import { authOptions } from "../../../../../lib/auth";
import { env } from "../../../../../lib/env";

const AcceptInvitationSchema = z.object({
  token: z.string().min(1),
});

export async function POST(
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

    const userId = (session.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "User ID not found" }, { status: 400 });
    }

    const body = await req.json();
    const validatedData = AcceptInvitationSchema.parse(body);

    const serverUrl =
      process.env.SERVER_URL ||
      process.env.NEXT_PUBLIC_SERVER_API_URL ||
      `http://localhost:3002`;

    // Create JWT token for server authentication
    if (!env.NEXTAUTH_SECRET) {
      logger.error("NEXTAUTH_SECRET not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const jwtToken = sign(
      {
        sub: userId,
        email: session.user.email,
        name: session.user.name,
      },
      env.NEXTAUTH_SECRET,
      { expiresIn: "1h" }
    );

    const resp = await fetch(`${serverUrl}/debates/${sessionId}/accept-invitation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwtToken}`,
      },
      body: JSON.stringify({
        token: validatedData.token,
      }),
    });

    if (!resp.ok) {
      if (resp.status === 404) {
        return NextResponse.json(
          { error: "Debate session not found" },
          { status: 404 }
        );
      }
      if (resp.status === 400) {
        const err = await resp.json().catch(() => ({}));
        return NextResponse.json(
          { error: err.error || "Invalid or expired invitation token" },
          { status: 400 }
        );
      }
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${resp.status}`);
    }

    logger.info("Invitation accepted", {
      sessionId,
      userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Failed to accept invitation", { error, sessionId });

    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}

