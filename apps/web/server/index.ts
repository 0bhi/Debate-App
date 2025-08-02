import "dotenv/config";

import { getWebSocketServer } from "./ws";
import { initializeQueues } from "./queues";
import { ttsWorker } from "./queues/tts-worker";
import { logger } from "./utils/logger";
import { env } from "../lib/env";

async function startServer() {
  let wsServer: any;

  try {
    logger.info("Starting AI Debate Club server...");

    // Initialize queues
    await initializeQueues();

    // Start WebSocket server
    try {
      logger.info("🔍 Attempting to start WebSocket server...");
      wsServer = getWebSocketServer();
      logger.info("✅ WebSocket server started successfully");
    } catch (error) {
      logger.error("❌ Failed to start WebSocket server:", error);
      throw error; // Re-throw to see the full error
    }

    // Start workers
    logger.info("TTS worker started");

    logger.info(`🚀 AI Debate Club server running!`);
    logger.info(`📡 WebSocket server: ws://localhost:${env.WS_PORT}`);
    logger.info(`🎬 Next.js app: http://localhost:3000`);

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down gracefully...");

      await Promise.all([wsServer.close(), ttsWorker.close()]);

      process.exit(0);
    });

    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down gracefully...");

      await Promise.all([wsServer.close(), ttsWorker.close()]);

      process.exit(0);
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

startServer();

export { startServer };
