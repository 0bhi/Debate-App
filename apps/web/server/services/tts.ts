import { openai } from "./llm";
import { env } from "../../lib/env";
import { logger } from "../utils/logger";

export interface TTSResponse {
  audioBuffer: Buffer;
  durationMs: number;
}

export class TTSService {
  async generateSpeech(
    text: string,
    voice: string = "alloy"
  ): Promise<TTSResponse> {
    const startTime = Date.now();

    try {
      // Map custom voice names to OpenAI voices
      const openaiVoice = this.mapVoiceToOpenAI(voice);

      const response = await openai.audio.speech.create({
        model: "tts-1",
        voice: openaiVoice,
        input: text,
        response_format: "mp3",
        speed: 1.0,
      });

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const durationMs = Date.now() - startTime;

      logger.info("TTS audio generated", {
        voice: openaiVoice,
        textLength: text.length,
        audioSize: audioBuffer.length,
        durationMs,
      });

      return {
        audioBuffer,
        durationMs,
      };
    } catch (error) {
      logger.error("TTS generation failed", {
        error,
        voice,
        textLength: text.length,
      });
      throw error;
    }
  }

  private mapVoiceToOpenAI(
    voice: string
  ): "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" {
    // Map persona voices to OpenAI voices
    const voiceMap: Record<
      string,
      "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
    > = {
      "steve-jobs": "onyx",
      "elon-musk": "echo",
      "jobs-1": "onyx",
      "elon-1": "echo",
      deep: "onyx",
      authoritative: "echo",
      friendly: "alloy",
      storyteller: "fable",
      energetic: "nova",
      calm: "shimmer",
    };

    return voiceMap[voice] || "alloy";
  }
}

export const ttsService = new TTSService();
