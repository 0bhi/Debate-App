import Redis from "ioredis";
import { env } from "../env";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  connectionName: "debate-app",
});

// Pub/Sub clients (separate connections for publishing and subscribing)
export const redisPub = new Redis(env.REDIS_URL, {
  connectionName: "debate-app-pub",
});

export const redisSub = new Redis(env.REDIS_URL, {
  connectionName: "debate-app-sub",
});

redis.on("error", (err) => {
  console.error("Redis connection error:", err);
});

redis.on("connect", () => {
  console.log("Redis connected");
});

export default redis;
