import booking from "./booking.js";
import airbnb from "./airbnb.js";
import hotelsCom from "./hotelsCom.js";
import googleHotels from "./googleHotels.js";
import ostrovok from "./ostrovok.js";

/**
 * Provider registry. Add new adapters here.
 * tier:   A = self-scrape (manageable), B = self-scrape + proxy, C = external API
 * status: working | broken | planned
 * mode:   scrape | api
 */
const adapters = {
  booking,
  googleHotels, // narx agregatori — bitta skreypda barcha OTA narxlari
  ostrovok,     // MDH/O'zbekiston OTA (Google Hotels'da yo'q)
  airbnb,
  hotelsCom,
  // Planned (see ARCHITECTURE_PLAN.md):
  // expedia, hostelworld  -> Tier A
  // agoda, trip           -> Tier B (proxy)
};

export function getAdapter(name) {
  return adapters[name] || null;
}

export function listProviders() {
  return Object.values(adapters).map((a) => ({
    name: a.name,
    tier: a.tier,
    status: a.status,
    mode: a.mode,
  }));
}

export default adapters;
