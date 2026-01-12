import { redis } from "./redis";
import { logger } from "../utils/logger";

export interface RateLimitOptions {
  /**
   * Maximum number of requests allowed in the time window
   */
  maxRequests: number;
  /**
   * Time window in seconds
   */
  windowSeconds: number;
  /**
   * Unique identifier for this rate limit (e.g., "gemini-api")
   */
  key: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
  retryAfter?: number; // Seconds to wait before retry if not allowed
}

/**
 * Rate limiter using Redis sliding window counter
 * Implements a distributed rate limiter that works across multiple server instances
 */
export class RateLimiter {
  /**
   * Check if a request is allowed WITHOUT recording it
   * Use this to check before making an API call
   */
  async checkRateLimit(
    options: RateLimitOptions,
    recordRequest: boolean = false
  ): Promise<RateLimitResult> {
    const { maxRequests, windowSeconds, key } = options;
    const redisKey = `rate_limit:${key}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - windowSeconds;

    try {
      // Use Redis sorted set to track requests with timestamps as scores
      // Remove old entries outside the window
      await redis.zremrangebyscore(redisKey, 0, windowStart);

      // Count current requests in the window
      const currentCount = await redis.zcard(redisKey);

      if (currentCount >= maxRequests) {
        // Rate limit exceeded - find the oldest request to calculate retry time
        const oldestRequest = await redis.zrange(redisKey, 0, 0, "WITHSCORES");
        if (oldestRequest && oldestRequest.length >= 2 && oldestRequest[1]) {
          const oldestTimestamp = parseInt(oldestRequest[1], 10);
          const retryAfter = oldestTimestamp + windowSeconds - now + 1; // +1 for safety margin

          logger.warn("Rate limit exceeded", {
            key,
            currentCount,
            maxRequests,
            retryAfter,
          });

          return {
            allowed: false,
            remaining: 0,
            resetAt: oldestTimestamp + windowSeconds,
            retryAfter: Math.max(0, retryAfter),
          };
        }

        return {
          allowed: false,
          remaining: 0,
          resetAt: now + windowSeconds,
          retryAfter: windowSeconds,
        };
      }

      // Only record the request if explicitly requested (when actually making the API call)
      if (recordRequest) {
        const requestId = `${now}-${Math.random()}`; // Unique ID for this request
        await redis.zadd(redisKey, now, requestId);

        // Set expiration on the key to prevent Redis memory bloat
        await redis.expire(redisKey, windowSeconds + 60); // Extra 60s buffer
      }

      const remaining = maxRequests - currentCount - (recordRequest ? 1 : 0);
      const resetAt = now + windowSeconds;

      return {
        allowed: true,
        remaining: Math.max(0, remaining),
        resetAt,
      };
    } catch (error) {
      // If Redis fails, log and allow the request (fail-open)
      // In production, you might want to fail-closed instead
      logger.error("Rate limiter Redis error, allowing request", {
        error,
        key,
      });
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowSeconds,
      };
    }
  }

  /**
   * Record that a request was actually made (call this after making the API call)
   * This ensures we only count actual API calls, not retries
   */
  async recordRequest(options: RateLimitOptions): Promise<void> {
    const { windowSeconds, key } = options;
    const redisKey = `rate_limit:${key}`;
    const now = Math.floor(Date.now() / 1000);

    try {
      const requestId = `${now}-${Math.random()}`;
      await redis.zadd(redisKey, now, requestId);
      await redis.expire(redisKey, windowSeconds + 60);
    } catch (error) {
      // Log but don't throw - we don't want to fail the request if rate limit recording fails
      logger.error("Failed to record request in rate limiter", { error, key });
    }
  }

  /**
   * Wait until rate limit allows a request
   * Returns immediately if allowed, otherwise waits and retries
   */
  async waitForRateLimit(
    options: RateLimitOptions,
    maxWaitSeconds: number = 60
  ): Promise<RateLimitResult> {
    const startTime = Date.now();
    const maxWaitMs = maxWaitSeconds * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      // Check without recording during wait
      const result = await this.checkRateLimit(options, false);

      if (result.allowed) {
        return result;
      }

      // Wait for retry, but cap the wait time
      const waitMs = Math.min(
        (result.retryAfter || options.windowSeconds) * 1000,
        maxWaitMs - (Date.now() - startTime)
      );

      if (waitMs > 0) {
        logger.info("Waiting for rate limit", {
          key: options.key,
          waitSeconds: waitMs / 1000,
          retryAfter: result.retryAfter,
        });
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    // Max wait time exceeded
    throw new Error(
      `Rate limit wait timeout: exceeded ${maxWaitSeconds}s wait time for ${options.key}`
    );
  }
}

export const rateLimiter = new RateLimiter();
