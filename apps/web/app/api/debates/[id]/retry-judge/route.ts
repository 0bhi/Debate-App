import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sign } from "jsonwebtoken";
import { logger } from "../../../../../lib/logger";
import { authOptions } from "../../../../../lib/auth";
import { env } from "../../../../../lib/env";

/**
 * Maximum retries for 503 service unavailable errors
 */
const MAX_RETRIES_503 = 3;
/**
 * Base delay in milliseconds for exponential backoff on 503 errors
 */
const BASE_RETRY_DELAY_MS = 1000;

/**
 * Helper function to retry a fetch request on 503 errors
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryCount: number = 0
): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(url, options);
  } catch (fetchError) {
    // Network errors should be retried if we haven't exceeded max retries
    if (retryCount < MAX_RETRIES_503) {
      const backoffDelayMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
      logger.warn("Network error, retrying...", {
        attempt: retryCount + 1,
        maxRetries: MAX_RETRIES_503,
        delayMs: backoffDelayMs,
      });
      await new Promise((resolve) => setTimeout(resolve, backoffDelayMs));
      return fetchWithRetry(url, options, retryCount + 1);
    }
    throw fetchError;
  }

  // Retry on 503 Service Unavailable
  if (resp.status === 503 && retryCount < MAX_RETRIES_503) {
    const retryAfter = resp.headers.get("retry-after");

    // Calculate exponential backoff delay
    // Use retry-after header if available, otherwise use exponential backoff
    const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : null;

    const backoffDelayMs = retryAfterSeconds
      ? retryAfterSeconds * 1000
      : BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);

    logger.warn("503 Service Unavailable, retrying...", {
      attempt: retryCount + 1,
      maxRetries: MAX_RETRIES_503,
      delayMs: backoffDelayMs,
      retryAfter: retryAfterSeconds,
    });

    // Wait before retrying
    await new Promise((resolve) => setTimeout(resolve, backoffDelayMs));

    // Retry the request
    return fetchWithRetry(url, options, retryCount + 1);
  }

  return resp;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = id;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Require authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any)?.id;
    if (!userId) {
      return NextResponse.json(
        { error: "User ID not found in session" },
        { status: 400 }
      );
    }

    // Create JWT token for server authentication
    if (!env.NEXTAUTH_SECRET) {
      logger.error("NEXTAUTH_SECRET not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const token = sign(
      {
        sub: userId,
        email: session.user.email,
        name: session.user.name,
      },
      env.NEXTAUTH_SECRET,
      { expiresIn: "1h" }
    );

    // Proxy to server
    const serverUrl =
      process.env.SERVER_URL ||
      process.env.NEXT_PUBLIC_SERVER_API_URL ||
      `http://localhost:3002`;

    let resp: Response;
    try {
      resp = await fetchWithRetry(
        `${serverUrl}/debates/${sessionId}/retry-judge`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
    } catch (fetchError) {
      logger.error("Failed to connect to server after retries", {
        error:
          fetchError instanceof Error ? fetchError.message : String(fetchError),
        sessionId,
        serverUrl,
      });
      return NextResponse.json(
        {
          error:
            "Failed to connect to debate server. Please ensure the server is running.",
        },
        { status: 503 }
      );
    }

    if (!resp.ok) {
      // Handle specific status codes
      if (resp.status === 404) {
        return NextResponse.json(
          { error: "Debate session not found" },
          { status: 404 }
        );
      }

      if (resp.status === 429) {
        // Rate limiting - try to get more info from response headers
        const retryAfter = resp.headers.get("retry-after");
        const rateLimitInfo = retryAfter
          ? ` Please try again after ${retryAfter} seconds.`
          : " Please try again later.";
        return NextResponse.json(
          {
            error: "Rate limit exceeded. Too many requests." + rateLimitInfo,
            code: "RATE_LIMIT_EXCEEDED",
          },
          { status: 429 }
        );
      }

      // Try to parse error response, but handle empty bodies gracefully
      let errorMessage = `Server error ${resp.status}`;
      const contentType = resp.headers.get("content-type");
      const contentLength = resp.headers.get("content-length");

      if (contentType?.includes("application/json") && contentLength !== "0") {
        try {
          const text = await resp.text();
          if (text && text.trim()) {
            const err = JSON.parse(text);
            errorMessage = err.error || err.message || errorMessage;
          }
        } catch {
          // If JSON parsing fails, use status-based message
          if (resp.status === 500) {
            errorMessage = "Internal server error";
          } else if (resp.status === 503) {
            errorMessage = "Service temporarily unavailable";
          } else if (resp.status === 400) {
            errorMessage = "Bad request";
          }
        }
      }

      return NextResponse.json(
        { error: errorMessage, status: resp.status },
        { status: resp.status }
      );
    }

    const result = await resp.json();
    logger.info("Judging retry initiated", { sessionId });

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    logger.error("Failed to retry judging", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error: "Failed to retry judging",
      },
      { status: 500 }
    );
  }
}
