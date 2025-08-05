import { prisma } from "../services/prisma";
import { DebateStatus, DebateWinner, TurnSpeaker } from "@prisma/client";
import { llmService } from "../services/llm";
import { ttsQueue } from "../queues";
import { redisPub } from "../services/redis";
import { logger } from "../utils/logger";
import { CreateDebateRequest, Persona, SessionState } from "@repo/types";

export class DebateOrchestrator {
  async createDebateSession(
    request: CreateDebateRequest,
    userId?: string
  ): Promise<{ id: string; wsUrl: string }> {
    try {
      const session = await prisma.debateSession.create({
        data: {
          topic: request.topic,
          personaA: request.personaA as any,
          personaB: request.personaB as any,
          rounds: request.rounds,
          autoJudge: request.autoJudge,
          userId,
          status: "CREATED",
        },
      });

      logger.info("Debate session created", {
        sessionId: session.id,
        topic: request.topic,
        userId,
      });

      const wsUrl = `/api/ws?sessionId=${session.id}`;

      return {
        id: session.id,
        wsUrl,
      };
    } catch (error) {
      logger.error("Failed to create debate session", { error, request });
      throw error;
    }
  }

  async loadSessionState(sessionId: string): Promise<SessionState | null> {
    try {
      const session = await prisma.debateSession.findUnique({
        where: { id: sessionId },
        include: {
          turns: {
            orderBy: { orderIndex: "asc" },
          },
        },
      });

      if (!session) {
        return null;
      }

      return {
        id: session.id,
        topic: session.topic,
        personaA: session.personaA as Persona,
        personaB: session.personaB as Persona,
        rounds: session.rounds,
        status: session.status,
        winner: session.winner || undefined,
        judgeJSON: session.judgeJSON,
        autoJudge: session.autoJudge,
        turns: session.turns.map((turn) => ({
          id: turn.id,
          orderIndex: turn.orderIndex,
          speaker: turn.speaker,
          response: turn.response,
          audioUrl: turn.audioUrl || undefined,
          createdAt: turn.createdAt,
        })),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      };
    } catch (error) {
      logger.error("Failed to load session state", { error, sessionId });
      throw error;
    }
  }

  async startDebate(sessionId: string): Promise<void> {
    logger.info("Starting debate", { sessionId });

    try {
      const state = await this.loadSessionState(sessionId);
      if (!state) {
        throw new Error("Session not found");
      }

      if (state.status !== "CREATED") {
        throw new Error(`Cannot start debate from status: ${state.status}`);
      }

      // Update status to RUNNING
      await prisma.debateSession.update({
        where: { id: sessionId },
        data: { status: "RUNNING" },
      });

      // Start the debate flow
      this.runDebateFlow(sessionId).catch((error) => {
        logger.error("Debate flow failed", { sessionId, error });
      });
    } catch (error) {
      logger.error("Failed to start debate", { sessionId, error });
      throw error;
    }
  }

  private async runDebateFlow(sessionId: string): Promise<void> {
    try {
      const state = await this.loadSessionState(sessionId);
      if (!state) {
        throw new Error("Session not found");
      }

      let currentSpeaker: "A" | "B" = "A";
      const totalTurns = state.rounds * 2; // Each round has 2 turns (A then B)

      for (let i = 0; i < totalTurns; i++) {
        await this.processTurn(sessionId, i, currentSpeaker);
        currentSpeaker = currentSpeaker === "A" ? "B" : "A";
      }

      // Move to judging phase
      await this.startJudging(sessionId);
    } catch (error) {
      await this.markDebateFailed(sessionId, error);
      throw error;
    }
  }

  private async processTurn(
    sessionId: string,
    orderIndex: number,
    speaker: "A" | "B"
  ): Promise<void> {
    logger.info("Processing turn", { sessionId, orderIndex, speaker });

    // Broadcast turn start
    await this.broadcastToSession(sessionId, {
      type: "TURN_START",
      speaker,
      orderIndex,
    });

    try {
      const state = await this.loadSessionState(sessionId);
      if (!state) throw new Error("Session not found");

      const persona = speaker === "A" ? state.personaA : state.personaB;
      const prompt = this.buildDebatePrompt(state, speaker, orderIndex);

      // Stream LLM response
      const generator = llmService.streamDebateResponse(prompt, persona);
      let fullText = "";

      for await (const chunk of generator) {
        fullText += chunk;
        // Broadcast each chunk
        await this.broadcastToSession(sessionId, {
          type: "TURN_TOKEN",
          chunk,
        });
      }

      if (!prompt || prompt.trim() === "") {
        throw new Error("Prompt is empty or undefined");
      }
      if (!fullText || fullText.trim() === "") {
        throw new Error("Response text is empty or undefined");
      }
      if (!sessionId) {
        throw new Error("SessionId is missing");
      }

      // Save turn to database
      const turnData = {
        sessionId,
        orderIndex,
        speaker: speaker as TurnSpeaker,
        prompt,
        response: fullText.trim(),
      };

      // Add debug logging
      logger.info("Creating turn with data", { turnData });

      const turn = await prisma.debateTurn.create({
        data: turnData,
      });

      // Queue TTS job
      await ttsQueue.add("generate-audio", {
        sessionId,
        orderIndex,
        text: fullText.trim(),
        voice: persona.voice,
      });

      // Broadcast turn end
      await this.broadcastToSession(sessionId, {
        type: "TURN_END",
        text: fullText.trim(),
        audioUrl: null, // Will be updated when TTS completes
      });
    } catch (error) {
      console.log(error);
      logger.error("Turn processing failed", {
        sessionId,
        orderIndex,
        speaker,
        error,
      });
      throw error;
    }
  }

