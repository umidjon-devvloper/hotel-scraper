/**
 * Unified Hotel schema shared across every provider.
 * Each adapter must map its raw output into this shape via `normalizeHotel`.
 *
 * @typedef {Object} Hotel
 * @property {string} provider        - e.g. "booking", "expedia", "agoda"
 * @property {string|null} providerId - stable id/slug derived from the link
 * @property {string} title
 * @property {string|null} thumbnail
 * @property {number|null} stars
 * @property {{address?: string|null, lat?: number|null, lng?: number|null, distanceFromCenter?: number|null}} location
 * @property {{currency: string, value: number, taxesAndCharges?: number|null, total?: number|null}|null} price
 * @property {{score: number|null, reviews: number|null, description?: string|null}} rating
 * @property {string[]} badges
 * @property {string[]} highlights
 * @property {string} link
 * @property {Object} [raw] - original provider payload (debug only)
 */

const toNum = (v) => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.,-]/g, "").replace(",", ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Normalize a single hotel record from any adapter into the unified shape.
 * @param {string} provider
 * @param {Object} h - partial hotel data
 * @param {boolean} includeRaw
 * @returns {Hotel}
 */
export function normalizeHotel(provider, h, includeRaw = false) {
  const price = h.price
    ? {
        currency: h.price.currency ?? null,
        value: toNum(h.price.value),
        taxesAndCharges: toNum(h.price.taxesAndCharges) ?? null,
        total: toNum(h.price.total) ?? null,
      }
    : null;

  const out = {
    provider,
    providerId: h.providerId ?? null,
    title: h.title ?? null,
    thumbnail: h.thumbnail ?? null,
    stars: toNum(h.stars),
    location: {
      address: h.location?.address ?? (typeof h.location === "string" ? h.location : null),
      lat: h.location?.lat ?? null,
      lng: h.location?.lng ?? null,
      distanceFromCenter: toNum(h.location?.distanceFromCenter),
    },
    price,
    rating: {
      score: toNum(h.rating?.score),
      reviews: toNum(h.rating?.reviews),
      description: h.rating?.description ?? h.rating?.scoreDescription ?? null,
    },
    badges: Array.isArray(h.badges) ? h.badges.filter(Boolean) : [],
    highlights: Array.isArray(h.highlights) ? h.highlights.filter(Boolean) : [],
    link: h.link ?? null,
  };
  if (includeRaw) out.raw = h.raw ?? h;
  return out;
}

/** Normalize a list of hotels. */
export function normalizeHotels(provider, list, includeRaw = false) {
  return (list || []).map((h) => normalizeHotel(provider, h, includeRaw));
}
