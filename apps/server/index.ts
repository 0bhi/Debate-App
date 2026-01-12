import "dotenv/config";
import { config } from "dotenv";
import { resolve, dirname, normalize } from "path";
import { fileURLToPath } from "url";

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, ".env") });

import { getWebSocketServer } from "./ws";
import { logger } from "./utils/logger";
import { env } from "./env";

// Export the orchestrator for the web app to use
export { debateOrchestrator } from "./orchestrator/debateOrchestrator";
export { logger } from "./utils/logger";
export { getWebSocketServer } from "./ws";
export { prisma } from "@repo/database";
export type { SessionState } from "@repo/types";

async function startServer() {
  let wsServer: any;
  let httpServer: any;

  try {
    logger.info("Starting AI Debate Club server...");

    // Recover pending turns for running debates (after server restart)
    try {
      const { debateOrchestrator } =
        await import("./orchestrator/debateOrchestrator");
      logger.info("Recovering pending turns for running debates...");
      await debateOrchestrator.recoverPendingTurns();
      logger.info("Pending turns recovery completed");
    } catch (error) {
      logger.warn("Failed to recover pending turns, continuing", { error });
    }

    // Start WebSocket server
    try {
      wsServer = getWebSocketServer();
    } catch (error) {
      logger.error("Failed to start WebSocket server", { error });
      throw error;
    }

    // Start HTTP API server
    try {
      const { createHttpServer } = await import("./server");
      const app = createHttpServer();
      httpServer = app.listen(env.HTTP_PORT, () => {
        logger.info(`HTTP API server listening on port ${env.HTTP_PORT}`);
      });
    } catch (error) {
      logger.error("Failed to start HTTP API server", { error });
      throw error;
    }

    logger.info("Server running", {
      wsPort: env.WS_PORT,
      httpPort: env.HTTP_PORT,
    });

    // Graceful shutdown
    process.on("SIGTERM", async () => {
      logger.info("Received SIGTERM, shutting down gracefully...");

      await Promise.all([
        wsServer.close(),
        new Promise<void>((res, rej) =>
          httpServer?.close((e: any) => (e ? rej(e) : res()))
        ),
      ]);

      process.exit(0);
    });

    process.on("SIGINT", async () => {
      logger.info("Received SIGINT, shutting down gracefully...");

      await Promise.all([
        wsServer.close(),
        new Promise<void>((res, rej) =>
          httpServer?.close((e: any) => (e ? rej(e) : res()))
        ),
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
