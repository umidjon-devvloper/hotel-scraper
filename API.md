# Hotels Aggregator API

Production REST API over the hotel scrapers. Hybrid: self-scrape (Booking working; Airbnb/Hotels.com need selector fixes) + external APIs planned for hard channels. See [ARCHITECTURE_PLAN.md](ARCHITECTURE_PLAN.md).

## Run locally

```bash
cp .env.example .env        # set AUTH_DISABLED=true for quick local testing
npm install
npm run dev                 # http://localhost:3000
```

With Postgres (optional): set `DATABASE_URL`, then `npm run migrate`.
With Redis (optional): set `REDIS_URL`. Both degrade gracefully when unset.

## Auth

Every `/v1/*` request needs an API key header (unless `AUTH_DISABLED=true`):

```
x-api-key: <your-key>
```

Keys come from `API_KEYS` (env, comma-separated) or the `api_keys` Postgres table.

## Endpoints

### `GET /health`  (public)
Liveness + dependency status.
```json
{ "status": "ok", "uptime": 16, "db": "ok", "cache": "ok" }
```

### `GET /v1/providers`
Lists providers with tier/status.
```json
{ "providers": [ { "name": "booking", "tier": "A", "status": "working", "mode": "scrape" } ] }
```

### `GET /v1/search`
Search hotels. Results are normalized to the unified `Hotel` schema and cached.

| param | type | notes |
|-------|------|-------|
| `provider` | string | **required** — `booking` \| `airbnb` \| `hotelsCom` |
| `location` | string | e.g. `Paris` |
| `checkIn` / `checkOut` | string | `MM/DD/YYYY` |
| `adults` / `children` / `rooms` | int | |
| `currency` | string | e.g. `USD` |
| `limit` | int | capped by `MAX_RESULTS_LIMIT` |
| `filters` | string | comma-separated provider filter codes |
| `travelPurpose` | string | booking: `leisure` \| `business` |
| `category` | string | airbnb only |
| `country` / `language` / `priceFrom` / `priceTo` | | hotels.com only |
| `includeRaw` | bool | include original payload (debug) |

```bash
curl "http://localhost:3000/v1/search?provider=booking&location=Paris&limit=5" \
  -H "x-api-key: dev-key-123"
```

Response:
```json
{
  "provider": "booking",
  "count": 5,
  "cached": false,
  "durationMs": 11648,
  "results": [ { "provider": "booking", "providerId": "...", "title": "...", "price": {...}, "rating": {...}, "link": "..." } ]
}
```

### `GET /v1/hotel`
Hotel details for one link.
```bash
curl "http://localhost:3000/v1/hotel?provider=booking&link=https://www.booking.com/hotel/fr/...html" \
  -H "x-api-key: dev-key-123"
```

## Deploy to Railway

1. Push this repo to GitHub → **New Project → Deploy from repo**. Railway uses the `Dockerfile` automatically.
2. Add a **Redis** and a **Postgres** database to the project (Railway injects `REDIS_URL` / `DATABASE_URL`).
3. Set variables: `API_KEYS`, `NODE_ENV=production`, optional `PROXY_URL`, `SERPAPI_KEY`.
4. Run the migration once: in the service shell → `npm run migrate`.
5. ⚠️ Railway IPs are datacenter IPs — set `PROXY_URL` (residential proxy) for reliable scraping.

## Project layout

```
src/
  config.js              env config
  index.js               entry (starts Fastify)
  core/
    schema.js            unified Hotel schema + normalizer
    searchService.js     cache → adapter → log pipeline
  adapters/              one file per provider (registry in index.js)
  api/                   server, auth, rate-limit, routes
  cache/redis.js         Redis cache (graceful fallback)
  db/                    schema.sql, pool, migrate, queries
bookingParser/ airbnbParser/ hotelsComParser/   original scrapers (used by adapters)
```
