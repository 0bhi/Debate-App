import http, { IncomingMessage, ServerResponse } from "http";
import { parse as parseUrl } from "url";
import { env } from "./env";
import { debateOrchestrator } from "./orchestrator/debateOrchestrator";
import { logger } from "./utils/logger";
import { CreateDebateSchema } from "@repo/types";

function sendJson(res: ServerResponse, status: number, payload: any) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(e);
        }
      })
      .on("error", reject);
  });
}

function getAllowedOrigins(): string[] {
  if (env.NODE_ENV === "development") {
    // In development, allow localhost origins
    return [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
    ];
  }

  // In production, use environment variable
  if (env.CORS_ALLOWED_ORIGINS) {
    return env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim());
  }

  // Fallback: no origins allowed in production if not configured
  return [];
}

function getCorsOrigin(
  req: IncomingMessage,
  allowedOrigins: string[]
): string | null {
  const origin = req.headers.origin;
  if (!origin) {
    return null;
  }

  // Check if the origin is in the allowed list
  if (allowedOrigins.includes(origin)) {
    return origin;
  }

  return null;
}

export function createHttpServer() {
  const allowedOrigins = getAllowedOrigins();

  const server = http.createServer(async (req, res) => {
    const url = parseUrl(req.url || "", true);
    const method = (req.method || "GET").toUpperCase();

    // Environment-based CORS
    const corsOrigin = getCorsOrigin(req, allowedOrigins);
    if (corsOrigin) {
      res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "content-type, authorization"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    try {
      // POST /debates
      if (method === "POST" && url.pathname === "/debates") {
        const body = await parseJsonBody(req);
        const validated = CreateDebateSchema.parse(body);
        // Extract userId from body or use debaterAId if userId not provided
        // This allows tracking who created the debate
        const userId = (body as any).userId || validated.debaterAId;
        const result = await debateOrchestrator.createDebateSession(
          validated,
          userId
        );
        return sendJson(res, 200, result);
      }

      // POST /debates/:id/assign
      const assignMatch = url.pathname?.match(/^\/debates\/([^/]+)\/assign$/);
      if (method === "POST" && assignMatch) {
        const id = assignMatch[1]!;
        const body = await parseJsonBody(req);
        const position = (body as any).position; // "A" or "B"
        const userId = (body as any).userId;

        if (!position || !["A", "B"].includes(position)) {
          return sendJson(res, 400, {
            error: "Invalid position. Must be 'A' or 'B'",
          });
        }
        if (!userId) {
          return sendJson(res, 400, { error: "userId is required" });
        }

        await debateOrchestrator.assignDebater(id, position, userId);
        return sendJson(res, 200, { success: true });
      }

      // GET /debates/:id
      // ...
      // GET /debates/:id
      const debateMatch = url.pathname?.match(/^\/debates\/([^/]+)$/);
      if (method === "GET" && debateMatch) {
        const id = debateMatch[1]!; // assert non-null
        const state = await debateOrchestrator.loadSessionState(id);
        if (!state)
          return sendJson(res, 404, { error: "Debate session not found" });
        return sendJson(res, 200, state);
      }

      // POST /debates/:id/retry-judge
      const retryJudgeMatch = url.pathname?.match(
        /^\/debates\/([^/]+)\/retry-judge$/
      );
      if (method === "POST" && retryJudgeMatch) {
        const id = retryJudgeMatch[1]!; // assert non-null
        try {
          await debateOrchestrator.retryJudging(id);
          return sendJson(res, 200, {
            success: true,
            message: "Judging retry initiated",
          });
        } catch (error: any) {
          logger.error("Failed to retry judging", { sessionId: id, error });
          return sendJson(res, 400, {
            error:
              error instanceof Error
                ? error.message
                : "Failed to retry judging",
          });
        }
      }

      // GET /debates/:id/invite
      const inviteMatch = url.pathname?.match(/^\/debates\/([^/]+)\/invite$/);
      if (method === "GET" && inviteMatch) {
        const id = inviteMatch[1]!;
        const inviteLink = await debateOrchestrator.getInvitationLink(id);
        if (!inviteLink) {
          return sendJson(res, 404, {
            error: "Debate session not found or no invitation token",
          });
        }
        return sendJson(res, 200, inviteLink);
      }

      // POST /debates/:id/accept-invitation
      const acceptMatch = url.pathname?.match(
        /^\/debates\/([^/]+)\/accept-invitation$/
      );
      if (method === "POST" && acceptMatch) {
        const id = acceptMatch[1]!;
        const body = await parseJsonBody(req);
        const token = (body as any).token;
        const userId = (body as any).userId;

        if (!token) {
          return sendJson(res, 400, { error: "Token is required" });
        }
        if (!userId) {
          return sendJson(res, 400, { error: "userId is required" });
        }

        const success = await debateOrchestrator.acceptInvitation(
          id,
          token,
          userId
        );
        if (!success) {
          return sendJson(res, 400, {
            error: "Invalid or expired invitation token",
          });
        }
        return sendJson(res, 200, { success: true });
      }
      // ...

      // GET /health
      if (method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, { ok: true });
      }

      // Not found
      sendJson(res, 404, { error: "Not found" });
    } catch (error: any) {
      logger.error("HTTP handler error", { error });
      if (error?.name === "ZodError") {
        return sendJson(res, 400, {
          error: "Invalid request data",
          details: error.errors,
        });
      }
      sendJson(res, 500, { error: "Internal server error" });
    }
  });

  return server;
}
