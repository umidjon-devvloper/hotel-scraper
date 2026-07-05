// Proksi tekshiruvi — proksi ROSTDAN ishlayaptimi va qaysi davlat/IP orqali
// chiqyapmizmi ko'rsatadi. Ishlatish:  node _test-proxy.mjs
//
// Kutilgan natija: PROXY_URL __cr.us bo'lsa → country "US".
// Agar "proksiSIZ" chiqsa yoki xato bersa — PROXY_URL o'rnatilmagan yoki noto'g'ri.
import "dotenv/config";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { getBrowserInstance } = require("./helpers/browserInstance.cjs");

const run = async () => {
  console.log("PROXY_URL:", process.env.PROXY_URL ? "(o'rnatilgan)" : "(BO'SH — proksi yo'q)");
  const { page, closeBrowser } = await getBrowserInstance();
  try {
    // ipinfo.io/json — egress IP + davlat + provayder. Proksi ortidan qaysi IP
    // ko'rinayotganini aynan shu ko'rsatadi.
    await page.goto("https://ipinfo.io/json", { waitUntil: "domcontentloaded", timeout: 45000 });
    const body = await page.evaluate(() => document.body.innerText);
    let info;
    try {
      info = JSON.parse(body);
    } catch {
      console.log("Javob JSON emas (bloklangan bo'lishi mumkin):\n", body.slice(0, 400));
      return;
    }
    console.log("─────────────────────────────────────");
    console.log("Egress IP :", info.ip);
    console.log("Davlat    :", info.country);
    console.log("Shahar    :", info.city, info.region);
    console.log("Provayder :", info.org);
    console.log("─────────────────────────────────────");
    if (info.country === "US") console.log("✅ Proksi US orqali ishlayapti — Google Hotels USD narx beradi.");
    else if (info.country) console.log(`⚠️  Davlat ${info.country} (US emas) — narx boshqa valyutada kelishi mumkin.`);
  } catch (e) {
    console.error("❌ Xato:", e.message);
    console.error("   → PROXY_URL to'g'rimi? Proksi balansi bormi? gw.dataimpulse.com ochiladimi?");
  } finally {
    await closeBrowser();
  }
};

run();
