import "dotenv/config";

import { Worker, Job } from "bullmq";
import { ttsService } from "../services/tts";
import { storageService } from "../services/storage";
import { prisma } from "../services/prisma";
import { redisPub } from "../services/redis";
import { logger } from "../utils/logger";
import { env } from "../../lib/env";

interface TTSJobData {
  sessionId: string;
  orderIndex: number;
  text: string;
  voice: string;
}

const connection = {
  host: new URL(env.REDIS_URL).hostname,
  port: Number(new URL(env.REDIS_URL).port) || 6379,
  password: new URL(env.REDIS_URL).password || undefined,
};

export const ttsWorker = new Worker(
  "tts",
  async (job: Job<TTSJobData>) => {
    const { sessionId, orderIndex, text, voice } = job.data;

    logger.info("Processing TTS job", {
      sessionId,
      orderIndex,
      textLength: text.length,
    });

    try {
      // Generate speech audio
      const { audioBuffer } = await ttsService.generateSpeech(text, voice);

      // Upload to storage
      const filename = `session-${sessionId}-turn-${orderIndex}.mp3`;
      const audioUrl = await storageService.uploadAudio(audioBuffer, filename);

      // Update database with audio URL
      await prisma.debateTurn.update({
        where: {
          sessionId_orderIndex: {
            sessionId,
            orderIndex,
          },
        },
        data: {
          audioUrl,
        },
      });

      // Notify via WebSocket if clients are still connected
      await redisPub.publish(
        "ws-events",
        JSON.stringify({
          type: "AUDIO_READY",
          sessionId,
          orderIndex,
          audioUrl,
        })
      );

      logger.info("TTS job completed", { sessionId, orderIndex, audioUrl });

      return { audioUrl };
    } catch (error) {
      logger.error("TTS job failed", { sessionId, orderIndex, error });
      throw error;
    }
  },
  {
    connection,
    concurrency: 3, // Process up to 3 TTS jobs simultaneously
  }
);

ttsWorker.on("completed", (job) => {
  logger.info("TTS worker completed job", { jobId: job.id });
});

ttsWorker.on("failed", (job, err) => {
  logger.error("TTS worker job failed", { jobId: job?.id, error: err });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  logger.info("Starting TTS worker");

  process.on("SIGTERM", async () => {
    logger.info("Shutting down TTS worker");
    await ttsWorker.close();
  });
}
