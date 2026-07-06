import { getBrowserInstance, safeGoto } from "../helpers/browserInstance.cjs";

/**
 * OSTROVOK.RU narx skreyperi — MDH/O'zbekiston uchun kuchli OTA (Google Hotels'da
 * yo'q). Ikki bosqich:
 *   1) Ochiq suggest API (multicomplete.json) — nom bo'yicha mehmonxonani topadi
 *      (master_id + otahotel_id + slug).
 *   2) Mehmonxona sahifasini sana bilan ochib, eng arzon xona narxini oladi
 *      ([data-testid="roomspage-view-price"]). Narx RUB'da keladi — chaqiruvchi
 *      tomonda USD'ga aylantiriladi.
 *
 * @returns {{source, value, currency, matchedName, hotelUrl, rating, reviews}|null}
 */
const DD = (d) => String(d).padStart(2, "0");
const dateStr = (daysAhead) => {
  const d = new Date(Date.now() + daysAhead * 86400000);
  return `${DD(d.getDate())}.${DD(d.getMonth() + 1)}.${d.getFullYear()}`;
};

const norm = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9а-я ]/gi, " ").replace(/\s+/g, " ").trim();

const getOstrovokPrice = async (multiplier = 1, hotelName, city = "") => {
  const { page, closeBrowser } = await getBrowserInstance();
  try {
    // ── 1. Suggest API — mehmonxonani topamiz ───────────────────────────
    const suggestUrl =
      "https://ostrovok.ru/api/site/multicomplete.json?query=" +
      encodeURIComponent(`${hotelName} ${city}`.trim()) + "&lang=en";
    await safeGoto(page, suggestUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    const data = await page.evaluate(() => {
      try { return JSON.parse(document.body.innerText); } catch { return null; }
    });
    const hotels = data?.hotels || [];
    if (!hotels.length) return null;

    // Nom bo'yicha eng mosini tanlaymiz (shahar mos kelsa ustun).
    const qTokens = norm(hotelName).split(" ").filter((t) => t.length >= 3);
    const cityN = norm(city);
    const scored = hotels.map((h) => {
      const nameN = norm(h.hotel_name);
      const matched = qTokens.filter((t) => nameN.includes(t)).length;
      const cityBonus = cityN && norm(h.region_name_en || h.region_name).includes(cityN) ? 1 : 0;
      return { h, score: matched + cityBonus };
    }).sort((a, b) => b.score - a.score);
    const best = scored[0]?.score > 0 ? scored[0].h : hotels[0];

    // ── 2. Mehmonxona sahifasi — eng arzon narx ─────────────────────────
    const slug = best.slug || `${(best.country_name_en || best.country_name || "").toLowerCase()}/${(best.region_name_en || best.region_name || "").toLowerCase()}`;
    const hotelUrl =
      `https://ostrovok.ru/hotel/${slug}/mid${best.master_id}/${best.otahotel_id}/` +
      `?dates=${dateStr(14)}-${dateStr(15)}&guests=2`;

    await safeGoto(page, hotelUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    // Narxlar AJAX bilan yuklanadi — paydo bo'lguncha kutamiz. Toza narx
    // leaf-elementlarini olamiz (faqat "₽ 22,706" ko'rinishidagilar — "View hotels
    // nearby" yoki soliq satrlari emas).
    let priceStrings = [];
    const PRICE_RE = /^(₽|US\$|\$|€|UZS|сум|so'?m)\s?[\d][\d.,\s]*$/i;
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(1800 * multiplier);
      priceStrings = await page.evaluate((reSrc) => {
        const re = new RegExp(reSrc, "i");
        const out = [];
        for (const el of document.querySelectorAll("span, div, b, strong, p")) {
          if (el.children.length !== 0) continue;
          const t = (el.textContent || "").trim();
          if (re.test(t)) out.push(t);
        }
        return out;
      }, PRICE_RE.source);
      if (priceStrings.length) break;
    }

    const meta = await page.evaluate(() => {
      const t = document.body.innerText || "";
      const rev = t.match(/(\d[\d.,]*)\s+reviews/i);
      // Reyting "/10" formatida ishonchli; yakka o'nlik son chalg'ituvchi (narx
      // bilan adashadi), shuning uchun faqat aniq "/10" ni olamiz.
      const rat = t.match(/\b([0-9](?:\.[0-9])?)\s*\/\s*10\b/);
      return { reviewsStr: rev?.[1] || null, ratingStr: rat?.[1] || null };
    });

    // Narx + valyutani parse qilamiz, eng arzonini olamiz.
    const parseNum = (s) => {
      let v = String(s).replace(/[^\d.,]/g, "");
      const ld = v.lastIndexOf("."), lc = v.lastIndexOf(",");
      if (ld > -1 && lc > -1) { const dec = ld > lc ? "." : ","; v = v.replace(new RegExp(dec === "." ? "," : "\\.", "g"), "").replace(dec, "."); }
      else if (lc > -1) { const p = v.split(","); v = p[p.length - 1].length === 3 ? v.replace(/,/g, "") : v.replace(",", "."); }
      const n = parseFloat(v); return Number.isFinite(n) ? n : 0;
    };
    const detectCur = (s) => {
      if (/₽|руб|RUB/i.test(s)) return "RUB";
      if (/US\$|USD|\$/i.test(s)) return "USD";
      if (/€|EUR/i.test(s)) return "EUR";
      if (/UZS|сум|so'?m/i.test(s)) return "UZS";
      return "RUB";
    };
    const values = priceStrings.map((s) => ({ value: parseNum(s), currency: detectCur(s) })).filter((x) => x.value > 0);
    if (!values.length) return null;
    const lowest = values.sort((a, b) => a.value - b.value)[0];

    let reviews = null;
    if (meta.reviewsStr) reviews = parseInt(String(meta.reviewsStr).replace(/[.,]/g, "")) || null;
    let rating = meta.ratingStr ? parseFloat(meta.ratingStr) : null;
    if (rating && rating > 5) rating = Math.round((rating / 2) * 10) / 10; // /10 → /5

    return {
      source: "Ostrovok",
      value: lowest.value,
      currency: lowest.currency,
      matchedName: best.hotel_name,
      hotelUrl,
      rating,
      reviews,
    };
  } catch (e) {
    console.warn("[ostrovok] xato:", e.message);
    return null;
  } finally {
    await closeBrowser();
  }
};

export default getOstrovokPrice;
