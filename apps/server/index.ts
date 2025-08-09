import "dotenv/config";
import { config } from "dotenv";
import { resolve, dirname, normalize } from "path";
import { fileURLToPath } from "url";

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, ".env") });

import { getWebSocketServer } from "./ws";
import { initializeQueues } from "./queues";
import { ttsWorker } from "./queues/tts-worker";
import { logger } from "./utils/logger";
import { env } from "./env";

// Export the orchestrator for the web app to use
export { debateOrchestrator } from "./orchestrator/debateOrchestrator";
export { logger } from "./utils/logger";
export { getWebSocketServer } from "./ws";
export { prisma } from "./services/prisma";
export type { SessionState } from "@repo/types";

async function startServer() {
  let wsServer: any;
  let httpServer: any;

  try {
    logger.info("Starting AI Debate Club server...");

    // Initialize queues
    logger.info("Initializing queues...");
    try {
      await initializeQueues();
      logger.info("Queues initialized successfully");
    } catch (error) {
      logger.warn("Failed to initialize queues, continuing without queues", {
        error,
      });
    }

    // Start WebSocket server
    try {
      logger.info("🔍 Attempting to start WebSocket server...");
      logger.info(`🔍 WS_PORT from env: ${env.WS_PORT}`);
      wsServer = getWebSocketServer();
      logger.info("✅ WebSocket server started successfully");
    } catch (error) {
      logger.error("❌ Failed to start WebSocket server:", error);
      throw error; // Re-throw to see the full error
    }

    // Start HTTP API server
    try {
      const { createHttpServer } = await import("./server");
      httpServer = createHttpServer();
      httpServer.listen(env.HTTP_PORT, () => {
        logger.info(`✅ HTTP API server listening on port ${env.HTTP_PORT}`);
      });
    } catch (error) {
      logger.error("❌ Failed to start HTTP API server:", error);
      throw error;
    }

    // Start workers
    logger.info("Starting TTS worker...");
    logger.info("TTS worker started");

    logger.info(`🚀 AI Debate Club server running!`);
    logger.info(`📡 WebSocket server: ws://localhost:${env.WS_PORT}`);
    logger.info(`🛠  HTTP API server: http://localhost:${env.HTTP_PORT}`);
    logger.info(`🎬 Next.js app: http://localhost:3000`);

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down gracefully...");

      await Promise.all([
        wsServer.close(),
        new Promise((res, rej) => httpServer?.close((e: any) => (e ? rej(e) : res(null)))),
        ttsWorker.close(),
      ]);

      process.exit(0);
    });

    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down gracefully...");

      await Promise.all([
        wsServer.close(),
        new Promise((res, rej) => httpServer?.close((e: any) => (e ? rej(e) : res(null)))),
        ttsWorker.close(),
      ]);

      process.exit(0);
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

// Only start the server if this file is run directly (cross-platform safe)
try {
  const thisFilePath = normalize(fileURLToPath(import.meta.url));
  const entryArg = process.argv[1] ? normalize(resolve(process.argv[1])) : "";
  if (thisFilePath === entryArg) {
    startServer();
  }
} catch {
  // Fallback: do not auto-start on import
}

export { startServer };
