import express, { Request, Response, NextFunction } from "express";
import { env } from "./env";
import { debateOrchestrator } from "./orchestrator/debateOrchestrator";
import { logger } from "./utils/logger";
import { CreateDebateSchema } from "@repo/types";
import { rateLimiter } from "./services/rateLimiter";

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

function getCorsOrigin(req: Request, allowedOrigins: string[]): string | null {
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

/**
 * Get client IP address from request
 * Checks x-forwarded-for header first (for proxy/load balancer), then req.ip
 */
function getClientIp(req: Request): string {
  // Check x-forwarded-for header (first IP in chain if behind proxy)
  const forwardedFor = req.headers["x-forwarded-for"];
  if (forwardedFor) {
    const ipString = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor;
    if (ipString) {
      const ips = ipString.split(",")[0]?.trim();
      if (ips) {
        return ips;
      }
    }
  }

  // Fallback to req.ip (requires trust proxy to be set)
  return req.ip || req.socket.remoteAddress || "unknown";
}

/**
 * Rate limiting middleware for HTTP endpoints
 * Uses the existing RateLimiter class with Redis
 */
function createRateLimitMiddleware(
  maxRequests: number,
  windowSeconds: number,
  rateLimitKey: string
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting for health check endpoint
    if (req.path === "/health") {
      return next();
    }

    const clientIp = getClientIp(req);
    const key = `http-api:${rateLimitKey}:${clientIp}`;

    try {
      // Check rate limit and record the request
      const result = await rateLimiter.checkRateLimit(
        {
          key,
          maxRequests,
          windowSeconds,
        },
        true // Record the request
      );

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", maxRequests.toString());
      res.setHeader("X-RateLimit-Remaining", result.remaining.toString());
      res.setHeader(
        "X-RateLimit-Reset",
        new Date(result.resetAt * 1000).toISOString()
      );

      if (!result.allowed) {
        const retryAfter = result.retryAfter || windowSeconds;
        res.setHeader("Retry-After", retryAfter.toString());
        logger.warn("Rate limit exceeded", {
          clientIp,
          key: rateLimitKey,
          path: req.path,
          method: req.method,
        });
        res.status(429).json({
          error: "Too many requests",
          message: `Rate limit exceeded. Please try again after ${retryAfter} seconds.`,
          retryAfter,
        });
        return;
      }

      next();
    } catch (error) {
      // If rate limiting fails, log but allow the request (fail-open)
      // In production, you might want to fail-closed instead
      logger.error("Rate limiting error, allowing request", {
        error,
        clientIp,
        key: rateLimitKey,
      });
      next();
    }
  };
}

// CORS middleware
function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const allowedOrigins = getAllowedOrigins();
  const corsOrigin = getCorsOrigin(req, allowedOrigins);

  if (corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}

export function createHttpServer() {
  const app = express();

  // Trust proxy for accurate IP addresses (needed when behind reverse proxy/load balancer)
  app.set("trust proxy", true);

  // Middleware
  // Add request size limit to prevent large payload attacks
  app.use(express.json({ limit: `${env.HTTP_REQUEST_SIZE_LIMIT}b` }));
  app.use(corsMiddleware);

  // Rate limiting middleware
  // Stricter limits for POST endpoints (write operations)
  const postRateLimit = createRateLimitMiddleware(
    env.HTTP_RATE_LIMIT_POST_REQUESTS_PER_MINUTE,
    env.HTTP_RATE_LIMIT_WINDOW_SECONDS,
    "post"
  );
  // More lenient limits for GET endpoints (read operations)
  const getRateLimit = createRateLimitMiddleware(
    env.HTTP_RATE_LIMIT_REQUESTS_PER_MINUTE,
    env.HTTP_RATE_LIMIT_WINDOW_SECONDS,
    "get"
  );

  // POST /debates
  app.post("/debates", postRateLimit, async (req: Request, res: Response) => {
    try {
      const validated = CreateDebateSchema.parse(req.body);
      // Extract userId from body or use debaterAId if userId not provided
      // This allows tracking who created the debate
      const userId = (req.body as any).userId || validated.debaterAId;
      const result = await debateOrchestrator.createDebateSession(
        validated,
        userId
      );
      res.status(200).json(result);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        res.status(400).json({
          error: "Invalid request data",
          details: error.errors,
        });
        return;
      }
      logger.error("Error creating debate", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /debates/:id/assign
  app.post(
    "/debates/:id/assign",
    postRateLimit,
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        if (!id) {
          res.status(400).json({ error: "Debate ID is required" });
          return;
        }
        const position = (req.body as any).position; // "A" or "B"
        const userId = (req.body as any).userId;

        if (!position || !["A", "B"].includes(position)) {
          res.status(400).json({
            error: "Invalid position. Must be 'A' or 'B'",
          });
          return;
        }
        if (!userId) {
          res.status(400).json({ error: "userId is required" });
          return;
        }

        await debateOrchestrator.assignDebater(id, position, userId);
        res.status(200).json({ success: true });
      } catch (error: any) {
        logger.error("Error assigning debater", { error });
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // GET /debates/:id
  app.get("/debates/:id", getRateLimit, async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "Debate ID is required" });
        return;
      }
      const state = await debateOrchestrator.loadSessionState(id);
      if (!state) {
        res.status(404).json({ error: "Debate session not found" });
        return;
      }
      res.status(200).json(state);
    } catch (error: any) {
      logger.error("Error loading debate session", { error });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /debates/:id/retry-judge
  app.post(
    "/debates/:id/retry-judge",
    postRateLimit,
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        if (!id) {
          res.status(400).json({ error: "Debate ID is required" });
          return;
        }
        await debateOrchestrator.retryJudging(id);
        res.status(200).json({
          success: true,
          message: "Judging retry initiated",
        });
      } catch (error: any) {
        logger.error("Failed to retry judging", {
          sessionId: req.params.id,
          error,
        });
        res.status(400).json({
          error:
            error instanceof Error ? error.message : "Failed to retry judging",
        });
      }
    }
  );

  // GET /debates/:id/invite
  app.get(
    "/debates/:id/invite",
    getRateLimit,
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        if (!id) {
          res.status(400).json({ error: "Debate ID is required" });
          return;
        }
        const inviteLink = await debateOrchestrator.getInvitationLink(id);
        if (!inviteLink) {
          res.status(404).json({
            error: "Debate session not found or no invitation token",
          });
          return;
        }
        res.status(200).json(inviteLink);
      } catch (error: any) {
        logger.error("Error getting invitation link", { error });
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // POST /debates/:id/accept-invitation
  app.post(
    "/debates/:id/accept-invitation",
    postRateLimit,
    async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        if (!id) {
          res.status(400).json({ error: "Debate ID is required" });
          return;
        }
        const token = (req.body as any).token;
        const userId = (req.body as any).userId;

        if (!token) {
          res.status(400).json({ error: "Token is required" });
          return;
        }
        if (!userId) {
          res.status(400).json({ error: "userId is required" });
          return;
        }

        const success = await debateOrchestrator.acceptInvitation(
          id,
          token,
          userId
        );
        if (!success) {
          res.status(400).json({
            error: "Invalid or expired invitation token",
          });
          return;
        }
        res.status(200).json({ success: true });
      } catch (error: any) {
        logger.error("Error accepting invitation", { error });
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // GET /health
  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // Error handler (must have 4 parameters)
  app.use((error: any, req: Request, res: Response, next: NextFunction) => {
    logger.error("HTTP handler error", { error });
    if (error?.name === "ZodError") {
      res.status(400).json({
        error: "Invalid request data",
        details: error.errors,
      });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
