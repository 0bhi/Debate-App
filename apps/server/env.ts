import { z } from "zod";

const envSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  GEMINI_API_KEY: z.string().min(1),
  GEMINI_BASE_URL: z
    .string()
    .url()
    .default("https://generativelanguage.googleapis.com/v1beta/openai/"),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // PostHog (optional)
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),

  // Rate limiting
  RATE_LIMIT_DEBATES_PER_DAY: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("3"),

  // HTTP API rate limiting
  HTTP_RATE_LIMIT_REQUESTS_PER_MINUTE: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("100"), // General API rate limit per IP
  HTTP_RATE_LIMIT_WINDOW_SECONDS: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("60"), // 1 minute window
  HTTP_RATE_LIMIT_POST_REQUESTS_PER_MINUTE: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("30"), // Stricter limit for POST endpoints
  HTTP_REQUEST_SIZE_LIMIT: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("10485760"), // 10MB default (in bytes)

  // Gemini API rate limiting (requests per minute)
  // Free tier: ~15 RPM, Paid tier: higher limits
  GEMINI_RATE_LIMIT_RPM: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("10"), // Conservative default to avoid 429 errors
  GEMINI_RATE_LIMIT_WINDOW_SECONDS: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("60"), // 1 minute window

  // WebSocket
  WS_PORT: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("3001"),
  WS_PUBLIC_URL: z.string().url().optional(),

  // HTTP API
  HTTP_PORT: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("3002"),

  // Environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // CORS
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  // NextAuth (for WebSocket authentication)
  NEXTAUTH_SECRET: z.string().min(1),
});

// Parse environment variables with better error handling
function getEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .filter((e) => e.code === "invalid_type" && e.received === "undefined")
        .map((e) => e.path.join("."))
        .join(", ");

      if (missingVars) {
        throw new Error(
          `Missing required environment variables: ${missingVars}\n` +
            `Please check your .env file in apps/server directory.\n` +
            `Required variables: ${missingVars}\n` +
            `\nFor NEXTAUTH_SECRET, use the same value as in apps/web/.env\n` +
            `You can generate one with: openssl rand -base64 32`
        );
      }
    }
    throw error;
  }
}

export const env = getEnv();

export type Env = z.infer<typeof envSchema>;
