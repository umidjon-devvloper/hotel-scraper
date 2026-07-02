import { getBrowserInstance } from "../helpers/browserInstance.cjs";

/**
 * XONA TURLARI — Booking.com property sahifasidagi xona narx jadvalini (`#hprt-table`)
 * skreyp qiladi. Har bir xona turi uchun ENG ARZON narxni qaytaradi.
 *
 * `link` — property URL (check-in/check-out sanalari bilan, masalan:
 *   https://www.booking.com/hotel/fr/mirific.html?checkin=2026-07-06&checkout=2026-07-07&group_adults=2&selected_currency=USD
 * Sana/valyuta parametrlari bo'lmasa Booking baribir bugun/ertaga va mahalliy
 * valyutani qo'llaydi — chaqiruvchi tomon to'g'ri URL berishi tavsiya etiladi.
 *
 * @param {number} multiplierArgument  sekin internet uchun vaqt ko'paytirgichi
 * @param {string} link                Booking property URL (sanalar bilan)
 * @returns {Promise<{ link, currency, rooms: Array<{name, price, guests}>, minPrice }>}
 */
const getRoomsFromPage = async (page) => {
  return await page.evaluate(() => {
    const detectCurrency = (s) => {
      const u = String(s).toUpperCase();
      if (u.includes("US$") || u.includes("USD") || s.includes("$")) return "USD";
      if (u.includes("EUR") || s.includes("€")) return "EUR";
      if (u.includes("GBP") || s.includes("£")) return "GBP";
      if (u.includes("RUB") || s.includes("₽")) return "RUB";
      if (u.includes("UZS") || u.includes("SO'M") || u.includes("SOM")) return "UZS";
      return "USD";
    };
    // FAQAT bitta toza narx tokenini olamiz (butun matndagi raqamlarni
    // yopishtirib yubormaslik uchun — aks holda "$688,068,806,880" kabi axlat).
    const firstPrice = (s) => {
      const m = String(s).match(/(US\$|USD|\$|€|£|₽)\s?([\d]{1,3}(?:[.,\s]\d{3})*(?:\.\d{1,2})?)/);
      if (!m) return null;
      let num = m[2].replace(/[\s,]/g, ""); // ming ajratgich (vergul/probel) olib tashlanadi
      const val = Math.round(parseFloat(num));
      return val > 0 ? { value: val, currency: detectCurrency(m[1]) } : null;
    };
    // Soliq/yig'im/disclaimer qatorlari xona EMAS — o'tkazib yuboramiz.
    const isJunk = (name) => /tourism fee|tax|vat|excluded|per night|per person|prepayment|cancellation/i.test(name);

    const byRoom = new Map();
    let currency = "USD";
    let currentName = "";
    const rows = document.querySelectorAll("#hprt-table tbody tr");
    for (const tr of rows) {
      // Xona nomi faqat aniq Booking klasslarida (keng selektor tavsifni ham olardi).
      const nameEl = tr.querySelector(".hprt-roomtype-icon-link, .hprt-roomtype-link");
      if (nameEl) {
        let t = nameEl.textContent.trim().replace(/\s+/g, " ");
        // Tavsif (yotoq/o'lcham/amenity) yopishib kelsa — xona TURINI ajratamiz:
        // birinchi " <raqam>" gacha (masalan "Twin Room 2 twin beds…" → "Twin Room").
        const short = t.split(/\s\d/)[0].trim();
        if (short.length >= 4) t = short;
        t = t.slice(0, 50).trim();
        if (t) currentName = t;
      }
      if (!currentName || isJunk(currentName)) continue;

      // Narx ELEMENTI (aniq klasslar) — uning matnidan birinchi narx.
      const priceEl = tr.querySelector(
        ".prco-valign-middle-helper, .bui-price-display__value, .prc-no-css, .hprt-price-price, [data-testid='price-and-discounted-price']",
      );
      if (!priceEl) continue;
      const p = firstPrice(priceEl.textContent || "");
      if (!p) continue;
      currency = p.currency;

      const occEl = tr.querySelector(".hprt-occupancy-occupancy-info, .c-occupancy-icons, .bui-u-sr-only");
      const occText = occEl?.getAttribute("aria-label") || occEl?.textContent || "";
      const occMatch = occText.match(/(\d+)/);
      const guests = occMatch ? parseInt(occMatch[1]) : 2;

      const prev = byRoom.get(currentName);
      if (!prev || p.value < prev.price) {
        byRoom.set(currentName, { name: currentName, price: p.value, guests });
      }
    }

    return { rooms: [...byRoom.values()], currency };
  });
};

