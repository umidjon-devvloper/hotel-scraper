import chalk from "chalk";
import moment from "moment";
import { getBrowserInstance } from "../helpers/browserInstance.cjs";
import getBookingFilters from "./getBookingFilters.js";

let multiplier = 1;

const getHotelsInfo = async (page) => {
  return await page.evaluate(() => {
    // Null-xavfsiz yordamchilar — Booking ba'zi kartalarda (reklama, boshqa
    // tuzilma) kutilgan elementni bermaydi. Ilgari `.textContent` to'g'ridan-to'g'ri
    // chaqirilib, null'da butun map() qulardi (502). Endi har biri himoyalangan.
    const txt = (el, sel) => el.querySelector(sel)?.textContent?.trim() || undefined;
    const attr = (el, sel, name) => el.querySelector(sel)?.getAttribute(name) || undefined;

    return Array.from(document.querySelectorAll('[data-testid="property-card"]'))
      .map((el) => {
        // Title yoki link bo'lmasa — bu yaroqsiz karta, o'tkazib yuboramiz.
        const title = txt(el, 'h3 [data-testid="title"]');
        const rawLink = attr(el, "a", "href");
        if (!title || !rawLink) return null;

        const qIdx = rawLink.indexOf("?");
        const link = `${qIdx >= 0 ? rawLink.slice(0, qIdx) : rawLink}?lang=en-us`;

        const priceString = txt(el, '[data-testid="price-and-discounted-price"]');
        const taxesString = txt(el, '[data-testid="taxes-and-charges"]')?.replace(/[^0-9|+|-]/gm, "");
        // Yulduz: eski `.e4755bbd60` klass o'lgan (Booking obfuscated klassni
        // almashtiradi). Barqaror selektor — `[data-testid="rating-stars"]`
        // (rasmiy toifa), ichidagi ikonalar soni = yulduz. Bo'lmasa aria-label'dan
        // raqam. Booking ba'zi sessiyalarda umuman ko'rsatmaydi → undefined
        // (backend SerpAPI hotelClass bilan to'ldiradi).
        const starsBox = el.querySelector('[data-testid="rating-stars"]');
        let stars;
        if (starsBox) {
          const icons = starsBox.querySelectorAll("svg").length || starsBox.children.length;
          if (icons > 0 && icons <= 5) {
            stars = icons;
          } else {
            const al = starsBox.getAttribute("aria-label") || starsBox.querySelector("[aria-label]")?.getAttribute("aria-label") || "";
            const mm = al.match(/([1-5])/);
            if (mm) stars = parseInt(mm[1]);
          }
        }
        const distanceStr = txt(el, '[data-testid="distance"]');
        const reviewsStr = txt(el, '[data-testid="review-score"] > div:last-child > div:last-child');
        const scoreStr = txt(el, '[data-testid="review-score"] > div:first-child');
        const priceMatch = priceString ? priceString.match(/[\d|,|.]+/gm) : null;

        return {
          thumbnail: attr(el, "a img", "src"),
          title,
          stars,
          preferredBadge: Boolean(el.querySelector('[data-testid="preferred-badge"]')),
          promotedBadge: Boolean(el.querySelector(".e2f34d59b1")),
          location: txt(el, '[data-testid="address"]'),
          subwayAccess: Boolean(el.querySelector(".f4bd0794db .cb5ebe3ffb > span:not([data-testid])")),
          sustainability: txt(el, ".ff07fc41e3"),
          distanceFromCenter: distanceStr ? parseFloat(distanceStr) : undefined,
          highlights: Array.from(el.querySelectorAll(".d22a7c133b > div > [class]")).map((e) => e.textContent.trim()),
          price: priceMatch
            ? {
                currency: priceString.replace(/[\d|,|.]+/gm, "").replace(/\s/gm, ""),
                value: parseFloat(priceMatch[0].replace(",", "")),
                taxesAndCharges: taxesString ? parseFloat(taxesString) : undefined,
              }
            : undefined,
          rating: {
            score: scoreStr ? parseFloat(scoreStr) || "No rating" : "No rating",
            scoreDescription: attr(el, '[data-testid="review-score"] > div:last-child > div:first-child', "aria-label") || "No rating",
            reviews: reviewsStr ? parseInt(reviewsStr.replace(",", "")) || "No rating" : "No rating",
          },
          link,
        };
      })
      .filter(Boolean);
  });
};

