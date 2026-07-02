import getOstrovokPrice from "../../ostrovokParser/getOstrovokPrice.js";
import config from "../config.js";

/**
 * Ostrovok.ru adapter — Tier B (MDH/O'zbekiston OTA, Google Hotels'da yo'q).
 * `prices` metodi googleHotels bilan bir xil shaklda qaytaradi:
 *   { matchedName, rating, reviews, offers: [{ source, currency, value }] }
 */
const ostrovok = {
  name: "ostrovok",
  tier: "B",
  status: "working",
  mode: "scrape",

  async prices(p = {}) {
    const name = p.name || p.location || "";
    if (!name) throw new Error("`name` is required for ostrovok prices");
    const r = await getOstrovokPrice(config.timeMultiplier, name, p.city || "");
    if (!r) return { matchedName: name, rating: null, reviews: null, offers: [] };
    return {
      matchedName: r.matchedName,
      rating: r.rating,
      reviews: r.reviews,
      offers: [{ source: r.source, currency: r.currency, value: r.value }],
    };
  },
};

export default ostrovok;
