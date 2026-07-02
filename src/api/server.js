import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import config from "../config.js";
import { apiKeyAuth } from "./auth.js";
import searchRoutes from "./routes/search.js";
import healthRoutes from "./routes/health.js";
import { closePool } from "../db/pool.js";
import { closeRedis } from "../cache/redis.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.env === "production" ? "info" : "debug",
      transport: config.env === "production" ? undefined : { target: "pino-pretty" },
    },
    trustProxy: true,
  });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    keyGenerator: (req) => req.headers["x-api-key"] || req.ip,
  });

  // Public
  await app.register(healthRoutes);
  app.get("/", async () => ({
    name: "hotels-aggregator-api",
    version: "1.0.0",
    docs: "/v1/providers, /v1/search?provider=booking&location=Paris, /v1/hotel?provider=booking&link=...",
  }));

  // Authenticated v1 API
  await app.register(
    async (v1) => {
      v1.addHook("preHandler", apiKeyAuth);
      await v1.register(searchRoutes);
    },
    { prefix: "/v1" }
  );

  app.addHook("onClose", async () => {
    await closePool();
    await closeRedis();
  });

  return app;
}
