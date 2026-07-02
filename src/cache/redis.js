import { createHash } from "node:crypto";
import Redis from "ioredis";
import config from "../config.js";

let client = null;
let disabled = !config.redisUrl;

/** Lazily create the Redis client. Returns null when REDIS_URL is unset. */
function getClient() {
  if (disabled) return null;
  if (client) return client;
  client = new Redis(config.redisUrl, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
  });
  client.on("error", (e) => {
    // Degrade gracefully: log once-ish and stop using cache.
    if (!disabled) console.error("[redis] error, disabling cache:", e.message);
    disabled = true;
  });
  return client;
}

/** Stable cache key from a provider + params object. */
export function cacheKey(prefix, obj) {
  const hash = createHash("sha1").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
  return `${prefix}:${hash}`;
}

export async function cacheGet(key) {
  const c = getClient();
  if (!c) return null;
  try {
    const raw = await c.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttl = config.cacheTtlSeconds) {
  const c = getClient();
  if (!c) return;
  try {
    await c.set(key, JSON.stringify(value), "EX", ttl);
  } catch {
    /* ignore cache write errors */
  }
}

export function cacheEnabled() {
  return !disabled;
}

export async function closeRedis() {
  if (client) {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
    client = null;
  }
}
