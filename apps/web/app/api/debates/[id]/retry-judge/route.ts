import { NextRequest, NextResponse } from "next/server";

// Use console directly for server-side logging
const logger = {
  info: (message: string, meta?: any) => {
    console.log(`[INFO] ${message}`, meta || "");
  },
  error: (message: string, meta?: any) => {
    console.error(`[ERROR] ${message}`, meta || "");
  },
};

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

    // Proxy to server
    const serverUrl =
      process.env.SERVER_URL ||
      process.env.NEXT_PUBLIC_SERVER_API_URL ||
      `http://localhost:3002`;

    let resp: Response;
    try {
      resp = await fetch(`${serverUrl}/debates/${sessionId}/retry-judge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (fetchError) {
      logger.error("Failed to connect to server", {
        error: fetchError instanceof Error ? fetchError.message : String(fetchError),
        sessionId,
        serverUrl,
      });
      return NextResponse.json(
        {
          error: "Failed to connect to debate server. Please ensure the server is running.",
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

      if (
        contentType?.includes("application/json") &&
        contentLength !== "0"
      ) {
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
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

