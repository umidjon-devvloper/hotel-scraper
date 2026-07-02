# Hotels Aggregator API — Railway image
# Based on Puppeteer's official image which bundles Chrome + all system libs.
FROM ghcr.io/puppeteer/puppeteer:19.7.2

# The base image runs as the non-root "pptruser".
WORKDIR /app

# Chrome already lives in the image; don't let puppeteer re-download it.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production

# Install deps first for better layer caching.
COPY --chown=pptruser:pptruser package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# App source
COPY --chown=pptruser:pptruser . .

EXPOSE 3000
CMD ["node", "src/index.js"]
