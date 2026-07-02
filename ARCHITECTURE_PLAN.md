# Hotels Aggregator API — Arxitektura Rejasi

> Yondashuv: **Gibrid** (oson kanallar self-scrape, qiyinlari tayyor API)
> Miqyos: **Production / SaaS**

---

## 1. Umumiy arxitektura

```
                    ┌─────────────────────────────────────────┐
   Mijoz  ───────►  │  API Gateway (Fastify)                   │
   (REST)           │  - API-key auth + rate limit             │
                    │  - OpenAPI/Swagger docs                  │
                    └───────────────┬─────────────────────────┘
                                    │
                          ┌─────────▼─────────┐
                          │  Cache (Redis)    │  hit ─► darrov qaytar
                          │  TTL 15–60 min    │
                          └─────────┬─────────┘
                                    │ miss
                          ┌─────────▼─────────┐
                          │  Queue (BullMQ)   │  concurrency, retry, priority
                          └─────────┬─────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
      ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
      │ Self-scrape  │     │ Self-scrape  │     │ External API │
      │ adapter      │     │ (proxy)      │     │ adapter      │
      │ Booking,     │     │ Agoda, Trip  │     │ SerpApi:     │
      │ Expedia,     │     │ (residential │     │ Google Hotels│
      │ Hostelworld  │     │  proxy pool) │     │ + fallback   │
      └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
             └────────────────────┼────────────────────┘
                                  ▼
                    ┌──────────────────────────┐
                    │  Normalizer              │  → yagona Hotel schema
                    └────────────┬─────────────┘
                                 ▼
                    Cache'ga yoz (TTL) + Postgres'ga log + mijozga qaytar
```

### Komponentlar
| Qatlam | Texnologiya | Sabab |
|--------|-------------|-------|
| API | **Fastify** | Express'dan tez, built-in schema validation |
| Auth/Limit | API-key + `@fastify/rate-limit` | Har mijozga kvota |
| Queue | **BullMQ** (Redis ustida) | Concurrency boshqaruvi, retry, priority |
| Worker | **puppeteer-cluster** | Bir nechta sahifani parallel scrape |
| Cache | **Redis** | Bir xil so'rovni qayta scrape qilmaslik (tezlik + ban ↓) |
| DB | **Postgres** | Usage/analytics/log, ixtiyoriy natija saqlash |
| Proxy | Residential pool (Bright Data / Oxylabs / Smartproxy) | Agoda/Trip uchun shart |
| Monitoring | **Sentry** + Prometheus/Grafana | Selektor sinishini darrov bilish |
| Deploy | **Docker** (API + worker alohida) | Worker'larni alohida scale qilish |

---

## 2. Provider rejasi (gibrid taqsimot)

### Tier A — O'zimiz scrape (DOM, boshqarsa bo'ladi)
| Provider | Holat | Izoh |
|----------|-------|------|
| **Booking** | ✅ Ishlayapti | Hozir tayyor, asos sifatida |
| **Expedia** | 🟡 Yozish kerak | Hotels.com bilan bir engine — bittasi ikkisiga |
| **Hotels.com** | 🔴 Selektor sinly | Expedia engine'ga moslab qayta yoziladi |
| **Hostelworld** | 🟢 Oson | GraphQL API'si bor, yengil |
| **Airbnb** | 🔴 Selektor sinly | Qayta yozish kerak (alohida bozor) |

### Tier B — O'zimiz scrape, lekin residential proxy + ko'p maintenance
| Provider | Himoya | Izoh |
|----------|--------|------|
| **Agoda** | DataDome | Proxy'siz deyarli imkonsiz |
| **Trip.com** | Kuchli + GraphQL | Sekin, mo'rt |
| **MakeMyTrip / Traveloka** | O'rta | Regional (Hindiston / SE Osiyo) |

### Tier C — Tayyor API orqali (o'zimiz scrape QILMAYMIZ)
| Provider | Manba |
|----------|-------|
| **Google Hotels** | SerpApi `google_hotels` |
| **Trivago / Kayak** | Metasearch — agressiv, API afzal |

> Qoida: bir provider self-scrape'da 2 haftada 2 martadan ko'p sinса → Tier C (API)ga ko'chiriladi.

---

## 3. Yagona schema (normalizatsiya)

Har provider boshqa format qaytaradi → bitta umumiy modelga keltiramiz:

```ts
type Hotel = {
  provider: "booking" | "expedia" | "agoda" | ...;
  providerId: string;
  title: string;
  thumbnail: string | null;
  stars: number | null;
  location: { address?: string; lat?: number; lng?: number; distanceFromCenter?: number };
  price: { currency: string; value: number; taxesAndCharges?: number; total?: number } | null;
  rating: { score: number | null; reviews: number | null; description?: string };
  badges: string[];
  highlights: string[];
  link: string;
  raw?: object;          // debug uchun original
};
```

Adapter pattern: har provider `search(params): Hotel[]` va `details(link): HotelDetail` interfeysini implement qiladi. Hozirgi `bookingParser/` shu shaklga yaqin — refactor oson.

---

## 4. Taxminiy oylik xarajat (production)

