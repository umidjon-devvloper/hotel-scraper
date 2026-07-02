import { getBrowserInstance } from "../helpers/browserInstance.cjs";

/**
 * KATEGORIYA REYTINGLARI — Booking.com property sahifasidagi kategoriya
 * ballari (Staff, Cleanliness, Location, Comfort, Facilities, Value, Free WiFi)
 * va umumiy ballni skreyp qiladi. HasData API o'rniga (kalit kerak emas).
 *
 * @param {number} multiplier
 * @param {string} link — Booking property URL
 * @returns {Promise<{overall:number, scores:Object<string,number>}>}
 */
const getBookingCategoryRatings = async (multiplier = 1, link) => {
  const result = { overall: 0, scores: {} };
  if (!link) return result;

  const { page, closeBrowser } = await getBrowserInstance();
  try {
    await page.goto(link, { waitUntil: "domcontentloaded", timeout: 45000 });
    // Booking sahifa ochilgach klient-navigatsiya qilishi mumkin — barqarorlashishini
    // kutamiz (aks holda evaluate "context destroyed" beradi).
    await page.waitForTimeout(4000 * multiplier);

    // Sharh bo'limi kech yuklanadi — kategoriya ballari paydo bo'lguncha kutamiz.
    let data = result;
    for (let i = 0; i < 6; i++) {
      let scraped = null;
      try {
        scraped = await page.evaluate(() => {
        const out = { overall: 0, scores: {} };

        // Umumiy ball — "Scored 9.5" yoki review-score komponenti.
        const bodyText = document.body.innerText || "";
        const ovEl = document.querySelector('[data-testid="review-score-component"], [data-testid="review-score-right-component"]');
        const ovMatch = (ovEl?.textContent || bodyText).match(/\b([0-9](?:\.[0-9])?|10)\b/);
        if (ovMatch) out.overall = parseFloat(ovMatch[1]);

        // Kategoriya ballari — "Staff 9.5" ko'rinishida.
        for (const el of document.querySelectorAll('[data-testid="review-subscore"]')) {
          const txt = (el.innerText || "").replace(/\n+/g, " ").trim();
          const m = txt.match(/^(.+?)\s+([0-9](?:\.[0-9])?|10)\s*$/);
          if (m) {
            const name = m[1].trim();
            const score = parseFloat(m[2]);
            if (name && score > 0) out.scores[name] = score;
          }
        }

        // Fallback — testid topilmasa, matn bo'yicha standart kategoriyalar.
        if (!Object.keys(out.scores).length) {
          const cats = ["Staff", "Facilities", "Cleanliness", "Comfort", "Value for money", "Location", "Free WiFi", "Free Wifi"];
          for (const c of cats) {
            const m = bodyText.match(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*([0-9](?:\\.[0-9])?|10)"));
            if (m) out.scores[c] = parseFloat(m[1]);
          }
        }
        return out;
        });
      } catch {
        scraped = null; // navigatsiya/context xatosi — keyingi urinishda qayta
      }
      if (scraped) {
        if (scraped.overall && !data.overall) data = { ...data, overall: scraped.overall };
        if (Object.keys(scraped.scores).length) { data = scraped; break; }
      }
      await page.waitForTimeout(1500 * multiplier);
    }
    result.overall = data.overall || 0;
    result.scores = data.scores || {};
  } catch (e) {
    console.warn("[booking category] xato:", e.message);
  } finally {
    await closeBrowser();
  }

  return result;
};

export default getBookingCategoryRatings;
