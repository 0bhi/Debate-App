import { z } from "zod";

// Check if we're running on the server
const isServer = typeof window === "undefined";

// Base schema with all optional variables (for client-side)
const baseEnvSchema = z.object({
  // NextAuth
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(1).optional(),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Database (required for NextAuth PrismaAdapter)
  DATABASE_URL: z.string().url().optional(),

  // Rate limiting

  // Public URLs for client/browser
  NEXT_PUBLIC_WS_URL: z.string().url().optional(),
  NEXT_PUBLIC_SERVER_API_URL: z.string().url().optional(),

  // Environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

// Server-only schema that requires NEXTAUTH_SECRET
const serverEnvSchema = baseEnvSchema.extend({
  NEXTAUTH_SECRET: z.string().min(1),
});

// Parse environment variables with better error handling
function getEnv() {
  try {
    // Use server schema on server, base schema on client
    const envSchema = isServer ? serverEnvSchema : baseEnvSchema;
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors
        .filter((e) => e.code === "invalid_type" && e.received === "undefined")
        .map((e) => e.path.join("."))
        .join(", ");

      throw new Error(
        `Missing required environment variables: ${missingVars}\n` +
          `Please check your .env.local file in apps/web directory.\n` +
          `Required variables: ${missingVars}`
      );
    }
    throw error;
  }
}

export const env = getEnv();

// Export type (NEXTAUTH_SECRET is validated at runtime - required on server, optional on client)
export type Env = z.infer<typeof baseEnvSchema>;
