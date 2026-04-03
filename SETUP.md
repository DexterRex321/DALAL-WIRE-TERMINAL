# DALAL WIRE v2.0 — SETUP GUIDE

## What changed in v2

- TwelveData API removed entirely (was unused, leaked in README)
- Newsdata.io key is now optional — RSS feeds work without it
- Security layer added: API_SECRET header, CORS lockdown, rate limiting
- Dhan broker API integrated behind a feature flag (off by default)
- All secrets live in `.env` only — never in render.yaml or README

---

## Step 1 — Install dependencies

```bash
npm install
```

New packages added:
- `cors` — origin lockdown
- `express-rate-limit` — per-IP throttling

---

## Step 2 — Create your .env file

```bash
cp .env.example .env
```

---

## Step 3 — Generate your API secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output into `API_SECRET=` in your `.env`.

---

## Step 4 — Validate your env

```bash
npm run check:env
```

Fix any issues it reports before starting.

---

## Step 5 — Start the server

```bash
npm run dev        # development (auto-restart)
npm start          # production
```

Open:
- Bridge:    http://localhost:3000
- Terminal:  http://localhost:3000/terminal
- Health:    http://localhost:3000/api/health
- Broker:    http://localhost:3000/api/broker/status

---

## Step 6 — Add Dhan broker API (when ready)

1. Go to https://dhanhq.co → Login → My Profile → API & App
2. Create a new app with **Read** permissions only
3. Copy your Client ID and Access Token
4. Add to `.env`:
   ```
   DHAN_CLIENT_ID=your_client_id
   DHAN_ACCESS_TOKEN=your_access_token
   FEATURE_DHAN_API=true
   ```
5. Run `npm run check:env` to validate
6. Restart the server

Dhan access tokens expire every 30 days. Set a calendar reminder.

Available broker endpoints (once enabled):
- `GET /api/broker/holdings` — long-term portfolio
- `GET /api/broker/positions` — intraday positions
- `GET /api/broker/funds` — margin and fund limit
- `GET /api/broker/portfolio` — combined summary
- `GET /api/broker/status` — always available, shows if Dhan is enabled

---

## Step 7 — Deploy to Render

1. Push your code to GitHub (**never push `.env`**)
2. Go to render.com → New Web Service → Connect your repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Go to Environment tab in Render dashboard
6. Add each secret manually (copy from your local `.env`):
   - `API_SECRET`
   - `ALLOWED_ORIGINS` → your Render URL e.g. `https://dalal-wire.onrender.com`
   - `DHAN_CLIENT_ID` (when ready)
   - `DHAN_ACCESS_TOKEN` (when ready)
   - `NEWSDATA_KEY` (optional)
7. The `render.yaml` in this repo only sets non-secret config

---

## Data sources (all free)

| Source         | Data                        | Key required |
|----------------|------------------------------|--------------|
| Yahoo Finance  | All quotes, indices, global  | No           |
| MFAPI          | Mutual fund NAV history      | No           |
| NSE            | FII/DII flows, India VIX     | No           |
| RSS feeds      | News from 24 sources         | No           |
| CNN Money      | Fear & Greed index           | No           |
| Newsdata.io    | Enhanced news (optional)     | Optional     |
| Dhan HQ API    | Portfolio, positions         | Yes (yours)  |

---

## Freshness tags

Every data widget shows one of these tags — no silent stale data:

| Tag           | Meaning                                    |
|---------------|--------------------------------------------|
| `LIVE`        | Fetched in this request cycle              |
| `DELAYED 15m` | Yahoo Finance free tier (always delayed)   |
| `EOD`         | End of day data (FII/DII from NSE)         |
| `FALLBACK`    | Serving cached data after a fetch error    |
| `UNAVAILABLE` | No data available at all                   |
| `RSS`         | News from RSS feed                         |

India VIX is always labeled separately from CBOE VIX.
FII/DII is always labeled EOD — it is never shown as LIVE.

---

## Security notes

- `API_SECRET` is injected into served HTML at runtime so the browser can authenticate — it is never in a public JS bundle
- All `/api/*` routes require the `x-dalal-token` header matching `API_SECRET`
- CORS is locked to `ALLOWED_ORIGINS` — requests from other origins are rejected
- Broker routes have tighter rate limits than data routes
- In development with no `API_SECRET` set, auth is skipped with a console warning
- `npm run check:env` will warn you if the old compromised keys are still present
