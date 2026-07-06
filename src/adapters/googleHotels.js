import getGoogleHotelPrices from "../../googleHotelsParser/getGoogleHotelPrices.js";
import getGoogleHotelsList from "../../googleHotelsParser/getGoogleHotelsList.js";
import config from "../config.js";

/**
 * Google Hotels adapter — Tier B (narx agregatori).
 * Bitta skreypda Booking.com, Agoda, Expedia, Hotels.com, Trip.com, Priceline,
 * Vio.com va boshqa OTA'larning narxlarini qaytaradi.
 *
 * Boshqa adapterlardan farqi: bu `search`/`details` emas, `prices` metodini beradi —
 * chunki natija mehmonxonalar ro'yxati emas, bitta mehmonxonaning OTA narxlari.
 */
const googleHotels = {
  name: "googleHotels",
  tier: "B",
  status: "working",
  mode: "scrape",

  /** @param {{name:string, city?:string}} p */
  async prices(p = {}) {
    const name = p.name || p.location || "";
    if (!name) throw new Error("`name` is required for googleHotels prices");
    return getGoogleHotelPrices(config.timeMultiplier, name, p.city || "");
  },

  /** Ro'yxat: bitta skreypда hudud bo'yicha BARCHA mehmonxona (raqib) narxlari.
   *  @param {{query?:string, location?:string, city?:string, limit?:number}} p */
  async listPrices(p = {}) {
    const query = p.query || p.location || p.city || "";
    if (!query) throw new Error("`query` (yoki `location`/`city`) kerak — googleHotels ro'yxat");
    const limit = Math.min(Number(p.limit) || 25, config.maxResultsLimit);
    return getGoogleHotelsList(config.timeMultiplier, query, p.city || "", limit);
  },
};

export default googleHotels;