const getBookingHotels = async (
  multiplierArgument,
  appliedFilters,
  currency,
  limit,
  selectedLocation,
  selectedCheckIn,
  selectedCheckOut,
  selectedAdults,
  selectedChildren,
  selectedRooms,
  selectedTravelPurpose
) => {
  const resultsLimit = limit || 35;
  const location = selectedLocation || "paris";
  const checkIn = selectedCheckIn?.replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2") || moment().format("YYYY-MM-DD");
  const checkOut = selectedCheckOut?.replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2") || moment().add(1, "d").format("YYYY-MM-DD");
  const adults = selectedAdults || 2;
  const children = selectedChildren || 0;
  const rooms = selectedRooms || 1;
  const travelPurpose = selectedTravelPurpose || "leisure";
  multiplier = multiplierArgument;
  const { currencies, filters } = getBookingFilters();
  let parsedFilters;
  const badFilters = [];
  if (appliedFilters) {
    if (!Array.isArray(appliedFilters)) {
      throw new Error(`"filters" value is not valid. It must be an array with available filters. Use "getFilters" method to get available filters.`);
    }
    parsedFilters = [];
    appliedFilters.forEach((el) => {
      let parsedFilter;
      for (const filtersArray in filters) {
        if (parsedFilter) break;
        parsedFilter = filters[filtersArray].find((filter) => filter.value === el.toLowerCase() || filter.name.toLowerCase() === el.toLowerCase());
      }
      if (parsedFilter) parsedFilters.push(parsedFilter.value);
      else badFilters.push(el);
    });
  }
  const parsedCurrency = currency
    ? currencies.find((el) => el.value.toLowerCase() === currency.toLowerCase() || el.name.toLowerCase() === currency.toLowerCase())
    : true;
  if (appliedFilters && badFilters.length && !parsedCurrency) {
    throw new Error(`Provided filters "${badFilters}" and currency "${currency}" are not valid. Use "getFilters" method to get available filters.`);
  }
  if (appliedFilters && badFilters.length) {
    throw new Error(`Provided filters "${badFilters}" is not valid. Use "getFilters" method to get available filters.`);
  }
  if (!parsedCurrency) {
    throw new Error(`Provided currency "${currency}" is not valid. Use "getFilters" method to get available filters.`);
  }
  if (parsedCurrency.value === "RUB") {
    throw new Error(chalk.bgRed(`Рубль - валюта терористов! путин - хуйло! Правда о войне в Украине - https://mywar.mkip.gov.ua/`));
  }
  const url = `https://www.booking.com/searchresults.en-us.html?ss=${encodeURI(
    location
  )}&checkin=${checkIn}&checkout=${checkOut}&group_adults=${adults}&no_rooms=${rooms}&group_children=${children}&sb_travel_purpose=${travelPurpose}&selected_currency=${
    parsedCurrency.value
  }${parsedFilters?.length ? `&nflt=${encodeURIComponent(parsedFilters.join(";"))}` : ""}`;

  const { page, closeBrowser } = await getBrowserInstance();

  // Booking sekin yuklansa yoki vaqtincha bloklasa — bir marta qayta urinamiz.
  // Timeout qisqaroq (20s) — bloklangan so'rov 90s osilib turmasligi uchun
  // (proksisiz Booking soft-block qilsa, tez "topilmadi" qaytsin).
  await page.goto(url, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector('[data-testid="property-card"]', { timeout: 20000 * multiplier });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500 * multiplier);
    await page.waitForSelector('[data-testid="property-card"]', { timeout: 20000 * multiplier });
  }

  const results = [...(await getHotelsInfo(page))];

  while (resultsLimit > results.length) {
    const isNextPage = await page.$('[aria-label="Next page"]:not([disabled])');
    if (!isNextPage) break;
    await isNextPage.click();
    await page.waitForTimeout(500 * multiplier);
    while (await page.$('[data-testid="overlay-card"]')) {
      await page.waitForTimeout(2000 * multiplier);
    }
    await page.waitForTimeout(2000 * multiplier);
    results.push(...(await getHotelsInfo(page)));
  }

  await closeBrowser();

  return results.filter((el, i) => i < resultsLimit);
};

export default getBookingHotels;
