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
ENV NODE_ENV=production

# Install deps first for better layer caching.
COPY --chown=pptruser:pptruser package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Chromium'ni ANIQ yuklab olamiz. MUHIM: PUPPETEER_SKIP_DOWNLOAD ni "false"
# QILMAYMIZ — puppeteer uni oddiy truthy tekshiradi va "false" ham truthy =>
# skip qilardi ("Skipping browser download as instructed"). Buning o'rniga base
# image o'rnatgan skip-o'zgaruvchilarni UNSET qilamiz — shunda install.js
# Chromium'ni ROSTDAN yuklaydi. Xato bo'lsa build to'xtaydi (jim o'tmaydi).
RUN env -u PUPPETEER_SKIP_DOWNLOAD -u PUPPETEER_SKIP_CHROMIUM_DOWNLOAD \
        -u npm_config_puppeteer_skip_download -u npm_config_puppeteer_skip_chromium_download \
        node node_modules/puppeteer/install.js

# App source
COPY --chown=pptruser:pptruser . .

EXPOSE 3000
CMD ["node", "src/index.js"]
