import { z } from "zod";

// Create debate request schema
export const CreateDebateSchema = z.object({
  topic: z.string().min(10).max(500),
  debaterAId: z.string().optional(), // Optional - can be set later
  debaterBId: z.string().optional(), // Optional - can be set later
  rounds: z.number().int().min(1).max(5).default(2),
  autoJudge: z.boolean().default(true), // Always true, kept for backwards compatibility
});

// WebSocket message schemas
export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("JOIN_SESSION"),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal("REQUEST_STATE"),
    sessionId: z.string(),
  }),
  z.object({
    type: z.literal("SUBMIT_ARGUMENT"),
    sessionId: z.string(),
    argument: z.string().min(10).max(2000),
  }),
  z.object({
    type: z.literal("PING"),
  }),
]);

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("SESSION_STATE"),
    data: z.any(), // SessionState type
  }),
  z.object({
    type: z.literal("YOUR_TURN"),
    speaker: z.enum(["A", "B"]),
    orderIndex: z.number(),
  }),
  z.object({
    type: z.literal("WINNER"),
    winner: z.enum(["A", "B", "TIE"]),
    judgeJSON: z.any().optional(),
  }),
  z.object({
    type: z.literal("ERROR"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("HEARTBEAT"),
  }),
]);

// Export types
export type CreateDebateRequest = z.infer<typeof CreateDebateSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// Session state interface
export interface SessionState {
  id: string;
  topic: string;
  debaterAId?: string;
  debaterBId?: string;
  debaterAName?: string;
  debaterBName?: string;
  rounds: number;
  status: string;
  winner?: string;
  judgeJSON?: any;
  autoJudge: boolean;
  turns: Array<{
    id: string;
    orderIndex: number;
    speaker: string;
    response: string;
    createdAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
