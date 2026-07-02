-- Hotels Aggregator API — Postgres schema
-- Run with: npm run migrate

CREATE TABLE IF NOT EXISTS api_keys (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  name        TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit  INTEGER NOT NULL DEFAULT 60,      -- requests per minute
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS search_logs (
  id            BIGSERIAL PRIMARY KEY,
  api_key       TEXT,
  provider      TEXT NOT NULL,
  endpoint      TEXT NOT NULL,                  -- 'search' | 'details'
  location      TEXT,
  params        JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_count  INTEGER,
  cache_hit     BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms   INTEGER,
  status        TEXT NOT NULL DEFAULT 'ok',     -- 'ok' | 'error'
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_logs_created  ON search_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_logs_apikey   ON search_logs (api_key);
CREATE INDEX IF NOT EXISTS idx_search_logs_provider ON search_logs (provider);

-- Daily usage rollup (per api key / provider)
CREATE OR REPLACE VIEW usage_daily AS
SELECT
  date_trunc('day', created_at) AS day,
  api_key,
  provider,
  count(*)                              AS requests,
  count(*) FILTER (WHERE cache_hit)     AS cache_hits,
  count(*) FILTER (WHERE status='error') AS errors,
  round(avg(duration_ms))              AS avg_duration_ms
FROM search_logs
GROUP BY 1, 2, 3
ORDER BY 1 DESC;
