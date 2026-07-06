import { runSearch, runDetails, runOtaPrice, runList, runRooms, runCategoryRatings } from "../../core/searchService.js";
import { listProviders } from "../../adapters/index.js";

const searchQuerySchema = {
  type: "object",
  required: ["provider"],
  properties: {
    provider: { type: "string" },
    location: { type: "string" },
    checkIn: { type: "string" }, // "MM/DD/YYYY"
    checkOut: { type: "string" },
    adults: { type: "integer", minimum: 1 },
    children: { type: "integer", minimum: 0 },
    rooms: { type: "integer", minimum: 1 },
    currency: { type: "string" },
    limit: { type: "integer", minimum: 1 },
    travelPurpose: { type: "string", enum: ["leisure", "business"] },
    category: { type: "string" }, // airbnb
    country: { type: "string" }, // hotels.com
    language: { type: "string" }, // hotels.com
    priceFrom: { type: "number" },
    priceTo: { type: "number" },
    filters: { type: "string" }, // comma-separated, parsed below
    includeRaw: { type: "boolean" },
  },
};

function parseParams(q) {
  const p = { ...q };
  if (typeof p.filters === "string") p.filters = p.filters.split(",").map((s) => s.trim()).filter(Boolean);
  return p;
}

export default async function searchRoutes(app) {
  app.get("/providers", async () => ({ providers: listProviders() }));

  // OTA narx agregatori — provider bo'yicha (googleHotels = barcha OTA bitta
  // skreypda; ostrovok = MDH OTA). Bitta mehmonxonaning narxlari.
  app.get(
    "/ota-price",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["name"],
          properties: {
            provider: { type: "string" },
            name: { type: "string" },
            city: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        return await runOtaPrice({
          provider: req.query.provider || "googleHotels",
          params: { name: req.query.name, city: req.query.city || "" },
          apiKey: req.apiKey,
        });
      } catch (e) {
        req.log.error(e);
        return reply.code(e.statusCode || 502).send({ error: e.message });
      }
    },
  );

  // Google Hotels RO'YXATi — bitta skreypда hudud bo'yicha BARCHA mehmonxona
  // (raqib) narxlari. `query` = hudud/qidiruv (mas "Bukhara").
  app.get(
    "/list-prices",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["query"],
          properties: {
            provider: { type: "string" },
            query: { type: "string" },
            city: { type: "string" },
            limit: { type: "integer", minimum: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        return await runList({
          provider: req.query.provider || "googleHotels",
          params: { query: req.query.query, city: req.query.city || "", limit: req.query.limit },
          apiKey: req.apiKey,
        });
      } catch (e) {
        req.log.error(e);
        return reply.code(e.statusCode || 502).send({ error: e.message });
      }
    },
  );

  app.get("/search", { schema: { querystring: searchQuerySchema } }, async (req, reply) => {
    const { provider, ...rest } = req.query;
    const params = parseParams(rest);
    try {
      const out = await runSearch({ provider, params, apiKey: req.apiKey });
      return out;
    } catch (e) {
      req.log.error(e);
      return reply.code(e.statusCode || 502).send({ error: e.message, provider });
    }
  });

  // Xona turlari — property link bo'yicha (#hprt-table). Hozircha faqat booking.
  app.get(
    "/rooms",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["provider"],
          properties: {
            provider: { type: "string" },
            link: { type: "string" },
            name: { type: "string" },
            city: { type: "string" },
            checkIn: { type: "string" },
            checkOut: { type: "string" },
            adults: { type: "integer", minimum: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const { provider, ...params } = req.query;
      try {
        return await runRooms({ provider, params, apiKey: req.apiKey });
      } catch (e) {
        req.log.error(e);
        return reply.code(e.statusCode || 502).send({ error: e.message, provider });
      }
    }
  );

  // Kategoriya reytinglari — property link bo'yicha (Booking subscore'lari).
  app.get(
    "/category-ratings",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["provider", "link"],
          properties: { provider: { type: "string" }, link: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const { provider, ...params } = req.query;
      try {
        return await runCategoryRatings({ provider, params, apiKey: req.apiKey });
      } catch (e) {
        req.log.error(e);
        return reply.code(e.statusCode || 502).send({ error: e.message, provider });
      }
    },
  );

  app.get(
    "/hotel",
    {
      schema: {
        querystring: {
          type: "object",
          required: ["provider", "link"],
          properties: {
            provider: { type: "string" },
            link: { type: "string" },
            reviewsLimit: { type: "integer", minimum: 0 },
            currency: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { provider, ...params } = req.query;
      try {
        return await runDetails({ provider, params, apiKey: req.apiKey });
      } catch (e) {
        req.log.error(e);
        return reply.code(e.statusCode || 502).send({ error: e.message, provider });
      }
    }
  );
}
