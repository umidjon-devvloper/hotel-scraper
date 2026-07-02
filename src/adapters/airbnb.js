import getAirbnbHotels from "../../airbnbParser/getAirbnbHotels.js";
import getAirbnbHotelInfo from "../../airbnbParser/getHotelInfo.js";
import getAirbnbFilters from "../../airbnbParser/getAirbnbFilters.js";
import { normalizeHotels } from "../core/schema.js";
import config from "../config.js";

/**
 * Airbnb adapter — Tier A, but selectors are currently BROKEN (site changed).
 * Wired up so the rest of the system works; needs a selector rewrite to scrape.
 */
const airbnb = {
  name: "airbnb",
  tier: "A",
  status: "broken", // selectors need rewrite
  mode: "scrape",

  async search(p = {}) {
    const limit = Math.min(p.limit || 20, config.maxResultsLimit);
    const raw = await getAirbnbHotels(
      config.timeMultiplier,
      p.category,
      p.currency,
      limit,
      p.location,
      p.checkIn,
      p.checkOut,
      p.adults,
      p.children
    );
    return normalizeHotels("airbnb", raw, p.includeRaw);
  },

  async details(p = {}) {
    if (!p.link) throw new Error("`link` is required for hotel details");
    return getAirbnbHotelInfo(config.timeMultiplier, p.link, p.currency, p.reviewsLimit);
  },

  filters() {
    return getAirbnbFilters();
  },
};

export default airbnb;
