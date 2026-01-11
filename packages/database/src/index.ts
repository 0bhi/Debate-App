// Export Prisma client
export { prisma } from "./client";

// Re-export Prisma types for convenience
export type {
  Prisma,
  PrismaClient,
} from "@prisma/client";

// Export models and enums
export type {
  Account,
  Session,
  User,
  VerificationToken,
  DebateSession,
  DebateTurn,
  RateLimit,
  DebateStatus,
  DebateWinner,
  TurnSpeaker,
} from "@prisma/client";

