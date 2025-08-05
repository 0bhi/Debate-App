import { Queue, Worker, ConnectionOptions } from "bullmq";
import { env } from "../env";
import { logger } from "../utils/logger";

const connection: ConnectionOptions = {
  host: new URL(env.REDIS_URL).hostname,
  port: Number(new URL(env.REDIS_URL).port) || 6379,
  password: new URL(env.REDIS_URL).password || undefined,
};

// TTS Queue
export const ttsQueue = new Queue("tts", { connection });

// Export Queue
export const exportQueue = new Queue("export", { connection });

// Initialize queues
export async function initializeQueues() {
  logger.info("Initializing BullMQ queues");

  try {
    // Clean up any existing jobs (optional, for development)
    if (env.NODE_ENV === "development") {
      await ttsQueue.obliterate({ force: true });
      await exportQueue.obliterate({ force: true });
    }

    logger.info("Queues initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize queues", { error });
    throw error;
  }
}

// Graceful shutdown
export async function closeQueues() {
  logger.info("Closing BullMQ queues");

  await Promise.all([ttsQueue.close(), exportQueue.close()]);

  logger.info("Queues closed");
}
