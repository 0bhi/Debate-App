import http, { IncomingMessage, ServerResponse } from "http";
import { parse as parseUrl } from "url";
import { env } from "./env";
import { debateOrchestrator } from "./orchestrator/debateOrchestrator";
import { logger } from "./utils/logger";
import { CreateDebateSchema, JudgeRequestSchema } from "@repo/types";

function sendJson(res: ServerResponse, status: number, payload: any) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf8");
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(e);
        }
      })
      .on("error", reject);
  });
}

export function createHttpServer() {
  const server = http.createServer(async (req, res) => {
    const url = parseUrl(req.url || "", true);
    const method = (req.method || "GET").toUpperCase();

    // CORS for ease of development and separate deploys
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    if (method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    try {
      // POST /debates
      if (method === "POST" && url.pathname === "/debates") {
        const body = await parseJsonBody(req);
        const validated = CreateDebateSchema.parse(body);
        const result = await debateOrchestrator.createDebateSession(validated);
        return sendJson(res, 200, result);
      }

      // GET /debates/:id
      const debateMatch = url.pathname?.match(/^\/debates\/([^/]+)$/);
      if (method === "GET" && debateMatch) {
        const id = debateMatch[1];
        const state = await debateOrchestrator.loadSessionState(id);
        if (!state) return sendJson(res, 404, { error: "Debate session not found" });
        return sendJson(res, 200, state);
      }

      // POST /debates/:id/judge
      const judgeMatch = url.pathname?.match(/^\/debates\/([^/]+)\/judge$/);
      if (method === "POST" && judgeMatch) {
        const id = judgeMatch[1];
        const body = await parseJsonBody(req);
        const validated = JudgeRequestSchema.parse(body);
        const exists = await debateOrchestrator.loadSessionState(id);
        if (!exists) return sendJson(res, 404, { error: "Debate session not found" });
        if (exists.status !== "JUDGING" && exists.status !== "FINISHED") {
          return sendJson(res, 400, { error: "Debate is not ready for judging" });
        }
        await debateOrchestrator.userJudgeDebate(id, validated.winner);
        return sendJson(res, 200, { success: true, winner: validated.winner });
      }

      // GET /health
      if (method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, { ok: true });
      }

      // Not found
      sendJson(res, 404, { error: "Not found" });
    } catch (error: any) {
      logger.error("HTTP handler error", { error });
      if (error?.name === "ZodError") {
        return sendJson(res, 400, { error: "Invalid request data", details: error.errors });
      }
      sendJson(res, 500, { error: "Internal server error" });
    }
  });

  return server;
}


