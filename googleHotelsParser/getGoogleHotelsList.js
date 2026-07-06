import { getBrowserInstance, safeGoto } from "../helpers/browserInstance.cjs";

/**
 * GOOGLE HOTELS RO'YXAT SKREYPERI — bitta skreypда bir hudud/qidiruv bo'yicha
 * BARCHA mehmonxonalarni (raqiblarni) narxi bilan qaytaradi.
 *
 * getGoogleHotelPrices bitta mehmonxonaning OTA narxlarini beradi; bu esa Google
 * Hotels QIDIRUV RO'YXATini (ko'plab mehmonxona) skreyp qiladi — raqib narxlarini
 * tez yig'ish uchun. Klasslar (Google obfuskatsiyasi) o'rniga `a[href*="/travel/"]`
 * elementlarning ARIA-LABEL matnini parse qilamiz — u `hl=en` da barqaror:
 *   "Prices starting from $35, Nabibek Teracce"
 *   "4.4 out of 5 stars from 64 reviews, Nabibek Teracce"
 *
 * @param {number} multiplier  sekin internet vaqt ko'paytirgichi
 * @param {string} query       hudud/qidiruv (mas: "Bukhara" yoki "hotels near Lyabi Hauz")
 * @param {string} city        shahar (qidiruvga qo'shiladi, agar query'da yo'q bo'lsa)
 * @param {number} limit       maksimal mehmonxona soni (default 25)
 * @returns {Promise<{query, matchedList, count, hotels: Array<{name, price, currency, rating, reviews}>}>}
 */
const getGoogleHotelsList = async (multiplier = 1, query, city = "", limit = 25) => {
  const qLow = String(query).toLowerCase();
  const cityLow = String(city).toLowerCase().trim();
  const q = (!cityLow || qLow.includes(cityLow)) ? query : `${query} ${city}`;
  const url =
    "https://www.google.com/travel/search?q=" + encodeURIComponent(q.trim()) + "&curr=USD&hl=en&gl=us";

  const { page, closeBrowser } = await getBrowserInstance();
  const result = { query: q, matchedList: false, count: 0, hotels: [] };

  const countCards = () =>
    page.evaluate(() =>
      new Set(
        [...document.querySelectorAll('a[href*="/travel/"]')]
          .map((a) => a.getAttribute("aria-label") || "")
          .filter((s) => /^Prices? starting from/i.test(s))
          .map((s) => s.replace(/^.*?,\s*/, "")),
      ).size,
    );

  try {
    await safeGoto(page, url, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Ro'yxat kartalari yuklanishini kutamiz (narx/reyting aria'lari paydo bo'lsin).
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('a[href*="/travel/"]')].some((a) =>
            /prices? starting from|out of 5 stars/i.test(a.getAttribute("aria-label") || ""),
          ),
        { timeout: 9000 * multiplier, polling: 300 },
      )
      .catch(() => {});

    // "Show more" bilan qo'shimcha mehmonxona yuklaymiz (limit yetguncha).
    for (let i = 0; i < 6; i++) {
      if ((await countCards()) >= limit) break;
      const clicked = await page.evaluate(() => {
        const more = [...document.querySelectorAll('button, [role="button"], a, span')].find((b) =>
          /^\s*(show more|more results|view more results?|load more)\s*$/i.test(b.textContent || ""),
        );
        if (more) {
          more.scrollIntoView();
          more.click();
          return true;
        }
        // "Show more" bo'lmasa — pastga scroll qilib lazy-load'ni qo'zg'atamiz.
        window.scrollBy(0, document.body.scrollHeight);
        return false;
      });
      await page.waitForTimeout((clicked ? 1600 : 1000) * multiplier);
    }

    const rawHotels = await page.evaluate(() => {
      const byName = new Map();
      // Aksiya matni nomga yopishadi: "ZARDOZON HOTEL DEAL 20% less than usual"
      // → "ZARDOZON HOTEL". Tozalab, aksiyali va oddiy yozuvni bitta qilib birlashtiramiz.
      const clean = (name) => String(name).replace(/\s+DEAL\b.*$/i, "").replace(/\s+/g, " ").trim();
      const ensure = (raw) => {
        const name = clean(raw);
        if (!byName.has(name)) byName.set(name, { name, priceRaw: null, rating: null, reviews: null });
        return byName.get(name);
      };
      for (const a of document.querySelectorAll('a[href*="/travel/"]')) {
        const aria = (a.getAttribute("aria-label") || "").trim();
        let m;
        // "Prices starting from $35, <name>"  (narxда vergul bo'lishi mumkin: $1,035)
        if ((m = aria.match(/^Prices? starting from\s+(.+),\s*(.+)$/i))) {
          const h = ensure(m[2].trim());
          if (!h.priceRaw) h.priceRaw = m[1].trim();
        }
        // "4.4 out of 5 stars from 64 reviews, <name>"  (reviews ixtiyoriy)
        else if ((m = aria.match(/^([\d.]+)\s+out of 5 stars.*?,\s*(.+)$/i))) {
          const h = ensure(m[2].trim());
          if (h.rating == null) h.rating = parseFloat(m[1]);
          const rev = aria.match(/from\s+([\d,]+)\s+reviews/i);
          if (rev && h.reviews == null) h.reviews = parseInt(rev[1].replace(/,/g, ""), 10);
        }
      }
      return [...byName.values()];
    });

    // Narx + valyutani Node tomonда ishonchli parse qilamiz.
    const parseNum = (s) => {
      let v = String(s).replace(/[^\d.,]/g, "");
      const ld = v.lastIndexOf("."), lc = v.lastIndexOf(",");
      if (ld > -1 && lc > -1) {
        const dec = ld > lc ? "." : ",";
        v = v.replace(new RegExp(dec === "." ? "," : "\\.", "g"), "").replace(dec, ".");
      } else if (lc > -1) {
        const p = v.split(",");
        v = p[p.length - 1].length === 3 ? v.replace(/,/g, "") : v.replace(",", ".");
      }
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const detectCur = (s) => {
      if (/US\$|USD|\$/i.test(s)) return "USD";
      if (/€|EUR/i.test(s)) return "EUR";
      if (/£|GBP/i.test(s)) return "GBP";
      if (/₽|RUB|руб/i.test(s)) return "RUB";
      if (/UZS|сум|so'?m/i.test(s)) return "UZS";
      return "USD";
    };

    result.hotels = rawHotels
      .filter((h) => h.name && h.name.length > 1)
      .map((h) => ({
        name: h.name,
        price: h.priceRaw ? parseNum(h.priceRaw) : null,
        currency: h.priceRaw ? detectCur(h.priceRaw) : null,
        rating: h.rating ?? null,
        reviews: h.reviews ?? null,
      }))
      .slice(0, limit);
    result.count = result.hotels.length;
    result.matchedList = result.count > 0;
  } catch (e) {
    console.warn("[googleHotelsList] xato:", e.message);
  } finally {
    await closeBrowser();
  }

  return result;
};

export default getGoogleHotelsList;
