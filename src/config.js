import "dotenv/config";

const bool = (v, def = false) => (v === undefined ? def : ["1", "true", "yes", "on"].includes(String(v).toLowerCase()));
const int = (v, def) => (v === undefined || v === "" ? def : parseInt(v, 10));

const config = {
  env: process.env.NODE_ENV || "development",
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || "0.0.0.0",

  // Comma-separated bootstrap API keys (managed keys also live in Postgres).
  apiKeys: (process.env.API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean),

  // Cache
  redisUrl: process.env.REDIS_URL || "",
  cacheTtlSeconds: int(process.env.CACHE_TTL_SECONDS, 1800), // 30 min

  // Database
  databaseUrl: process.env.DATABASE_URL || "",

  // Scraping
  proxyUrl: process.env.PROXY_URL || "", // e.g. http://user:pass@host:port
  timeMultiplier: int(process.env.TIME_MULTIPLIER, 1),
  maxResultsLimit: int(process.env.MAX_RESULTS_LIMIT, 50),

  // External APIs (Tier C)
  serpApiKey: process.env.SERPAPI_KEY || "",

  // Rate limit
  rateLimitMax: int(process.env.RATE_LIMIT_MAX, 60),
  rateLimitWindow: process.env.RATE_LIMIT_WINDOW || "1 minute",

  // Toggles
  authDisabled: bool(process.env.AUTH_DISABLED, false),
};

export default config;
