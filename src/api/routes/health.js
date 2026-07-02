import { getPool } from "../../db/pool.js";
import { cacheEnabled } from "../../cache/redis.js";

export default async function healthRoutes(app) {
  app.get("/health", async () => {
    let db = "disabled";
    const pool = getPool();
    if (pool) {
      try {
        await pool.query("SELECT 1");
        db = "ok";
      } catch {
        db = "error";
      }
    }
    return {
      status: "ok",
      uptime: Math.round(process.uptime()),
      db,
      cache: cacheEnabled() ? "ok" : "disabled",
      time: new Date().toISOString(),
    };
  });
}
