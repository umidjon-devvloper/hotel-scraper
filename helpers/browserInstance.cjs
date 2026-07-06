const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const proxyChain = require("proxy-chain");
const crypto = require("crypto");
const fs = require("fs");
const { execSync } = require("child_process");

const { executablePath } = require("puppeteer");

puppeteer.use(StealthPlugin());

// Har bir skreyp = alohida brauzer + proxy-chain server (IP rotatsiyasi uchun,
// pool ATAYLAB yo'q). Ular har biri process signal (exit/SIGINT/SIGTERM/SIGHUP)
// listener qo'shadi — SCRAPE_CONCURRENCY parallel ishlaganda 10 dan oshib
// "MaxListenersExceededWarning" beradi (bu SIZISH emas, konkurrentlik). Chegarani
// oshiramiz; haqiqiy sizishni pastdagi try/finally'lar tuzatadi.
process.setMaxListeners(50);

// Proksi (DataImpulse) ba'zan CONNECT tunnelini vaqtincha rad etadi
// (ERR_TUNNEL_CONNECTION_FAILED) — ko'pincha o'tkinchi (gateway yuk ostida).
// Qisqa tanaffus bilan bir necha bor qayta urinamiz; bitta xato butun skreypni
// bekor qilmasin. IP baribir keyingi so'rovda yangilanadi (sticky per-brauzer).
const RETRIABLE_NET =
  /ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_CONNECTION_FAILED|ERR_CONNECTION_(RESET|CLOSED|TIMED_OUT|REFUSED)|ERR_NETWORK_CHANGED|ERR_EMPTY_RESPONSE/i;

const safeGoto = async (page, url, opts = {}, retries = 2) => {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await page.goto(url, opts);
    } catch (e) {
      lastErr = e;
      if (!RETRIABLE_NET.test(e.message || "") || i === retries) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr;
};

