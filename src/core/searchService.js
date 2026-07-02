import pLimit from "p-limit";
import { getAdapter } from "../adapters/index.js";
import { cacheKey, cacheGet, cacheSet } from "../cache/redis.js";
import { logSearch } from "../db/queries.js";

// Limit concurrent browser-heavy jobs so we don't OOM the worker container.
const limit = pLimit(Number(process.env.SCRAPE_CONCURRENCY) || 2);

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

/**
 * Run a search through the cache → adapter pipeline, with logging.
 * @returns {{provider, count, cached, durationMs, results}}
 */
export async function runSearch({ provider, params, apiKey }) {
  const adapter = getAdapter(provider);
  if (!adapter) {
    const err = new Error(`Unknown provider "${provider}"`);
    err.statusCode = 400;
    throw err;
  }

  const key = cacheKey(`search:${provider}`, params);
  const cached = await cacheGet(key);
  if (cached) {
    logSearch({
      apiKey,
      provider,
      endpoint: "search",
      location: params.location,
      params,
      resultCount: cached.length,
      cacheHit: true,
      durationMs: 0,
      status: "ok",
    });
    return { provider, count: cached.length, cached: true, durationMs: 0, results: cached };
  }

  const start = nowMs();
  try {
    const results = await limit(() => adapter.search(params));
    const durationMs = nowMs() - start;
    await cacheSet(key, results);
    logSearch({
      apiKey,
      provider,
      endpoint: "search",
      location: params.location,
      params,
      resultCount: results.length,
      cacheHit: false,
      durationMs,
      status: "ok",
    });
    return { provider, count: results.length, cached: false, durationMs, results };
  } catch (e) {
    logSearch({
      apiKey,
      provider,
      endpoint: "search",
      location: params.location,
      params,
      cacheHit: false,
      durationMs: nowMs() - start,
      status: "error",
      error: e.message,
    });
    throw e;
  }
}

/**
 * OTA narx agregatori — bitta mehmonxona uchun OTA narxlari. `provider` adapteri
 * `.prices(params)` metodini berishi kerak (googleHotels, ostrovok, …).
 * Cache → adapter → log quvuri orqali.
 * @returns {{cached, matchedName, offers, rating, reviews}}
 */
export async function runOtaPrice({ provider = "googleHotels", params, apiKey }) {
  const adapter = getAdapter(provider);
  if (!adapter || typeof adapter.prices !== "function") {
    const err = new Error(`"${provider}" narx adapteri mavjud emas`);
    err.statusCode = 400;
    throw err;
  }
  const key = cacheKey(`prices:${provider}`, params);
  const cached = await cacheGet(key);
  if (cached) return { cached: true, ...cached };

  const start = nowMs();
  try {
    const result = await limit(() => adapter.prices(params));
    // Bo'sh natijani keshlamaymiz — transient xato qotib qolmasligi uchun.
    if (result.offers?.length) await cacheSet(key, result);
    logSearch({
      apiKey, provider, endpoint: "ota-price",
      location: params.name, params, resultCount: result.offers?.length || 0,
      cacheHit: false, durationMs: nowMs() - start, status: "ok",
    });
    return { cached: false, ...result };
  } catch (e) {
    logSearch({
      apiKey, provider, endpoint: "ota-price",
      location: params.name, params, cacheHit: false,
      durationMs: nowMs() - start, status: "error", error: e.message,
    });
    throw e;
  }
}

/**
 * Xona turlari — bitta property link uchun xona narx jadvali. `provider`
 * adapteri `.rooms(params)` metodini berishi kerak (hozircha faqat booking).
 * Cache → adapter → log quvuri orqali.
 * @returns {{provider, cached, result:{link, currency, rooms, minPrice}}}
 */
export async function runRooms({ provider, params, apiKey }) {
  const adapter = getAdapter(provider);
  if (!adapter || typeof adapter.rooms !== "function") {
    const err = new Error(`"${provider}" uchun xona adapteri mavjud emas`);
    err.statusCode = 400;
    throw err;
  }
  const key = cacheKey(`rooms:${provider}`, params);
  const cached = await cacheGet(key);
  if (cached) return { provider, cached: true, result: cached };

  const start = nowMs();
  try {
    const result = await limit(() => adapter.rooms(params));
    // Bo'sh natijani KESHLAMAYMIZ — transient skreyp xatosi (Booking sekin/blok)
    // 30 daqiqa qotib qolmasligi uchun. Faqat xona topilsa keshlaymiz.
    if (result.rooms?.length) await cacheSet(key, result);
    logSearch({
      apiKey, provider, endpoint: "rooms",
      params, resultCount: result.rooms?.length || 0,
      cacheHit: false, durationMs: nowMs() - start, status: "ok",
    });
    return { provider, cached: false, result };
  } catch (e) {
    logSearch({
      apiKey, provider, endpoint: "rooms",
      params, cacheHit: false,
      durationMs: nowMs() - start, status: "error", error: e.message,
    });
    throw e;
  }
}

/**
 * Kategoriya reytinglari — property link bo'yicha (Booking subscore'lari).
 * @returns {{provider, cached, result:{overall, scores}}}
 */
export async function runCategoryRatings({ provider, params, apiKey }) {
  const adapter = getAdapter(provider);
  if (!adapter || typeof adapter.categoryRatings !== "function") {
    const err = new Error(`"${provider}" uchun kategoriya reyting adapteri yo'q`);
    err.statusCode = 400;
    throw err;
  }
  const key = cacheKey(`catratings:${provider}`, params);
  const cached = await cacheGet(key);
  if (cached) return { provider, cached: true, result: cached };

  const start = nowMs();
  try {
    const result = await limit(() => adapter.categoryRatings(params));
    // Bo'sh natijani keshlamaymiz (transient xato qotib qolmasin).
    if (result.scores && Object.keys(result.scores).length) await cacheSet(key, result);
    logSearch({
      apiKey, provider, endpoint: "category-ratings", params,
      resultCount: Object.keys(result.scores || {}).length,
      cacheHit: false, durationMs: nowMs() - start, status: "ok",
    });
    return { provider, cached: false, result };
  } catch (e) {
    logSearch({
      apiKey, provider, endpoint: "category-ratings", params,
      cacheHit: false, durationMs: nowMs() - start, status: "error", error: e.message,
    });
    throw e;
  }
}

/** Fetch hotel details for a single provider link. */
export async function runDetails({ provider, params, apiKey }) {
  const adapter = getAdapter(provider);
  if (!adapter) {
    const err = new Error(`Unknown provider "${provider}"`);
    err.statusCode = 400;
    throw err;
  }
  const key = cacheKey(`details:${provider}`, params);
  const cached = await cacheGet(key);
  if (cached) return { provider, cached: true, result: cached };

  const start = nowMs();
  try {
    const result = await limit(() => adapter.details(params));
    await cacheSet(key, result);
    logSearch({
      apiKey,
      provider,
      endpoint: "details",
      params,
      cacheHit: false,
      durationMs: nowMs() - start,
      status: "ok",
    });
    return { provider, cached: false, result };
  } catch (e) {
    logSearch({
      apiKey,
      provider,
      endpoint: "details",
      params,
      cacheHit: false,
      durationMs: nowMs() - start,
      status: "error",
      error: e.message,
    });
    throw e;
  }
}
