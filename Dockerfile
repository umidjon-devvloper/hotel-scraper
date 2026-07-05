# Hotels Aggregator API — Railway image
# Puppeteer'ning rasmiy image'i (Chrome uchun barcha tizim kutubxonalari bilan).
FROM ghcr.io/puppeteer/puppeteer:24.9.0

# Base image "pptruser" (root emas) sifatida ishlaydi.
WORKDIR /app

# MUHIM: Chrome yo'lini MAJBURLAMAYMIZ. Ilgari PUPPETEER_EXECUTABLE_PATH=
# /usr/bin/google-chrome-stable + SKIP_DOWNLOAD=true qilingan edi, lekin bu
# image'da Chrome u yo'lda EMAS (puppeteer cache'ida) — shu sabab
# "executablePath must be specified" / ENOENT xatosi. Endi package.json'dagi
# puppeteer (19.7.2) o'ziga MOS Chromium'ni O'ZI yuklab oladi (SKIP_DOWNLOAD=false)
# va topadi. Base image barcha tizim kutubxonalarini beradi.
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=false

# Install deps first for better layer caching.
COPY --chown=pptruser:pptruser package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Chromium'ni ANIQ yuklab olamiz. Inline env RUN uchun ustun turadi — Railway
# Variables'da SKIP_DOWNLOAD=true bo'lsa ham bu buyruq baribir yuklaydi. Xato
# bo'lsa build TO'XTAYDI (jim o'tmaydi) — muammo darrov ko'rinadi.
RUN PUPPETEER_SKIP_DOWNLOAD=false PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false \
    node node_modules/puppeteer/install.js

# App source
COPY --chown=pptruser:pptruser . .

EXPOSE 3000
CMD ["node", "src/index.js"]
