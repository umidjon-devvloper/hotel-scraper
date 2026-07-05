# Hotels Aggregator API — Railway image
# Puppeteer'ning rasmiy image'i (Chrome + barcha tizim kutubxonalari bilan).
FROM ghcr.io/puppeteer/puppeteer:19.7.2

# Base image "pptruser" (root emas) sifatida ishlaydi.
WORKDIR /app

# MUHIM: Chrome yo'lini MAJBURLAMAYMIZ. Ilgari PUPPETEER_EXECUTABLE_PATH=
# /usr/bin/google-chrome-stable qilingan edi, lekin bu image'da Chrome u yerda
# EMAS (puppeteer cache'ida) — shu sabab "executablePath must be specified" /
# ENOENT xatosi chiqardi. Endi puppeteer o'ziga MOS Chromium'ni o'zi yuklab
# oladi (npm ci → postinstall) va o'zi topadi.
ENV NODE_ENV=production

# Install deps first for better layer caching.
COPY --chown=pptruser:pptruser package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# App source
COPY --chown=pptruser:pptruser . .

EXPOSE 3000
CMD ["node", "src/index.js"]
