import { getBrowserInstance } from "../helpers/browserInstance.cjs";

/**
 * GOOGLE HOTELS NARX AGREGATORI — bitta skreypda BARCHA OTA narxlari.
 *
 * Google Hotels (google.com/travel) bitta mehmonxona sahifasida Booking.com,
 * Agoda, Expedia, Hotels.com, Trip.com, Priceline, Vio.com va boshqa OTA'larning
 * narxlarini ko'rsatadi. Shu sahifani skreyp qilib, hammasini bitta so'rovda olamiz.
 *
 * @param {number} multiplier  sekin internet uchun vaqt ko'paytirgichi
 * @param {string} hotelName   mehmonxona nomi
 * @param {string} location    shahar (qidiruvni aniqlashtirish uchun)
 * @returns {Promise<{ hotelName, matchedName, offers: Array<{source, currency, value}>, rating, reviews, currency }>}
 */
const getGoogleHotelPrices = async (multiplier = 1, hotelName, location = "") => {
  // So'rov: shahar nomi allaqachon nomda bo'lsa takrorlamaymiz — ortiqcha takror
  // Google'da ro'yxat chiqaradi (entity emas). Toza so'rov entity sahifasini ochadi.
  const nameLow = String(hotelName).toLowerCase();
  const cityLow = String(location).toLowerCase().trim();
  const query = (!cityLow || nameLow.includes(cityLow)) ? hotelName : `${hotelName} ${location}`;
  const url =
    "https://www.google.com/travel/search?q=" +
    encodeURIComponent(query.trim()) +
    "&curr=USD&hl=en&gl=us";

  const { page, closeBrowser } = await getBrowserInstance();
  const result = { hotelName, matchedName: "", offers: [], rating: null, reviews: null, currency: null };

  // Sahifadan OTA takliflarini ajratib oluvchi (qayta-qayta chaqiriladi — polling).
  const extractOffers = () =>
    page.evaluate(() => {
      const OTA_MAP = [
        ["booking.com", "Booking.com"], ["agoda", "Agoda"], ["expedia", "Expedia"],
        ["hotels.com", "Hotels.com"], ["trip.com", "Trip.com"], ["priceline", "Priceline"],
        ["vio.com", "Vio.com"], ["edreams", "eDreams"], ["zenhotels", "ZenHotels"],
        ["travala", "Travala"], ["hotellook", "Hotellook"], ["algotels", "Algotels"],
        ["mytrip", "MyTrip"], ["super.com", "Super.com"], ["amoma", "Amoma"],
        ["destinia", "Destinia"], ["officialsite", "Official site"],
      ];
      const found = new Map();
      const els = document.querySelectorAll("a, div, li, span");
      for (const el of els) {
        const txt = (el.innerText || "").trim();
        if (!txt || txt.length > 90) continue;
        const low = txt.toLowerCase();
        const hit = OTA_MAP.find(([k]) => low.includes(k));
        if (!hit) continue;
        const m = txt.match(/(UZS|US\$|USD|RUB|EUR|GBP|\$|€|£|₽|₸|so['m]?m)\s?([\d][\d.,\s]{1,})/i);
        if (!m) continue;
        if (!found.has(hit[1])) {
          found.set(hit[1], { source: hit[1], currencyRaw: m[1], valueStr: m[2].trim() });
        }
      }
      return [...found.values()];
    });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3500 * multiplier);

    // Natijalar RO'YXATi chiqsa — birinchi mehmonxona kartasini ochamiz.
    const hasPrices = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"], button, a')].some((e) => /^prices$/i.test(e.textContent.trim())),
    );
    if (!hasPrices) {
      await page.evaluate(() => {
        const card = [...document.querySelectorAll('[role="link"], a[href*="/travel/"]')]
          .find((el) => {
            const al = el.getAttribute("aria-label") || el.textContent || "";
            return al.length > 6 && al.length < 80 && /hotel|guest|inn|house|resort|\$|UZS/i.test(al);
          });
        if (card) card.click();
      });
      await page.waitForTimeout(3500 * multiplier);
    }

    // "Prices" tabini bosamiz — barcha OTA takliflari shu yerda yuklanadi.
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('[role="tab"], button, a')].find((e) => /^prices$/i.test(e.textContent.trim()));
      if (tab) tab.click();
    });

    // Reyting + sharhlar soni
    const meta = await page.evaluate(() => {
      const txt = document.body.innerText || "";
      const r = txt.match(/\b([0-9]\.[0-9])\b\s*\(([\d.,Kk]+)\)/);
      return r ? { rating: parseFloat(r[1]), reviewsStr: r[2] } : { rating: null, reviewsStr: null };
    });
    if (meta.rating) result.rating = meta.rating;
    if (meta.reviewsStr) {
      const s = String(meta.reviewsStr).toLowerCase().replace(/,/g, "");
      result.reviews = s.includes("k") ? Math.round(parseFloat(s) * 1000) : parseInt(s) || null;
    }

    // Takliflar ASYNC yuklanadi — paydo bo'lguncha pollaymiz (~12s gacha).
    let rawOffers = [];
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(1500 * multiplier);
      rawOffers = await extractOffers();
      if (rawOffers.length >= 2) break;
    }

    // Narxlarni Node tomonida ishonchli parse qilamiz (UZS "3,000,550" / "$70.50").
    const parseNum = (s) => {
      let v = String(s).replace(/[^\d.,]/g, "");
      const lastDot = v.lastIndexOf("."), lastComma = v.lastIndexOf(",");
      if (lastDot > -1 && lastComma > -1) {
        const dec = lastDot > lastComma ? "." : ",";
        v = v.replace(new RegExp(dec === "." ? "," : "\\.", "g"), "").replace(dec, ".");
      } else if (lastComma > -1) {
        const parts = v.split(",");
        v = parts[parts.length - 1].length === 3 ? v.replace(/,/g, "") : v.replace(",", ".");
      }
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const normCur = (c) => {
      const u = String(c).toUpperCase();
      if (u.includes("UZS") || u.includes("SO") || c === "₸") return "UZS";
      if (u.includes("US$") || u.includes("USD") || c === "$") return "USD";
      if (u.includes("RUB") || c === "₽") return "RUB";
      if (u.includes("EUR") || c === "€") return "EUR";
      if (u.includes("GBP") || c === "£") return "GBP";
      return u.replace(/[^A-Z]/g, "") || "USD";
    };

    result.offers = rawOffers
      .map((o) => ({ source: o.source, currency: normCur(o.currencyRaw), value: parseNum(o.valueStr) }))
      .filter((o) => o.value > 0 && o.source !== "Official site");
    result.currency = result.offers[0]?.currency || "USD";
    result.matchedName = await page.title().then((t) => t.replace(/ - Google.*$/i, "").trim()).catch(() => hotelName);
  } catch (e) {
    console.warn("[googleHotels] xato:", e.message);
  } finally {
    await closeBrowser();
  }

  return result;
};

export default getGoogleHotelPrices;
