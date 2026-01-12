import jwt from "jsonwebtoken";
import { env } from "../env";
import { logger } from "../utils/logger";

/**
 * NextAuth JWT token payload structure
 */
interface NextAuthJWT {
  sub?: string; // User ID
  email?: string;
  name?: string;
  picture?: string;
  iat?: number;
  exp?: number;
}

/**
 * Verify a NextAuth JWT token and extract user information
 * @param token - The JWT token string
 * @returns The decoded token payload with user ID, or null if invalid
 */
export function verifyNextAuthToken(token: string): NextAuthJWT | null {
  try {
    // NextAuth uses the secret to sign JWT tokens
    const decoded = jwt.verify(token, env.NEXTAUTH_SECRET) as NextAuthJWT;

    // Verify the token has a user ID (sub claim)
    if (!decoded.sub) {
      logger.warn("JWT token missing user ID (sub claim)");
      return null;
    }

    return decoded;
  } catch (error: any) {
    logger.warn("JWT token verification failed", {
      error: error.message,
      errorName: error.name,
    });
    return null;
  }
}

/**
 * Extract JWT token from various sources (query param, header, etc.)
 * @param req - The incoming HTTP request
 * @returns The JWT token string, or null if not found
 */
export function extractTokenFromRequest(req: {
  url?: string | null;
  headers?: Record<string, string | string[] | undefined>;
}): string | null {
  // Try query parameter first (for WebSocket connections)
  if (req.url) {
    try {
      const url = new URL(req.url, "http://localhost");
      const token = url.searchParams.get("token");
      if (token) {
        return token;
      }
    } catch (error) {
      // URL parsing failed, continue to other methods
    }
  }

  // Try Authorization header
  const authHeader = req.headers?.authorization;
  if (authHeader) {
    // Handle case where authorization might be an array (take first value)
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    if (!headerValue) {
      return null;
    }

    // Support "Bearer <token>" format
    if (headerValue.startsWith("Bearer ")) {
      return headerValue.substring(7);
    }
    // Or just the token itself
    return headerValue;
  }

  return null;
}