// Chrome/Chromium yo'lini aniqlaymiz — MAVJUD faylni topguncha bir necha manba
// sinaladi. Ilgari PUPPETEER_EXECUTABLE_PATH mavjud bo'lmagan yo'lni ko'rsatsa
// "spawn ... ENOENT" / "executablePath ... must be specified" bilan 502 qaytardi.
// Endi:
//   1) env yo'li (faqat fayl mavjud bo'lsa)   — Docker: /usr/bin/google-chrome-stable
//   2) tizimdagi keng tarqalgan yo'llar        — apt/Nixpacks: /usr/bin/chromium
//   3) PATH bo'yicha (`command -v`)             — Nixpacks nixPkgs=["chromium"]
//   4) puppeteer'ning bundled Chromium'i        — lokal dev
const resolveExecutablePath = () => {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  if (envPath) {
    console.warn(`[browser] PUPPETEER_EXECUTABLE_PATH topilmadi (${envPath}) — boshqa joylardan qidiramiz.`);
  }

  const commonPaths = [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const p of commonPaths) if (fs.existsSync(p)) return p;

  for (const bin of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
    try {
      const found = execSync(`command -v ${bin} 2>/dev/null`, { encoding: "utf8" }).trim();
      if (found && fs.existsSync(found)) return found;
    } catch {
      /* topilmadi — keyingisiga o'tamiz */
    }
  }

  try {
    const bundled = executablePath();
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch {
    /* bundled Chromium yuklanmagan */
  }

  console.warn(
    "[browser] Chrome/Chromium umuman topilmadi! Serverga o'rnating — Railway'da " +
      "Dockerfile builder'ini yoqing yoki nixpacks.toml (chromium) bilan quring."
  );
  return undefined;
};

// Upstream (autentifikatsiyali) residential proksi URL'ini tayyorlaydi.
//  • Sticky session — DataImpulse (`gw.dataimpulse.com`) uchun username'ga
//    `__sid.<rand>` qo'shadi: shu brauzer umri davomida BARCHA so'rov BITTA
//    IP orqali ketadi. Aks holda har so'rovda IP (va davlat) o'zgarib, Google
//    Hotels har safar boshqa valyuta/narx qaytaradi — "noto'g'ri ma'lumot".
//    O'chirish: PROXY_STICKY=false
const buildUpstreamProxy = () => {
  const url = process.env.PROXY_URL;
  if (!url) return null;
  try {
    const u = new URL(url);
    const sticky = process.env.PROXY_STICKY !== "false";
    if (sticky && /dataimpulse/i.test(u.hostname) && !/__sid\./.test(u.username)) {
      const sid = crypto.randomBytes(4).toString("hex");
      u.username = `${u.username}__sid.${sid}`;
    }
    return u.toString();
  } catch {
    return url; // Format g'alati bo'lsa ham xomicha uzatamiz.
  }
};

const upstreamHost = (upstream) => {
  try {
    return new URL(upstream).host;
  } catch {
    return "?";
  }
};

const getBrowserInstance = async () => {
  const upstream = buildUpstreamProxy();

  // proxy-chain lokal anonim proksi ochadi va upstream auth'ni O'ZI bajaradi.
  // Bu `page.authenticate()`dan ancha ishonchli — u har so'rovda 407 qo'l berishni
  // qiladi va residential proksida tez-tez osilib/uziladi (narx umuman kelmaydi).
  let localProxyUrl = null;
  if (upstream) {
    try {
      localProxyUrl = await proxyChain.anonymizeProxy(upstream);
    } catch (e) {
      console.warn("[browser] proksi ulanmadi, PROKSISIZ davom etamiz:", e.message);
      localProxyUrl = null;
    }
  }

  // Railway loglarida proksi ishlayotganini darrov ko'rish uchun (eng ko'p
  // "proksini nega ola olmayapman" muammosi — production'da PROXY_URL yo'qligi).
  console.log(
    localProxyUrl
      ? `[browser] proksi BILAN ishga tushmoqda (${upstreamHost(upstream)})`
      : "[browser] proksiSIZ ishga tushmoqda (PROXY_URL o'rnatilmagan)"
  );

  // --single-process removed: it causes Chrome instability and races that close
  // pages mid-scrape, triggering cascading ProtocolError: Target closed crashes.
  const args = ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1600,900"];
  // Proksi + request interception birgalikda Chrome'da ERR_CERT_AUTHORITY_INVALID
  // beradi (cert aslida to'g'ri — interception TLS tekshiruvini chalg'itadi). Biz
  // faqat public sahifa skreyp qilamiz, maxfiy ma'lumot yubormaymiz — xavfsiz.
  if (localProxyUrl) args.push("--ignore-certificate-errors");
  if (localProxyUrl) args.push(`--proxy-server=${localProxyUrl}`);

  const browser = await puppeteer.launch({
    headless: true,
    args,
    executablePath: resolveExecutablePath(),
  });

  const page = await browser.newPage();

  // Og'ir resurslarni (rasm/media/font/CSS) bloklaymiz. Narx/ma'lumot DOM'da
  // matn sifatida (data-testid, innerText) bo'ladi — CSS/rasm kerak emas. Foyda:
  //   • tezroq yuklanadi (kamroq so'rov),
  //   • residential proksi TRAFIGI (puli) kamayadi — har rasm/font proksidan o'tadi,
  //   • kamroq so'rov = tabiyroq, kamroq blok.
  // Rasm URL'lari (thumbnail) DOM'dagi `src` atributida qoladi — yuklanmasa ham.
  // O'chirish: BLOCK_RESOURCES=false
  if (process.env.BLOCK_RESOURCES !== "false") {
    const BLOCKED = new Set(["image", "media", "font", "stylesheet"]);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (BLOCKED.has(req.resourceType())) req.abort().catch(() => {});
      else req.continue().catch(() => {});
    });
  }

  await page.setViewport({
    width: 1280,
    height: 720,
  });
  page.setDefaultNavigationTimeout(60000);

  const closeBrowser = async () => {
    try {
      await browser.close();
    } catch (e) {
      if (!String(e.message).includes("Target closed")) {
        console.warn("[browser] close error:", e.message);
      }
    }
    // Lokal anonim proksini ham yopamiz (aks holda portlar to'planib qoladi).
    if (localProxyUrl) {
      try {
        await proxyChain.closeAnonymizedProxy(localProxyUrl, true);
      } catch {
        /* noop — brauzer allaqachon yopilgan bo'lishi mumkin */
      }
    }
  };

  return { page, closeBrowser };
};

module.exports = { getBrowserInstance, safeGoto };
