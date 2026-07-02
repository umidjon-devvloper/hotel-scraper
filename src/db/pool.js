import pg from "pg";
import config from "../config.js";

const { Pool } = pg;

let pool = null;

/** Returns a shared pg Pool, or null when DATABASE_URL is not configured. */
export function getPool() {
  if (pool) return pool;
  if (!config.databaseUrl) return null;
  pool = new Pool({
    connectionString: config.databaseUrl,
    // Railway/managed PG usually requires SSL in production.
    ssl: config.env === "production" ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", (err) => console.error("[pg] idle client error:", err.message));
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  if (!p) return null;
  return p.query(text, params);
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