| Element | Diapazon |
|---------|----------|
| Server (API + worker, 2–4 vCPU, Puppeteer og'ir) | $40–200 |
| Redis (managed) | $15–50 |
| Postgres (managed) | $15–50 |
| Residential proxy (~$8–15/GB; sahifa ~1–3MB) | $50–500+ |
| External API (SerpApi ~$0.01–0.015/search) | $75–500+ |
| Monitoring (Sentry free tier) | $0 |
| **Jami** | **~$200–800/oy** (hajmga qarab) |

> Asosiy o'zgaruvchi — **so'rov hajmi**. Cache TTL'ni to'g'ri sozlash (narx 15–30 min o'zgarmaydi) proxy va API xarajatini bir necha barobar kamaytiradi.

---

## 5. Yo'l xaritasi (fazalar)

**Faza 1 — Asos (refactor)**
- Hozirgi repo'ni adapter pattern'ga keltirish
- Yagona `Hotel` schema + normalizer
- Booking adapterни schema'ga moslash; Airbnb/Hotels.com selektorlarini tuzatish

**Faza 2 — API skeleti**
- Fastify + API-key auth + rate-limit
- Redis cache (TTL)
- `GET /v1/search?provider=booking&location=...` ishlaydigan endpoint
- Swagger docs

**Faza 3 — Scale infra**
- BullMQ queue + puppeteer-cluster
- Residential proxy integratsiyasi + rotatsiya
- Retry + per-provider health-check

**Faza 4 — Yangi self-scrape kanallar**
- Expedia + Hostelworld adapterlari

**Faza 5 — External API kanallar**
- SerpApi orqali Google Hotels, fallback Agoda/Trip

**Faza 6 — Production hardening**
- Sentry + selektor-sinish alert'lari
- Usage analytics (Postgres), billing kvota
- CI + Docker deploy

---

## 6. Huquqiy / risk eslatmalari (e'tiborga olish shart)
- Saytlarning **ToS** odatda scraping'ni taqiqlaydi — huquqiy maslahat olish tavsiya etiladi.
- **Sharhlar (reviews)** = shaxsiy ma'lumot → GDPR. Ehtiyot bilan saqlash/cache qilish.
- `robots.txt`ga rioya; agressiv so'rov yubormaslik.
- Narxni ko'rsatish (metasearch) keng tarqalgan, lekin **ma'lumotni qayta sotish** kulrang zona.
- Proxy provayder shartlariga ham rioya qilish.

---

## 7. Deploy: Railway

Tanlangan platforma: **Railway** (managed, kam DevOps).

### Service layout (Railway'da)
```
Railway project
  ├─ api        (Fastify — Dockerfile)        public domain
  ├─ worker     (puppeteer-cluster — Dockerfile)  internal
  ├─ Redis      (Railway database — 1-click)   internal
  └─ Postgres   (Railway database — 1-click)    internal
```
- `api` va `worker` — alohida service, bir repo'dan (monorepo, har biriga `Dockerfile` yoki start command).
- Redis va Postgres — Railway'ning built-in database'lari (`REDIS_URL`, `DATABASE_URL` avtomatik env sifatida ulanadi).
- Service'lar bir-biri bilan Railway private network orqali gaplashadi.

### Puppeteer'ni Railway'da ishlatish (muhim nuqtalar)
- **Dockerfile kerak** (Nixpacks emas) — Chrome system kutubxonalari uchun. Asos: `ghcr.io/puppeteer/puppeteer` image yoki `node` + apt libs (`libnss3`, `libatk-bridge2.0-0`, `libgbm1`, `libasound2`...).
- `browserInstance.cjs`'dagi flaglar konteyner uchun allaqachon to'g'ri: `--no-sandbox`, `--single-process`, `headless: true`. ✅
- Xotira: Chrome og'ir → `worker` service'ga kamida **1–2GB RAM** bering, `puppeteer-cluster` concurrency'ni RAM'ga moslang (boshida 2–3).
- `PUPPETEER_CACHE_DIR`'ni image ichida sozlab, Chrome'ni build vaqtida yuklab qo'ying (runtime'da emas).

### ⚠️ Railway IP muammosi (eng muhim)
- Railway = **datacenter IP**. Booking/Agoda/Trip datacenter IP'larni tez bloklaydi (residential IP'ga qaraganda).
- Demak Tier A (Booking, Expedia) uchun ham **residential proxy** deyarli shart — faqat Tier B uchun emas.
- Cache TTL'ni uzunroq (30–60 min) qilib so'rovlar sonini kamaytirish ban xavfini ham pasaytiradi.

### Railway xarajati (taxminiy)
- Hobby plan: $5/oy (ichida $5 usage). Pro: $20/oy.
- Resurs usage bo'yicha hisoblanadi. `api` (yengil) + `worker` (Chrome, ~1–2GB) + Redis + Postgres → boshida **~$20–40/oy** real.
- Proxy va external API alohida (rejadagi $200–800 ichida).

### Kerak bo'ladigan fayllar (Faza 2'da yoziladi)
- `Dockerfile.api`, `Dockerfile.worker`
- `railway.json` / service config (start command, healthcheck)
- `.env.example` — `REDIS_URL`, `DATABASE_URL`, `PROXY_URL`, `SERPAPI_KEY`, `API_KEYS`

---

## Keyingi qadam
Reja tasdiqlangach, **Faza 1**dan boshlaymiz: repo'ni adapter pattern + yagona schema'ga refactor qilib, Booking'ni unga moslab, Airbnb/Hotels.com'ni tuzatamiz. So'ng Faza 2'da Railway uchun Dockerfile + Fastify API skeletini yaratamiz.