  private async startJudging(sessionId: string): Promise<void> {
    logger.info("Starting judging phase", { sessionId });

    try {
      // Update status to JUDGING
      await prisma.debateSession.update({
        where: { id: sessionId },
        data: { status: "JUDGING" },
      });

      const state = await this.loadSessionState(sessionId);
      if (!state) throw new Error("Session not found");

      if (state.autoJudge) {
        await this.autoJudgeDebate(sessionId);
      }
      // If not auto-judge, wait for user input via WebSocket
    } catch (error) {
      logger.error("Judging failed", { sessionId, error });
      throw error;
    }
  }

  async autoJudgeDebate(sessionId: string): Promise<void> {
    logger.info("Auto-judging debate", { sessionId });

    try {
      const state = await this.loadSessionState(sessionId);
      if (!state) throw new Error("Session not found");

      const transcript = this.buildTranscript(state);
      const judgeResult = await llmService.judgeDebate(state.topic, transcript);

      await this.saveJudgeResult(
        sessionId,
        judgeResult.winner,
        judgeResult.judgeJSON
      );

      // Broadcast winner
      await this.broadcastToSession(sessionId, {
        type: "WINNER",
        winner: judgeResult.winner,
        judgeJSON: judgeResult.judgeJSON,
      });
    } catch (error) {
      logger.error("Auto-judging failed", { sessionId, error });
      throw error;
    }
  }

  async userJudgeDebate(
    sessionId: string,
    winner: "A" | "B" | "TIE"
  ): Promise<void> {
    logger.info("User judging debate", { sessionId, winner });

    try {
      await this.saveJudgeResult(sessionId, winner, {
        winner,
        method: "user",
        timestamp: new Date().toISOString(),
      });

      // Broadcast winner
      await this.broadcastToSession(sessionId, {
        type: "WINNER",
        winner,
        judgeJSON: { winner, method: "user" },
      });
    } catch (error) {
      logger.error("User judging failed", { sessionId, winner, error });
      throw error;
    }
  }

  private async saveJudgeResult(
    sessionId: string,
    winner: "A" | "B" | "TIE",
    judgeJSON: any
  ): Promise<void> {
    await prisma.debateSession.update({
      where: { id: sessionId },
      data: {
        status: "FINISHED",
        winner: winner as DebateWinner,
        judgeJSON,
      },
    });

    logger.info("Debate finished", { sessionId, winner });
  }

  private async markDebateFailed(sessionId: string, error: any): Promise<void> {
    await prisma.debateSession.update({
      where: { id: sessionId },
      data: {
        status: "FAILED",
        judgeJSON: {
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      },
    });

    await this.broadcastToSession(sessionId, {
      type: "ERROR",
      message: "Debate failed to complete",
    });
  }

  private buildDebatePrompt(
    state: SessionState,
    speaker: "A" | "B",
    orderIndex: number
  ): string {
    const persona = speaker === "A" ? state.personaA : state.personaB;

    // Build turns history
    const turnsFormatted = state.turns
      .filter((turn) => turn.orderIndex < orderIndex)
      .map((turn) => {
        const speakerName =
          turn.speaker === "A" ? state.personaA.name : state.personaB.name;
        return `${speakerName}: ${turn.response}`;
      })
      .join("\n\n");

    const turnsSection = turnsFormatted
      ? `\nDebate so far:\n${turnsFormatted}\n`
      : "\n";

    return `Topic: "${state.topic}"${turnsSection}
It's your turn as ${persona.name}. Provide your next argument or rebuttal.`;
  }

  private buildTranscript(state: SessionState): string {
    return state.turns
      .map((turn) => {
        const speakerName =
          turn.speaker === "A" ? state.personaA.name : state.personaB.name;
        return `${speakerName}: ${turn.response}`;
      })
      .join("\n\n");
  }

  private async broadcastToSession(
    sessionId: string,
    message: any
  ): Promise<void> {
    await redisPub.publish(
      "ws-events",
      JSON.stringify({
        sessionId,
        ...message,
      })
    );
  }
}

export const debateOrchestrator = new DebateOrchestrator();
