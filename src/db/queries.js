import { query } from "./pool.js";

/** Insert a search/details log row. No-op when DB is not configured. */
export async function logSearch(entry) {
  try {
    await query(
      `INSERT INTO search_logs
        (api_key, provider, endpoint, location, params, result_count, cache_hit, duration_ms, status, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        entry.apiKey || null,
        entry.provider,
        entry.endpoint,
        entry.location || null,
        JSON.stringify(entry.params || {}),
        entry.resultCount ?? null,
        !!entry.cacheHit,
        entry.durationMs ?? null,
        entry.status || "ok",
        entry.error || null,
      ]
    );
  } catch (e) {
    console.error("[db] logSearch failed:", e.message);
  }
}

/** Look up a managed API key from the DB. Returns row or null. */
export async function findApiKey(key) {
  try {
    const res = await query(`SELECT key, name, active, rate_limit FROM api_keys WHERE key = $1`, [key]);
    return res?.rows?.[0] || null;
  } catch {
    return null;
  }
}
