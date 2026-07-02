import getHotelsComHotels from "../../hotelsComParser/getHotelsComHotels.js";
import getHotelsComHotelInfo from "../../hotelsComParser/getHotelsComHotelInfo.js";
import getHotelsComFilters from "../../hotelsComParser/getHotelsComFilters.js";
import { normalizeHotels } from "../core/schema.js";
import config from "../config.js";

/**
 * Hotels.com adapter — Tier A, but selectors are currently BROKEN (site changed).
 * Shares the Expedia Group engine; a future Expedia adapter can reuse the fix.
 */
const hotelsCom = {
  name: "hotelsCom",
  tier: "A",
  status: "broken", // selectors need rewrite
  mode: "scrape",

  async search(p = {}) {
    const limit = Math.min(p.limit || 20, config.maxResultsLimit);
    const raw = await getHotelsComHotels(
      config.timeMultiplier,
      p.filters,
      p.priceFrom,
      p.priceTo,
      p.country,
      p.language,
      limit,
      p.location,
      p.checkIn,
      p.checkOut,
      p.adults,
      p.children
    );
    return normalizeHotels("hotelsCom", raw, p.includeRaw);
  },

  async details(p = {}) {
    if (!p.link) throw new Error("`link` is required for hotel details");
    return getHotelsComHotelInfo(config.timeMultiplier, p.link, p.reviewsLimit);
  },

  filters() {
    return getHotelsComFilters();
  },
};

export default hotelsCom;
