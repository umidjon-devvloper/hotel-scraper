const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

const { executablePath } = require("puppeteer");

puppeteer.use(StealthPlugin());

// Resolve Chrome path: explicit env (Docker/Railway) wins, else puppeteer's bundled binary.
const resolveExecutablePath = () => {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  try {
    return executablePath();
  } catch {
    return undefined;
  }
};

// Optional residential/datacenter proxy, e.g. http://user:pass@host:port
const parseProxy = () => {
  const url = process.env.PROXY_URL;
  if (!url) return { arg: null, auth: null };
  try {
    const u = new URL(url);
    const server = `${u.protocol}//${u.host}`;
    const auth = u.username ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) } : null;
    return { arg: `--proxy-server=${server}`, auth };
  } catch {
    return { arg: `--proxy-server=${url}`, auth: null };
  }
};

const getBrowserInstance = async () => {
  const { arg: proxyArg, auth: proxyAuth } = parseProxy();
  // --single-process removed: it causes Chrome instability and races that close
  // pages mid-scrape, triggering cascading ProtocolError: Target closed crashes.
  const args = ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1600,900"];
  if (proxyArg) args.push(proxyArg);

  const browser = await puppeteer.launch({
    headless: true,
    args,
    executablePath: resolveExecutablePath(),
  });

  const page = await browser.newPage();
  if (proxyAuth) await page.authenticate(proxyAuth);
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
  };

  return { page, closeBrowser };
};

module.exports = { getBrowserInstance };
