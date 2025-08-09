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

  // Storage
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),

  // PostHog (optional)
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),

  // Rate limiting
  RATE_LIMIT_DEBATES_PER_DAY: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("3"),

  // WebSocket
  WS_PORT: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("3001"),
  WS_PUBLIC_URL: z.string().url().optional(),

  // HTTP Server
  SERVER_PORT: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("3002"),

  // HTTP API
  HTTP_PORT: z
    .string()
    .transform((val: string) => parseInt(val, 10))
    .default("3002"),

  // Environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