// Booking qidiruvidan (nom+shahar) birinchi/eng mos property URL'ni topadi —
// xona jadvalini olishdan oldin. Bitta brauzer sessiyasida (ishonchli; alohida
// keshlangan bo'sh qidiruvga bog'liq emas).
const findPropertyUrl = async (page, name, city, ci, co, adults) => {
  const searchUrl =
    `https://www.booking.com/searchresults.en-us.html?ss=${encodeURIComponent(`${name} ${city}`.trim())}` +
    `&checkin=${ci}&checkout=${co}&group_adults=${adults}&no_rooms=1&selected_currency=USD`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 40000 });
  try {
    await page.waitForSelector('[data-testid="property-card"]', { timeout: 20000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.waitForSelector('[data-testid="property-card"]', { timeout: 20000 });
  }
  return page.evaluate((q) => {
    const tokens = q.toLowerCase().replace(/[^a-z0-9а-я ]/gi, " ").split(/\s+/).filter((t) => t.length >= 3);
    const cards = [...document.querySelectorAll('[data-testid="property-card"]')];
    const score = (card) => {
      const title = (card.querySelector('[data-testid="title"]')?.textContent || "").toLowerCase();
      return tokens.filter((t) => title.includes(t)).length;
    };
    let best = cards[0], bestScore = best ? score(best) : -1;
    for (const c of cards) { const s = score(c); if (s > bestScore) { bestScore = s; best = c; } }
    const href = best?.querySelector("a")?.getAttribute("href");
    return href ? href.split("?")[0] : null;
  }, name);
};

const getBookingRooms = async (multiplierArgument, opts) => {
  const multiplier = multiplierArgument || 1;
  // Orqaga moslik: opts string bo'lsa — bu to'g'ridan-to'g'ri link.
  const o = typeof opts === "string" ? { link: opts } : (opts || {});
  let link = o.link || "";

  const { page, closeBrowser } = await getBrowserInstance();
  const result = { link, currency: "USD", rooms: [], minPrice: 0 };

  try {
    // Link berilmagan, lekin nom bor — avval qidiruvdan property URL topamiz.
    if (!link && o.name) {
      const ci = o.checkIn || "";
      const co = o.checkOut || "";
      const adults = o.adults || 2;
      const base = await findPropertyUrl(page, o.name, o.city || "", ci, co, adults);
      if (!base) { await closeBrowser(); return result; }
      link = `${base}?checkin=${ci}&checkout=${co}&group_adults=${adults}&no_rooms=1&selected_currency=USD&lang=en-us`;
      result.link = base;
    }
    if (!link) { await closeBrowser(); return result; }

    await page.goto(link, { waitUntil: "domcontentloaded" });
    // Xona jadvali kech yuklanishi mumkin — kutamiz, bo'lmasa bo'sh qaytaramiz.
    try {
      await page.waitForSelector("#hprt-table", { timeout: 20000 * multiplier });
    } catch {
      // Reklama/challenge sahifasi yoki band — bir marta qayta urinamiz.
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000 * multiplier);
      try {
        await page.waitForSelector("#hprt-table", { timeout: 20000 * multiplier });
      } catch {
        return result; // xona jadvali yo'q (band yoki tuzilma o'zgargan)
      }
    }
    // Jadval qatorlari (narxlar) AJAX bilan to'ladi — xonalar paydo bo'lguncha
    // bir necha marta o'qiymiz (bir martagina o'qish 0 qaytarishi mumkin edi).
    let rooms = [];
    let currency = "USD";
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(1500 * multiplier);
      const res = await getRoomsFromPage(page);
      if (res.rooms.length) { rooms = res.rooms; currency = res.currency; break; }
    }
    result.rooms = rooms.sort((a, b) => a.price - b.price);
    result.currency = currency;
    result.minPrice = rooms.length ? Math.min(...rooms.map((r) => r.price)) : 0;
  } catch (e) {
    console.warn("[booking rooms] xato:", e.message);
  } finally {
    await closeBrowser();
  }

  return result;
};

export default getBookingRooms;
