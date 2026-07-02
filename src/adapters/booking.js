import getBookingHotels from "../../bookingParser/getBookingHotels.js";
import getBookingHotelInfo from "../../bookingParser/getBookingHotelInfo.js";
import getBookingFilters from "../../bookingParser/getBookingFilters.js";
import getBookingRooms from "../../bookingParser/getBookingRooms.js";
import getBookingCategoryRatings from "../../bookingParser/getBookingCategoryRatings.js";
import { normalizeHotels } from "../core/schema.js";
import config from "../config.js";

const providerIdFromLink = (link) => {
  const m = /\/hotel\/[a-z]{2}\/([^.?/]+)/i.exec(link || "");
  return m ? m[1] : null;
};

/**
 * Booking.com adapter — Tier A (self-scrape, currently working).
 */
const booking = {
  name: "booking",
  tier: "A",
  status: "working",
  mode: "scrape",

  /** @param {Object} p search params */
  async search(p = {}) {
    const limit = Math.min(p.limit || 35, config.maxResultsLimit);
    const raw = await getBookingHotels(
      config.timeMultiplier,
      p.filters,
      p.currency,
      limit,
      p.location,
      p.checkIn,
      p.checkOut,
      p.adults,
      p.children,
      p.rooms,
      p.travelPurpose
    );
    const mapped = raw.map((h) => {
      const badges = [];
      if (h.preferredBadge) badges.push("preferred");
      if (h.promotedBadge) badges.push("promoted");
      if (h.subwayAccess) badges.push("subway-access");
      if (h.sustainability) badges.push(h.sustainability);
      return {
        ...h,
        providerId: providerIdFromLink(h.link),
        location: { address: h.location, distanceFromCenter: h.distanceFromCenter },
        badges,
        raw: h,
      };
    });
    return normalizeHotels("booking", mapped, p.includeRaw);
  },

  async details(p = {}) {
    if (!p.link) throw new Error("`link` is required for hotel details");
    return getBookingHotelInfo(config.timeMultiplier, p.link, p.reviewsLimit);
  },

  /** Xona turlari + narxlari (property sahifasidagi `#hprt-table`). `link` YOKI
   *  `name`+`city`+sanalar — nom berilsa skreyperning o'zi property URL'ni topadi. */
  async rooms(p = {}) {
    if (!p.link && !p.name) throw new Error("`link` yoki `name` kerak (room types)");
    return getBookingRooms(config.timeMultiplier, {
      link: p.link,
      name: p.name,
      city: p.city,
      checkIn: p.checkIn,
      checkOut: p.checkOut,
      adults: p.adults ? Number(p.adults) : 2,
    });
  },

  /** Kategoriya reytinglari (Staff, Cleanliness, Location, …) — property `link` bo'yicha. */
  async categoryRatings(p = {}) {
    if (!p.link) throw new Error("`link` is required for category ratings");
    return getBookingCategoryRatings(config.timeMultiplier, p.link);
  },

  filters() {
    return getBookingFilters();
  },
};

export default booking;
