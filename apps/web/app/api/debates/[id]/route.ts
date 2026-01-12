import { NextRequest, NextResponse } from "next/server";
import { logger } from "../../../../lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = id;

  try {
    const serverUrl =
      process.env.SERVER_URL ||
      process.env.NEXT_PUBLIC_SERVER_API_URL ||
      `http://localhost:3002`;

    // Create AbortController for timeout (more compatible than AbortSignal.timeout)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    let resp: Response;
    try {
      resp = await fetch(`${serverUrl}/debates/${sessionId}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      // Handle network errors (server not running, connection refused, etc.)
      const errorMessage = fetchError?.message || String(fetchError);
      const errorName = fetchError?.name || "";

      logger.error("Failed to connect to debate server", {
        error: fetchError,
        sessionId,
        serverUrl,
        errorMessage,
        errorName,
      });

      // Check if it's a timeout/abort error
      if (
        errorName === "AbortError" ||
        errorName === "TimeoutError" ||
        errorMessage.includes("timeout") ||
        errorMessage.includes("aborted") ||
        errorMessage.includes("The operation was aborted")
      ) {
        return NextResponse.json(
          {
            error: "Request to debate server timed out. Please try again.",
          },
          { status: 504 }
        );
      }

      // Check if it's a connection error
      if (
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("network") ||
        errorMessage.includes("ENOTFOUND") ||
        errorMessage.includes("ECONNRESET")
      ) {
        const baseMessage =
          "Failed to connect to debate server. Please ensure the server is running.";
        const devDetails =
          process.env.NODE_ENV === "development"
            ? `Attempted to connect to: ${serverUrl}/debates/${sessionId}. Error: ${errorMessage}`
            : undefined;

        return NextResponse.json(
          {
            error: baseMessage,
            details: devDetails,
            serverUrl:
              process.env.NODE_ENV === "development" ? serverUrl : undefined,
          },
          { status: 503 }
        );
      }

      // Generic network error
      return NextResponse.json(
        {
          error: "Failed to connect to debate server",
          details:
            process.env.NODE_ENV === "development" ? errorMessage : undefined,
        },
        { status: 503 }
      );
    }

    if (!resp.ok) {
      if (resp.status === 404) {
        return NextResponse.json(
          { error: "Debate session not found" },
          { status: 404 }
        );
      }

      // Try to get error message from server response
      let errorMessage = `Server error ${resp.status}`;
      const contentType = resp.headers.get("content-type");
      const contentLength = resp.headers.get("content-length");

      // Only try to parse JSON if content-type indicates JSON and body is not empty
      if (contentType?.includes("application/json") && contentLength !== "0") {
        try {
          const text = await resp.text();
          if (text && text.trim()) {
            const err = JSON.parse(text);
            errorMessage = err.error || err.message || errorMessage;
          }
        } catch {
          // If JSON parsing fails, use status text
          errorMessage = resp.statusText || errorMessage;
        }
      } else {
        // If not JSON, use status text
        errorMessage = resp.statusText || errorMessage;
      }

      logger.error("Debate server returned error", {
        status: resp.status,
        sessionId,
        errorMessage,
      });

      return NextResponse.json(
        { error: errorMessage },
        { status: resp.status >= 500 ? 502 : resp.status }
      );
    }

    const sessionState = await resp.json();

    if (!sessionState) {
      return NextResponse.json(
        { error: "Debate session not found" },
        { status: 404 }
      );
    }

    logger.info("Debate session retrieved", { sessionId });

    return NextResponse.json(sessionState);
  } catch (error) {
    logger.error("Failed to get debate session", {
      error,
      sessionId,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to retrieve debate session";

    return NextResponse.json(
      {
        error: "Failed to retrieve debate session",
        details:
          process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
