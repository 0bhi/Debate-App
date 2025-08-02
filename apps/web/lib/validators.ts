import { z } from "zod";

// Persona schema
export const PersonaSchema = z.object({
  name: z.string().min(1).max(100),
  bio: z.string().min(1).max(500),
  style: z.string().min(1).max(200),
  voice: z.string().min(1).max(50),
});

// Create debate request schema
export const CreateDebateSchema = z.object({
  topic: z.string().min(10).max(500),
  personaA: PersonaSchema,
  personaB: PersonaSchema,
  rounds: z.number().int().min(1).max(5).default(2),
  autoJudge: z.boolean().default(true),
});

// Judge request schema
export const JudgeRequestSchema = z.object({
  winner: z.enum(["A", "B", "TIE"]),
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
    type: z.literal("USER_JUDGE"),
    sessionId: z.string(),
    winner: z.enum(["A", "B", "TIE"]),
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
    type: z.literal("TURN_START"),
    speaker: z.enum(["A", "B"]),
    orderIndex: z.number(),
  }),
  z.object({
    type: z.literal("TURN_TOKEN"),
    chunk: z.string(),
  }),
  z.object({
    type: z.literal("TURN_END"),
    text: z.string(),
    audioUrl: z.string().optional(),
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
export type Persona = z.infer<typeof PersonaSchema>;
export type CreateDebateRequest = z.infer<typeof CreateDebateSchema>;
export type JudgeRequest = z.infer<typeof JudgeRequestSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
