/**
 * DALAL WIRE — SERVER v2.0
 *
 * Data sources (all free, no API key):
 *   Yahoo Finance  → quotes, indices, global markets, macro
 *   MFAPI          → mutual fund NAV history
 *   NSE            → FII/DII flows, India VIX history (cookie-scraped)
 *   RSS feeds      → news from 24 Indian financial sources
 *   CNN Money      → Fear & Greed index
 *
 * Broker (behind FEATURE_DHAN_API flag):
 *   Dhan HQ API v2 → holdings, positions (read-only, no orders in v1)
 *
 * Security:
 *   x-dalal-token  → shared secret header on all /api/* routes
 *   CORS           → locked to ALLOWED_ORIGINS
 *   Rate limiting  → per-IP on heavy endpoints
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createHmac, createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// ── DYNAMIC IMPORT: yahoo-finance2 (ESM) ──
import YahooFinance from 'yahoo-finance2';
const yf = new YahooFinance();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR  = __dirname;

// ── FILE PATHS ───────────────────────────────────────────────
const DALAL_PUBLIC_DIR    = path.join(ROOT_DIR, 'dalal-wire-node', 'public');
const BRIDGE_HOME_FILE    = path.join(ROOT_DIR, 'dalal-worldmonitor-bridge.html');
const BRIDGE_APP_FILE     = path.join(ROOT_DIR, 'bridge-app.js');
const BRIDGE_STYLES_FILE  = path.join(ROOT_DIR, 'bridge-styles.css');
const SWITCHER_WIDGET_FILE = path.join(ROOT_DIR, 'switcher-widget.html');
const DALAL_INDEX_FILE    = path.join(DALAL_PUBLIC_DIR, 'index.html');
const DALAL_APP_FILE      = path.join(DALAL_PUBLIC_DIR, 'app.js');
const DALAL_STYLES_FILE   = path.join(DALAL_PUBLIC_DIR, 'app.css');

// ── ENV ──────────────────────────────────────────────────────
const PORT        = process.env.PORT || 3000;
const IS_PROD     = process.env.NODE_ENV === 'production';
const IS_VERCEL   = Boolean(process.env.VERCEL || process.env.VERCEL_URL);
const API_SECRET  = process.env.API_SECRET || null;

// Feature flags — all off by default until you enable them in .env
const FEATURE_DHAN_API          = process.env.FEATURE_DHAN_API === 'true';
const FEATURE_ADVICE_LIVE       = process.env.FEATURE_ADVICE_LIVE === 'true';
const FEATURE_PORTFOLIO_OVERLAY = process.env.FEATURE_PORTFOLIO_OVERLAY === 'true';

// Dhan API config — only used when FEATURE_DHAN_API=true
const DHAN_CLIENT_ID    = process.env.DHAN_CLIENT_ID || null;
const DHAN_ACCESS_TOKEN = process.env.DHAN_ACCESS_TOKEN || null;
const DHAN_API_BASE     = process.env.DHAN_API_BASE || 'https://api.dhan.co';

// Newsdata.io — optional, falls back to RSS-only when not set
const NEWSDATA_KEY = process.env.NEWSDATA_KEY || null;

// Allowed origins for CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// ── ENV VALIDATION ON STARTUP ────────────────────────────────
function validateEnv() {
  const warnings = [];

  if (IS_PROD && !API_SECRET) {
    console.error('\n❌ FATAL: API_SECRET is missing but NODE_ENV is "production".');
    console.error('   Server refusing to start without a production-grade secret.');
    console.error('   Generate one with: npm run gen:secret\n');
    process.exit(1);
  }

  if (!API_SECRET) {
    warnings.push('⚠  API_SECRET is not set — bypassing auth for development');
  }

  if (IS_PROD && ALLOWED_ORIGINS.some(o => o.includes('localhost'))) {
    warnings.push('⚠  ALLOWED_ORIGINS contains localhost — tighten this for production');
  }

  if (FEATURE_DHAN_API) {
    if (!DHAN_CLIENT_ID)    warnings.push('⚠  FEATURE_DHAN_API=true but DHAN_CLIENT_ID is empty');
    if (!DHAN_ACCESS_TOKEN) warnings.push('⚠  FEATURE_DHAN_API=true but DHAN_ACCESS_TOKEN is empty');
  }

  if (warnings.length) {
    console.warn('\n  ENV WARNINGS:');
    warnings.forEach(w => console.warn(' ', w));
    console.warn('');
  }
}

validateEnv();

// ── EXPRESS APP ──────────────────────────────────────────────
const app = express();

// Gzip all responses
app.use(compression());

// ── CORS ─────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin requests (no Origin header) and Vercel preview URLs
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed))) return cb(null, true);
    if (process.env.VERCEL_URL && origin.includes('vercel.app')) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: false,
}));

// ── RATE LIMITING ────────────────────────────────────────────
// Heavy external proxy routes get tighter limits
const defaultLimit = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const tokenLimit   = rateLimit({ windowMs: 60_000, max: 20,  standardHeaders: true, legacyHeaders: false });
const mfapiLimit   = rateLimit({ windowMs: 60_000, max: 40,  standardHeaders: true, legacyHeaders: false });
const newsLimit    = rateLimit({ windowMs: 60_000, max: 30,  standardHeaders: true, legacyHeaders: false });
const brokerLimit  = rateLimit({ windowMs: 60_000, max: 20,  standardHeaders: true, legacyHeaders: false });

app.use('/api', defaultLimit);
app.use('/api/mfapi', mfapiLimit);
app.use('/api/news', newsLimit);
if (FEATURE_DHAN_API) {
  app.use('/api/broker', brokerLimit);
}

function getClientFingerprint(req) {
  const ua = req.headers['user-agent'] || '';
  const ip = (req.ip || req.headers['x-forwarded-for'] || '').replace('::ffff:', '');
  
  // Scoped strictly to development (NODE_ENV !== production)
  const isLocal = !IS_PROD && (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.'));
  
  const fingerprintData = ua + (isLocal ? 'local-dev' : ip) + (API_SECRET || '');
  return createHash('sha256').update(fingerprintData).digest('hex').slice(0, 16);
}

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 mins
function generateSessionToken(req) {
  const secret = API_SECRET || 'dev-fallback';
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const fingerprint = getClientFingerprint(req);
  const payload = `${expiresAt}.${fingerprint}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${signature}`).toString('base64');
}

function verifySessionToken(token, req) {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [expiresAt, fingerprint, signature] = decoded.split('.');
    if (!expiresAt || !fingerprint || !signature) return false;
    
    // 1. Expiry check
    if (Date.now() > parseInt(expiresAt, 10)) return false;
    
    // 2. Fingerprint binding check (H1 Hardening)
    const currentFingerprint = getClientFingerprint(req);
    if (fingerprint !== currentFingerprint) return false;

    // 3. Signature check
    const payload = `${expiresAt}.${fingerprint}`;
    const expectedSig = createHmac('sha256', API_SECRET || 'dev-fallback').update(payload).digest('hex');
    return signature === expectedSig;
  } catch(e) {
    return false;
  }
}

app.get('/api/auth/session', tokenLimit, (req, res) => {
  const origin  = req.headers.origin;
  const referer = req.headers.referer;
  const isLocal = !IS_PROD && ((origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) || (referer && (referer.includes('localhost') || referer.includes('127.0.0.1'))));
  
  const isAllowedBrowser = isLocal || ALLOWED_ORIGINS.some(allowed => {
    const cleanAllowed = allowed.replace(/\/$/, '');
    return (origin && origin.startsWith(cleanAllowed)) || (referer && referer.startsWith(cleanAllowed));
  });

  if (isAllowedBrowser || (!IS_PROD && !API_SECRET)) {
    return res.json({ token: generateSessionToken(req) });
  }
  return res.status(401).json({ error: 'Unauthorized Session Access' });
});

// ── API AUTH MIDDLEWARE ───────────────────────────────────────
// Shared secret header — frontend sends x-dalal-token on every /api/ call.
function apiAuth(req, res, next) {
  // If API_SECRET is not set AND we are NOT in production, we skip auth
  if (!API_SECRET && !IS_PROD) return next();
  
  if (req.path === '/auth/session') return next(); // Exclude the session generation endpoint
  const token = req.headers['x-dalal-token'];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized Backend Access' });
  }
  if (token === API_SECRET || verifySessionToken(token, req)) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized Backend Access' });
}

// ── HEALTH CHECK (no auth — used by Render for liveness) ─────
app.get('/api/health', (req, res) => {
  const cacheStats = {};
  for (const k of Object.keys(_cache || {})) {
    cacheStats[k] = { age_ms: Date.now() - _cache[k].ts };
  }
  res.json({
    status:   'ok',
    uptime_s: Math.round(process.uptime()),
    features: {
      dhan_api:          FEATURE_DHAN_API,
      advice_live:       FEATURE_ADVICE_LIVE,
      portfolio_overlay: FEATURE_PORTFOLIO_OVERLAY,
    },
    dhan_ready: FEATURE_DHAN_API && Boolean(DHAN_CLIENT_ID) && Boolean(DHAN_ACCESS_TOKEN),
    cache:     cacheStats,
  });
});

app.use('/api', apiAuth);

// ── IN-MEMORY CACHE ───────────────────────────────────────────
const _cache = {};

function getCache(key)                  { return _cache[key] || null; }
function setCache(key, data)            { _cache[key] = { data, ts: Date.now() }; }
function isFresh(key, ttlMs)            { const c = _cache[key]; return c && (Date.now() - c.ts) < ttlMs; }

// TTLs
const TTL = {
  QUOTE:          10_000,   // 10s — Yahoo price quotes
  GLOBAL:         15_000,   // 15s — global indices
  FIIDII:         90_000,   // 90s — NSE FII/DII (EOD data, no need to hammer)
  HEATMAP:        30_000,   // 30s — heatmap
  NEWS:          120_000,   // 2m  — RSS news per category
  MFAPI:    4 * 3600_000,   // 4h  — MF NAV (daily data)
  SENTIMENT:15 * 60_000,    // 15m — Fear & Greed
  ADVICE:        60_000,    // 1m  — advice signal
  INDICES_FAST:  10_000,    // 10s — fast index quotes
  SLOW:          15_000,    // 15s — slow dashboard bundle
  LOCKIN:     5 * 60_000,   // 5m  — lock-in calendar
  DHAN:          30_000,    // 30s — broker portfolio data
};

// ── REQUEST BATCHING STATE ────────────────────────────────────
let indicesFastCache = null;
let indicesFastLastUpdated = 0;
let indicesFastInFlight = null;

let dashboardSlowCache = null;
let dashboardSlowLastUpdated = 0;
let dashboardSlowInFlight = null;

let dashboardAggregateCache = null;
let dashboardAggregateLastUpdated = 0;
let dashboardAggregateInFlight = null;

// ── MICRO-HISTORY (in-memory price series for sparklines) ─────
const microHistory = {
  nifty:  [],
  usdinr: [],
  crude:  [],
  vix:    [],
  gsec:   [],
};

function pushSeriesPoint(arr, value, max = 48) {
  if (!Number.isFinite(value) || value <= 0) return;
  arr.push(value);
  if (arr.length > max) arr.splice(0, arr.length - max);
}

// ── UTILITY ───────────────────────────────────────────────────
function toFiniteNumber(...values) {
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    const n = Number(String(v).replace(/,/g, '').trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function buildStatus(tag, source, extra = {}) { return { tag, source, ...extra }; }

function setApiCacheHeaders(res, sMaxage = 10, stale = 30) {
  res.set('Cache-Control', `s-maxage=${sMaxage}, stale-while-revalidate=${stale}`);
}

function formatNseDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return [String(d.getDate()).padStart(2, '0'), String(d.getMonth() + 1).padStart(2, '0'), d.getFullYear()].join('-');
}

function countUniqueSeries(values = []) {
  const seen = new Set();
  values.forEach(v => { const n = Number(v); if (Number.isFinite(n)) seen.add(n.toFixed(4)); });
  return seen.size;
}

function pickBridgeSeries({ live = [], intraday = [], daily = [], max = 48, labels = {} } = {}) {
  const lv = live.filter(v => Number.isFinite(Number(v)) && Number(v) > 0).slice(-max);
  const iv = intraday.filter(v => Number.isFinite(Number(v)) && Number(v) > 0).slice(-max);
  const dv = daily.filter(v => Number.isFinite(Number(v)) && Number(v) > 0).slice(-Math.min(max, 24));
  const lu = countUniqueSeries(lv), iu = countUniqueSeries(iv), du = countUniqueSeries(dv);
  if (lv.length >= 6 && lu >= 2) return { values: lv, mode: 'LIVE MICRO',        source: labels.live || 'Live feed',         unique: lu };
  if (iv.length >= 8 && iu >= 2) return { values: iv, mode: 'INTRADAY SESSION',  source: labels.intraday || 'Intraday',       unique: iu };
  if (dv.length >= 8 && du >= 2) return { values: dv, mode: 'DAILY TREND',       source: labels.daily || 'Daily trend',       unique: du };
  if (lv.length)                  return { values: lv, mode: 'SPOT STATIC',       source: labels.live || 'Live feed',         unique: lu };
  if (iv.length)                  return { values: iv, mode: 'SESSION HOLD',      source: labels.intraday || 'Intraday',       unique: iu };
  if (dv.length)                  return { values: dv, mode: 'DAILY HOLD',        source: labels.daily || 'Daily trend',       unique: du };
  return { values: [], mode: 'UNAVAILABLE', source: 'No data', unique: 0 };
}

// ── SYMBOL MAPS ───────────────────────────────────────────────
// Yahoo Finance symbols for Indian + global markets
// Data sources: Yahoo Finance only — no TwelveData, no external paid API
const SYMBOLS = {
  'NIFTY:NSE':      '^NSEI',
  'SENSEX:BSE':     '^BSESN',
  'BANKNIFTY:NSE':  '^NSEBANK',
  'RELIANCE:NSE':   'RELIANCE.NS',
  'TCS:NSE':        'TCS.NS',
  'INFY:NSE':       'INFY.NS',
  'HDFCBANK:NSE':   'HDFCBANK.NS',
  'ICICIBANK:NSE':  'ICICIBANK.NS',
  'SBIN:NSE':       'SBIN.NS',
  'WIPRO:NSE':      'WIPRO.NS',
  'TATAMOTORS:NSE': 'TATAMOTORS.NS',
  'TATASTEEL:NSE':  'TATASTEEL.NS',
  'ADANIENT:NSE':   'ADANIENT.NS',
  'USD/INR:Forex':  'INR=X',
  'XAU/USD:Forex':  'GC=F',
  'WTI:Commodity':  'CL=F',
  'IN10Y:Bond':     '^IN10YT=RR',
};

const GLOBAL = {
  'SP500':     { yahoo: '^GSPC',      label: 'S&P 500',      region: 'USA'  },
  'DOW':       { yahoo: '^DJI',       label: 'Dow Jones',    region: 'USA'  },
  'NASDAQ':    { yahoo: '^IXIC',      label: 'Nasdaq',       region: 'USA'  },
  'RUSSEL':    { yahoo: '^RUT',       label: 'Russell 2000', region: 'USA'  },
  'VIX':       { yahoo: '^VIX',       label: 'CBOE VIX',     region: 'USA'  },
  'US10Y':     { yahoo: '^TNX',       label: 'US 10Y Yield', region: 'USA'  },
  'FTSE100':   { yahoo: '^FTSE',      label: 'FTSE 100',     region: 'UK'   },
  'FTSE250':   { yahoo: '^FTMC',      label: 'FTSE 250',     region: 'UK'   },
  'GBPUSD':    { yahoo: 'GBPUSD=X',   label: 'GBP/USD',      region: 'UK'   },
  'DAX':       { yahoo: '^GDAXI',     label: 'DAX',          region: 'EU'   },
  'CAC40':     { yahoo: '^FCHI',      label: 'CAC 40',       region: 'EU'   },
  'EURO50':    { yahoo: '^STOXX50E',  label: 'Euro Stoxx 50',region: 'EU'   },
  'EURUSD':    { yahoo: 'EURUSD=X',   label: 'EUR/USD',      region: 'EU'   },
  'NIKKEI':    { yahoo: '^N225',      label: 'Nikkei 225',   region: 'ASIA' },
  'HANGSENG':  { yahoo: '^HSI',       label: 'Hang Seng',    region: 'ASIA' },
  'SHANGHAI':  { yahoo: '000001.SS',  label: 'Shanghai',     region: 'ASIA' },
  'KOSPI':     { yahoo: '^KS11',      label: 'KOSPI',        region: 'ASIA' },
  'ASX200':    { yahoo: '^AXJO',      label: 'ASX 200',      region: 'ASIA' },
  'GOLD':      { yahoo: 'GC=F',       label: 'Gold',         region: 'COMM' },
  'SILVER':    { yahoo: 'SI=F',       label: 'Silver',       region: 'COMM' },
  'CRUDE':     { yahoo: 'CL=F',       label: 'Crude WTI',    region: 'COMM' },
  'NATGAS':    { yahoo: 'NG=F',       label: 'Natural Gas',  region: 'COMM' },
  'COPPER':    { yahoo: 'HG=F',       label: 'Copper',       region: 'COMM' },
  'ALUMINIUM': { yahoo: 'ALI=F',      label: 'Aluminium',    region: 'COMM' },
  'BTC':       { yahoo: 'BTC-USD',    label: 'Bitcoin',      region: 'COMM' },
  'DXY':       { yahoo: 'DX-Y.NYB',   label: 'DXY Index',    region: 'COMM' },
};

// ── YAHOO FINANCE HELPERS ─────────────────────────────────────
async function cachedYahooQuote(symbol, ttlMs = TTL.QUOTE) {
  const key = `yf_quote_${symbol}`;
  if (isFresh(key, ttlMs)) return getCache(key).data;
  const data = await yf.quote(symbol);
  setCache(key, data);
  return data;
}

async function cachedYahooChart(symbol, query, ttlMs = TTL.QUOTE) {
  const key = `yf_chart_${symbol}_${Buffer.from(JSON.stringify(query)).toString('base64').slice(0, 32)}`;
  if (isFresh(key, ttlMs)) return getCache(key).data;
  const data = await yf.chart(symbol, query);
  setCache(key, data);
  return data;
}

function mapQuote(key, q) {
  return {
    symbol: key,
    close:          q.regularMarketPrice        ?? 0,
    price:          q.regularMarketPrice        ?? 0,
    change:         q.regularMarketChange       ?? 0,
    percent_change: q.regularMarketChangePercent ?? 0,
    open:           q.regularMarketOpen         ?? 0,
    high:           q.regularMarketDayHigh      ?? 0,
    low:            q.regularMarketDayLow       ?? 0,
    volume:         q.regularMarketVolume       ?? 0,
    marketCap:      q.marketCap                 ?? null,
    week52High:     q.fiftyTwoWeekHigh          ?? 0,
    week52Low:      q.fiftyTwoWeekLow           ?? 0,
    name:           q.longName || q.shortName   || key,
    stale:          false,
    source:         'Yahoo Finance',
    freshness:      'DELAYED 15m',  // Yahoo free tier is always delayed
  };
}

function markStale(obj) {
  const out = {};
  for (const k of Object.keys(obj)) out[k] = { ...obj[k], stale: true, freshness: 'FALLBACK' };
  return out;
}

// ── HTML TOKEN INJECTION (Removed for Security) ───────────────
// API_SECRET is no longer injected into HTML.
// Frontend relies safely on CORS Origin / Referer validation.

// ── PAGE ROUTES ───────────────────────────────────────────────
function sendBridgeHome(res) { res.sendFile(BRIDGE_HOME_FILE); }

app.get('/',          (req, res) => sendBridgeHome(res));
app.get('/bridge',    (req, res) => sendBridgeHome(res));
app.get('/terminal',  (req, res) => res.sendFile(DALAL_INDEX_FILE));

// Static assets (no auth needed)
app.get('/bridge-app.js',       (req, res) => res.type('application/javascript').sendFile(BRIDGE_APP_FILE));
app.get('/bridge-styles.css',   (req, res) => res.type('text/css').sendFile(BRIDGE_STYLES_FILE));
app.get('/switcher-widget.html',(req, res) => res.type('text/html').sendFile(SWITCHER_WIDGET_FILE));
app.get('/app.js',              (req, res) => res.type('application/javascript').sendFile(DALAL_APP_FILE));
app.get('/app.css',             (req, res) => res.type('text/css').sendFile(DALAL_STYLES_FILE));


// ══════════════════════════════════════════════════════════════
// DATA ENDPOINTS
// All routes below require the x-dalal-token header (apiAuth)
// ══════════════════════════════════════════════════════════════

// ── QUOTES ───────────────────────────────────────────────────
async function getDashboardQuotesData() {
  if (isFresh('quotes', TTL.QUOTE)) return getCache('quotes').data;
  const keys = Object.keys(SYMBOLS);
  const results = await Promise.allSettled(keys.map(k => cachedYahooQuote(SYMBOLS[k])));
  const output = {};
  keys.forEach((key, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      output[key] = mapQuote(key, r.value);
      if (key === 'NIFTY:NSE')     pushSeriesPoint(microHistory.nifty,  output[key].price);
      if (key === 'USD/INR:Forex') pushSeriesPoint(microHistory.usdinr, output[key].price);
      if (key === 'WTI:Commodity') pushSeriesPoint(microHistory.crude,  output[key].price);
      if (key === 'IN10Y:Bond')    pushSeriesPoint(microHistory.gsec,   output[key].price);
    } else {
      const stale = getCache('quotes')?.data?.[key];
      if (stale) output[key] = { ...stale, stale: true, freshness: 'FALLBACK' };
    }
  });
  // Fallback G-Sec if primary fails
  if (!output['IN10Y:Bond']) {
    for (const sym of ['^IN10YT=RR', '^TNX']) {
      try {
        const qb = await cachedYahooQuote(sym);
        output['IN10Y:Bond'] = { ...mapQuote('IN10Y:Bond', qb), proxy: sym === '^TNX', freshness: sym === '^TNX' ? 'PROXY (US 10Y)' : 'DELAYED 15m' };
        pushSeriesPoint(microHistory.gsec, output['IN10Y:Bond'].price);
        break;
      } catch { /**/ }
    }
  }
  setCache('quotes', output);
  return output;
}

app.get('/api/quotes', async (req, res) => {
  setApiCacheHeaders(res, 10, 30);
  try {
    res.json(await getDashboardQuotesData());
  } catch (e) {
    const stale = getCache('quotes');
    if (stale) return res.json(markStale(stale.data));
    res.status(500).json({ error: e.message });
  }
});

// ── SINGLE QUOTE ─────────────────────────────────────────────
app.get('/api/quote/:symbol', async (req, res) => {
  setApiCacheHeaders(res, 10, 30);
  const sym = req.params.symbol.toUpperCase();
  const key  = `single_quote_${sym}`;
  if (isFresh(key, TTL.QUOTE)) return res.json(getCache(key).data);
  try {
    const yahooSym = SYMBOLS[`${sym}:NSE`] || SYMBOLS[sym]
      || (sym.includes('.') || sym.startsWith('^') ? sym : `${sym}.NS`);
    const q   = await cachedYahooQuote(yahooSym);
    const out = mapQuote(sym, q);
    setCache(key, out);
    res.json(out);
  } catch (e) {
    const stale = getCache(key);
    if (stale) return res.json({ ...stale.data, stale: true, freshness: 'FALLBACK' });
    res.status(500).json({ error: e.message });
  }
});

// ── GLOBAL MARKETS ────────────────────────────────────────────
async function getGlobalData() {
  if (isFresh('global', TTL.GLOBAL)) return getCache('global').data;
  const keys    = Object.keys(GLOBAL);
  const results = await Promise.allSettled(keys.map(k => cachedYahooQuote(GLOBAL[k].yahoo)));
  const output  = {};
  keys.forEach((key, i) => {
    const r = results[i]; const meta = GLOBAL[key];
    if (r.status === 'fulfilled' && r.value) {
      const q = r.value;
      output[key] = {
        label:          meta.label,
        region:         meta.region,
        price:          q.regularMarketPrice         ?? 0,
        change:         q.regularMarketChange        ?? 0,
        percent_change: q.regularMarketChangePercent ?? 0,
        stale:          false,
        freshness:      'DELAYED 15m',
        source:         'Yahoo Finance',
      };
    } else {
      const stale = getCache('global')?.data?.[key];
      if (stale) output[key] = { ...stale, stale: true, freshness: 'FALLBACK' };
    }
  });
  setCache('global', output);
  return output;
}

app.get('/api/global', async (req, res) => {
  setApiCacheHeaders(res, 10, 30);
  try { res.json(await getGlobalData()); }
  catch (e) {
    const stale = getCache('global');
    if (stale) return res.json(markStale(stale.data));
    res.status(500).json({ error: e.message });
  }
});

// ── INDIA VIX ────────────────────────────────────────────────
// Labeled separately from CBOE VIX — non-negotiable per PROMPT.v2
async function getIndiaVixQuote() {
  if (isFresh('india_vix_quote', TTL.QUOTE)) return getCache('india_vix_quote').data;
  try {
    const q = await cachedYahooQuote('^INDIAVIX');
    const price = q.regularMarketPrice ?? 0;
    const out = {
      label:          'India VIX',        // always labeled as India VIX — never CBOE VIX
      source:         'NSE via Yahoo Finance',
      freshness:      'DELAYED 15m',
      price,
      change:         q.regularMarketChange        ?? 0,
      percent_change: q.regularMarketChangePercent ?? 0,
      previousClose:  q.regularMarketPreviousClose ?? 0,
      asOf:           new Date().toISOString(),
      stale:          false,
      status:         buildStatus('DELAYED 15m', 'NSE India VIX — Yahoo Finance'),
    };
    pushSeriesPoint(microHistory.vix, out.price);
    setCache('india_vix_quote', out);
    return out;
  } catch (e) {
    const stale = getCache('india_vix_quote')?.data;
    if (stale) return { ...stale, stale: true, freshness: 'FALLBACK', status: buildStatus('FALLBACK', 'NSE India VIX cache', { reason: e.message }) };
    return { label: 'India VIX', source: 'NSE via Yahoo Finance', freshness: 'UNAVAILABLE', price: 0, change: 0, percent_change: 0, asOf: null, stale: true, status: buildStatus('UNAVAILABLE', 'India VIX', { reason: e.message }) };
  }
}

app.get('/api/india-vix', async (req, res) => {
  try { res.json(await getIndiaVixQuote()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── NSE FII / DII ─────────────────────────────────────────────
let nseSessionCookie = '';
let nseSessionTs = 0;

async function getNseCookie() {
  if (nseSessionCookie && (Date.now() - nseSessionTs) < 10 * 60_000) return nseSessionCookie;
  const r = await fetch('https://www.nseindia.com', {
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const cookies = r.headers.get('set-cookie') || '';
  nseSessionCookie = cookies.split(',').map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  nseSessionTs = Date.now();
  return nseSessionCookie;
}

async function fetchNse(path) {
  const key = `nse_${path}`;
  if (isFresh(key, TTL.FIIDII)) return getCache(key).data;
  const cookie = await getNseCookie();
  const r = await fetch(`https://www.nseindia.com${path}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'Accept':     'application/json, text/plain, */*',
      'Referer':    'https://www.nseindia.com/',
      'Cookie':     cookie,
    },
  });
  if (!r.ok) throw new Error(`NSE ${r.status} for ${path}`);
  const data = await r.json();
  setCache(key, data);
  return data;
}

async function getFiiDiiData() {
  if (isFresh('fiidii', TTL.FIIDII)) return getCache('fiidii').data;
  const raw       = await fetchNse('/api/fiidiiTradeReact');
  const fetchedAt = new Date().toISOString();
  const result    = { fii: [], dii: [], fetchedAt };

  if (Array.isArray(raw)) {
    raw.forEach(row => {
      const entry = {
        date:  row.date  || row.DATE  || '',
        buy:   parseFloat(row.buyValue  || row.BUY_VALUE  || 0),
        sell:  parseFloat(row.sellValue || row.SELL_VALUE || 0),
        net:   parseFloat(row.netValue  || row.NET_VALUE  || 0),
      };
      const cat = (row.category || row.CATEGORY || '').toUpperCase();
      if (cat.includes('FII') || cat.includes('FPI')) result.fii.push(entry);
      else if (cat.includes('DII'))                   result.dii.push(entry);
    });
  }

  result.fii   = result.fii.slice(0, 10);
  result.dii   = result.dii.slice(0, 10);
  result.today = {
    fii_net: result.fii[0]?.net ?? null,
    dii_net: result.dii[0]?.net ?? null,
    date:    result.fii[0]?.date || result.dii[0]?.date || '',
  };
  // Freshness: FII/DII data is always EOD — never show as LIVE
  result.status = buildStatus('EOD', 'NSE fiidiiTradeReact', {
    sourceDate: result.today.date || null,
    fetchedAt,
    note: 'NSE publishes FII/DII data after market close — not intraday',
  });

  setCache('fiidii', result);
  return result;
}

app.get('/api/fiidii', async (req, res) => {
  setApiCacheHeaders(res, 10, 30);
  try { res.json(await getFiiDiiData()); }
  catch (e) {
    const stale = getCache('fiidii');
    if (stale) return res.json({ ...stale.data, stale: true, freshness: 'FALLBACK' });
    res.status(500).json({ error: e.message });
  }
});

// ── VIX SERIES (for sparkline) ────────────────────────────────
async function getIndiaVixSeries(points = 24) {
  if (isFresh('india_vix_series', TTL.FIIDII)) return getCache('india_vix_series').data;
  try {
    const to   = new Date();
    const from = new Date(Date.now() - 45 * 24 * 60 * 60_000);
    const raw  = await fetchNse(`/api/historical/vixhistory?from=${formatNseDate(from)}&to=${formatNseDate(to)}`);
    const rows = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
    const vals = rows
      .map(row => toFiniteNumber(row.CLOSE, row.Close, row.close, row.closePrice))
      .filter(v => Number.isFinite(v) && v > 0)
      .slice(-points);
    setCache('india_vix_series', vals);
    return vals;
  } catch { return []; }
}

async function fetchSeries(symbol, points = 24) {
  try {
    const chart = await cachedYahooChart(symbol, {
      period1:  new Date(Date.now() - 45 * 24 * 60 * 60_000),
      period2:  new Date(),
      interval: '1d',
    });
    return (chart?.quotes || [])
      .map(x => Number(x?.close))
      .filter(v => Number.isFinite(v) && v > 0)
      .slice(-points);
  } catch { return []; }
}

async function fetchIntradaySeries(symbol, points = 48, interval = '5m', lookbackDays = 5) {
  const key = `intraday_${symbol}_${interval}`;
  if (isFresh(key, TTL.QUOTE)) return getCache(key).data;
  try {
    const chart = await cachedYahooChart(symbol, {
      period1:  new Date(Date.now() - lookbackDays * 24 * 60 * 60_000),
      period2:  new Date(),
      interval,
    });
    const vals = (Array.isArray(chart?.quotes) ? chart.quotes : [])
      .map(r => Number(r?.close))
      .filter(v => Number.isFinite(v) && v > 0)
      .slice(-points);
    setCache(key, vals);
    return vals;
  } catch { return []; }
}

app.get('/api/micro-series', async (req, res) => {
  setApiCacheHeaders(res, 10, 30);
  if (isFresh('micro_series', 5 * 60_000)) return res.json(getCache('micro_series').data);
  try {
    const [vixSeries, gsecSeries, indiaVix] = await Promise.all([
      getIndiaVixSeries(24),
      fetchSeries('^IN10YT=RR', 24),
      getIndiaVixQuote(),
    ]);
    const out = {
      vix:  vixSeries.length  ? vixSeries  : microHistory.vix.slice(-24),
      gsec: gsecSeries.length ? gsecSeries : microHistory.gsec.slice(-24),
      meta: {
        vix:  indiaVix?.stale
          ? buildStatus('FALLBACK', 'NSE India VIX cache')
          : buildStatus('DELAYED 15m', 'NSE India VIX — Yahoo Finance'),
        gsec: buildStatus('DELAYED 15m', 'Yahoo Finance India 10Y Bond'),
      },
      spot: {
        vix:  indiaVix?.price ?? null,
        gsec: gsecSeries.length ? gsecSeries[gsecSeries.length - 1] : null,
      },
      ts: new Date().toISOString(),
    };
    setCache('micro_series', out);
    res.json(out);
  } catch (e) {
    const stale = getCache('micro_series');
    if (stale) return res.json(stale.data);
    res.status(500).json({ error: e.message });
  }
});

// ── FAST INDICES (10s TTL — dashboard primary load) ───────────
const FAST_INDEX_SYMBOLS = {
  'NIFTY:NSE':     SYMBOLS['NIFTY:NSE'],
  'SENSEX:BSE':    SYMBOLS['SENSEX:BSE'],
  'BANKNIFTY:NSE': SYMBOLS['BANKNIFTY:NSE'],
};

async function getIndicesFastData() {
  const now = Date.now();
  if (indicesFastCache && (now - indicesFastLastUpdated) < TTL.INDICES_FAST) return indicesFastCache;
  if (indicesFastInFlight) return indicesFastInFlight;

  indicesFastInFlight = (async () => {
    try {
      const keys    = Object.keys(FAST_INDEX_SYMBOLS);
      const results = await Promise.allSettled(keys.map(k => cachedYahooQuote(FAST_INDEX_SYMBOLS[k])));
      const indices = {};
      keys.forEach((key, i) => {
        const r = results[i];
        if (r.status === 'fulfilled' && r.value) {
          indices[key] = mapQuote(key, r.value);
        } else {
          const stale = indicesFastCache?.indices?.[key];
          if (stale) indices[key] = { ...stale, stale: true, freshness: 'FALLBACK' };
        }
      });
      indicesFastCache = {
        indices,
        ts:          new Date().toISOString(),
        source:      'Yahoo Finance',
        freshness:   'DELAYED 15m',
        lastUpdated: Date.now(),
      };
      indicesFastLastUpdated = Date.now();
      setCache('indices_fast', indicesFastCache);
      return indicesFastCache;
    } catch (err) {
      console.error('indices-fast error:', err.message);
      return indicesFastCache || { indices: {}, ts: null, source: 'error', freshness: 'UNAVAILABLE' };
    } finally {
      indicesFastInFlight = null;
    }
  })();

  return indicesFastInFlight;
}

app.get('/api/indices-fast', async (req, res) => {
  setApiCacheHeaders(res, 10, 30);
  res.json(await getIndicesFastData());
});

// ── SENTIMENT HELPERS ─────────────────────────────────────────
function computeMarketSentiment({ fii, dii, indexChange, vix }) {
  const fiiNet    = Number.isFinite(Number(fii))         ? Number(fii)         : 0;
  const diiNet    = Number.isFinite(Number(dii))         ? Number(dii)         : 0;
  const niftyMove = Number.isFinite(Number(indexChange)) ? Number(indexChange) : 0;
  const vixLevel  = Number.isFinite(Number(vix))         ? Number(vix)         : 0;

  let bias = 'NEUTRAL', strength = 'WEAK', reason = 'No clear institutional edge in the current tape';

  if (fiiNet > 0 && niftyMove > 0)         { bias = 'BULLISH';  strength = 'MODERATE'; reason = 'FII buying with positive market momentum'; }
  if (fiiNet < 0 && niftyMove < 0)         { bias = 'BEARISH';  strength = 'MODERATE'; reason = 'FII selling with negative market momentum'; }
  if (fiiNet < 0 && diiNet > 0)            { bias = 'MIXED';    strength = 'WEAK';     reason = 'DII absorbing FII selling pressure'; }
  if (vixLevel > 18 && fiiNet < 0)         { bias = 'BEARISH';  strength = 'STRONG';   reason = 'Rising volatility with institutional selling'; }

  return { bias, strength, reason, fii: fiiNet, dii: diiNet, vix: vixLevel, indexChange: niftyMove };
}

function computeOvernightImpact({ dow, nasdaq, sp500, usdChange, crudeChange }) {
  const dowPct    = Number.isFinite(Number(dow))         ? Number(dow)         : 0;
  const nasdaqPct = Number.isFinite(Number(nasdaq))      ? Number(nasdaq)      : 0;
  const spxPct    = Number.isFinite(Number(sp500))       ? Number(sp500)       : 0;
  const dxyPct    = Number.isFinite(Number(usdChange))   ? Number(usdChange)   : 0;
  const crudePct  = Number.isFinite(Number(crudeChange)) ? Number(crudeChange) : 0;

  const usAverage = (dowPct + nasdaqPct + spxPct) / 3;
  const reasons = [];
  let score = 0;

  if (usAverage <= -0.35) { score -= 1; reasons.push('US markets closed lower'); }
  else if (usAverage >= 0.35) { score += 1; reasons.push('US markets closed higher'); }
  if (dxyPct >= 0.2)  { score -= 1; reasons.push('dollar strengthened'); }
  else if (dxyPct <= -0.2) { score += 1; reasons.push('dollar eased'); }
  if (crudePct >= 1)  { score -= 1; reasons.push('crude moved higher'); }
  else if (crudePct <= -1) { score += 1; reasons.push('crude moved lower'); }

  return {
    impact: score > 0 ? 'POSITIVE' : score < 0 ? 'NEGATIVE' : 'NEUTRAL',
    reason: reasons.length ? reasons.join(', ') : 'Overnight inputs are balanced',
    inputs: { dow: dowPct, nasdaq: nasdaqPct, sp500: spxPct, usdChange: dxyPct, crudeChange: crudePct },
  };
}

function computeRisk({ marketBias, overnightImpact, indiaVix, globalVix }) {
  const vixLevel = toFiniteNumber(indiaVix, globalVix) ?? 0;
  let level = 'MODERATE', reason = 'Risk is balanced across volatility and positioning';
  if (vixLevel >= 20 || (marketBias?.bias === 'BEARISH' && marketBias?.strength === 'STRONG'))
    { level = 'HIGH';     reason = 'Volatility is elevated and positioning is defensive'; }
  else if (vixLevel >= 16 || marketBias?.bias === 'MIXED' || overnightImpact?.impact === 'NEGATIVE')
    { level = 'ELEVATED'; reason = 'Volatility and overnight inputs warrant a cautious stance'; }
  else if (vixLevel > 0 && vixLevel < 14 && marketBias?.bias === 'BULLISH')
    { level = 'LOW';      reason = 'Volatility is contained and the tape remains constructive'; }
  return { level, reason, vix: vixLevel };
}

function computeDriver({ fiiDii, quotes, global, overnightImpact }) {
  const fiiNet    = toFiniteNumber(fiiDii?.today?.fii_net)               ?? 0;
  const indexMove = toFiniteNumber(quotes?.['NIFTY:NSE']?.percent_change) ?? 0;
  const dxyMove   = toFiniteNumber(global?.DXY?.percent_change)           ?? 0;
  const crudeMove = toFiniteNumber(quotes?.['WTI:Commodity']?.percent_change) ?? 0;

  if (Math.abs(fiiNet) >= 1500) return { label: 'Institutional Flows',  reason: fiiNet >= 0 ? 'FII buying is driving the session tone' : 'FII selling is driving the session tone', value: fiiNet };
  if (overnightImpact?.impact && overnightImpact.impact !== 'NEUTRAL')   return { label: 'Overnight Setup',        reason: overnightImpact.reason, value: overnightImpact.impact };
  if (Math.abs(dxyMove) >= 0.2 || Math.abs(crudeMove) >= 1)             return { label: 'Macro Tape',             reason: `Dollar ${dxyMove >= 0 ? 'firmness' : 'softness'} and crude ${crudeMove >= 0 ? 'strength' : 'softness'} are shaping risk`, value: { dxy: dxyMove, crude: crudeMove } };
  return { label: 'Index Momentum', reason: indexMove >= 0 ? 'Index momentum remains constructive' : 'Index momentum remains soft', value: indexMove };
}

// ── INDIA SENTIMENT ───────────────────────────────────────────
async function getIndiaSentiment() {
  if (isFresh('india_sentiment', TTL.SENTIMENT)) return getCache('india_sentiment').data;
  try {
    const [vixData, quotesData, fiiData] = await Promise.allSettled([
      getIndiaVixQuote(),
      getDashboardQuotesData(),
      getFiiDiiData(),
    ]);
    const vix    = vixData.status    === 'fulfilled' ? vixData.value    : null;
    const quotes = quotesData.status === 'fulfilled' ? quotesData.value : {};
    const fii    = fiiData.status    === 'fulfilled' ? fiiData.value    : {};

    const vixVal     = Number(vix?.price ?? 0);
    const niftyPct   = Number(quotes['NIFTY:NSE']?.percent_change ?? 0);
    const fiiNet     = Number(fii?.today?.fii_net ?? 0);
    const usdinrPct  = Number(quotes['USD/INR:Forex']?.percent_change ?? 0);

    let score = 50;
    if (vixVal > 0) score += vixVal < 12 ? 20 : vixVal < 16 ? 10 : vixVal < 20 ? 0 : vixVal < 25 ? -15 : -20;
    score += niftyPct > 1.5 ? 15 : niftyPct > 0.5 ? 8 : niftyPct > 0 ? 3 : niftyPct > -0.5 ? -3 : niftyPct > -1.5 ? -8 : -15;
    score += fiiNet > 3000 ? 10 : fiiNet > 1000 ? 5 : fiiNet > 0 ? 2 : fiiNet > -1000 ? -2 : fiiNet > -3000 ? -5 : -10;
    score += usdinrPct < -0.3 ? 5 : usdinrPct > 0.3 ? -5 : 0;
    score  = Math.max(0, Math.min(100, Math.round(score)));

    const out = {
      score,
      rating: score >= 75 ? 'extreme greed' : score >= 60 ? 'greed' : score >= 45 ? 'neutral' : score >= 25 ? 'fear' : 'extreme fear',
      components: {
        vix:   { value: vixVal,    label: 'India VIX' },
        nifty: { value: niftyPct,  label: 'Nifty Momentum' },
        fii:   { value: fiiNet,    label: 'FII Flow (Cr)' },
        inr:   { value: usdinrPct, label: 'INR Change' },
      },
      source:   'Dalal Wire composite',
      freshness: 'LIVE',
      ts:       new Date().toISOString(),
    };
    setCache('india_sentiment', out);
    return out;
  } catch (e) {
    console.warn('India sentiment failed:', e.message);
    return null;
  }
}

// ── FEAR & GREED (CNN) ────────────────────────────────────────
async function getFearGreedData() {
  if (isFresh('feargreed', TTL.SENTIMENT)) return getCache('feargreed').data;
  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000);
    const r = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata/', {
      signal:  controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DalalWire/2.0)',
        'Accept':     'application/json',
        'Referer':    'https://www.cnn.com/markets/fear-and-greed',
        'Origin':     'https://www.cnn.com',
      },
    });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`CNN API ${r.status}`);
    const raw     = await r.json();
    const score   = Number(raw?.fear_and_greed?.score ?? 0);
    const rating  = String(raw?.fear_and_greed?.rating ?? 'neutral');
    const histRaw = raw?.fear_and_greed_historical?.data || [];
    const history = histRaw.slice(-30).map(e => ({
      score: Number(e?.score ?? 0),
      date:  e?.timestamp ? new Date(e.timestamp * 1000).toISOString().slice(0, 10) : '',
    })).filter(e => e.score > 0);

    const indicators = {};
    const ri = raw?.fear_and_greed?.indicators || {};
    ['market_momentum_sp500', 'stock_price_strength', 'stock_price_breadth', 'put_call_options', 'market_volatility_vix', 'safe_haven_demand', 'junk_bond_demand'].forEach(k => {
      if (ri[k]) indicators[k] = { score: Number(ri[k].score ?? 0), rating: String(ri[k].rating ?? ''), label: ri[k].label || k };
    });

    const out = {
      score,
      rating,
      prevClose:    Number(raw?.fear_and_greed?.previous_close   ?? score),
      oneWeekAgo:   Number(raw?.fear_and_greed?.previous_1_week  ?? score),
      oneMonthAgo:  Number(raw?.fear_and_greed?.previous_1_month ?? score),
      history,
      indicators,
      source:    'CNN Money',
      freshness: 'LIVE',
      ts:        new Date().toISOString(),
    };
    setCache('feargreed', out);
    return out;
  } catch (e) {
    console.warn('Fear & Greed fetch failed:', e.message);
    const stale = getCache('feargreed');
    if (stale) return { ...stale.data, stale: true, freshness: 'FALLBACK' };
    return null;
  }
}

// ── SENTIMENT ENDPOINT ────────────────────────────────────────
app.get('/api/sentiment', async (req, res) => {
  if (isFresh('sentiment_combined', TTL.SENTIMENT)) return res.json(getCache('sentiment_combined').data);
  try {
    const [fng, india] = await Promise.allSettled([getFearGreedData(), getIndiaSentiment()]);
    const out = {
      global: fng.status   === 'fulfilled' ? fng.value   : null,
      india:  india.status === 'fulfilled' ? india.value : null,
      ts:     new Date().toISOString(),
    };
    setCache('sentiment_combined', out);
    res.json(out);
  } catch (e) {
    const stale = getCache('sentiment_combined');
    if (stale) return res.json(stale.data);
    res.status(500).json({ error: e.message });
  }
});

// ── SLOW DASHBOARD BUNDLE ─────────────────────────────────────
async function getDashboardSlowData() {
  const now = Date.now();
  if (dashboardSlowCache && (now - dashboardSlowLastUpdated) < TTL.SLOW) return dashboardSlowCache;
  if (dashboardSlowInFlight) return dashboardSlowInFlight;

  dashboardSlowInFlight = (async () => {
    try {
      const slowQuoteMap = {
        'NIFTY:NSE':     SYMBOLS['NIFTY:NSE'],
        'USD/INR:Forex': SYMBOLS['USD/INR:Forex'],
        'XAU/USD:Forex': SYMBOLS['XAU/USD:Forex'],
        'WTI:Commodity': SYMBOLS['WTI:Commodity'],
        'IN10Y:Bond':    SYMBOLS['IN10Y:Bond'],
      };
      const qKeys = Object.keys(slowQuoteMap);

      const [qResults, globalRes, fiiDiiRes, vixDailyRes, gsecDailyRes, indiaVixRes, sentimentRes] = await Promise.all([
        Promise.allSettled(qKeys.map(k => cachedYahooQuote(slowQuoteMap[k]))),
        getGlobalData().catch(() => getCache('global')?.data || {}),
        getFiiDiiData().catch(() => getCache('fiidii')?.data || {}),
        getIndiaVixSeries(24).catch(() => []),
        fetchSeries('^IN10YT=RR', 24).catch(() => []),
        getIndiaVixQuote().catch(() => null),
        getIndiaSentiment().catch(() => null),
      ]);

      const quotes = {};
      qKeys.forEach((key, i) => {
        const r = qResults[i];
        if (r.status === 'fulfilled' && r.value) quotes[key] = mapQuote(key, r.value);
      });

      const global       = globalRes  || {};
      const fiiDii       = fiiDiiRes  || {};
      const indiaVix     = indiaVixRes || null;
      const vixDaily     = Array.isArray(vixDailyRes)  ? vixDailyRes  : [];
      const gsecDaily    = Array.isArray(gsecDailyRes) ? gsecDailyRes : [];
      const indiaSent    = sentimentRes || null;

      const marketBias      = computeMarketSentiment({ fii: fiiDii?.today?.fii_net, dii: fiiDii?.today?.dii_net, indexChange: quotes['NIFTY:NSE']?.percent_change, vix: indiaVix?.price });
      const overnightImpact = computeOvernightImpact({ dow: global?.DOW?.percent_change, nasdaq: global?.NASDAQ?.percent_change, sp500: global?.SP500?.percent_change, usdChange: global?.DXY?.percent_change, crudeChange: quotes['WTI:Commodity']?.percent_change });
      const risk            = computeRisk({ marketBias, overnightImpact, indiaVix: indiaVix?.price, globalVix: global?.VIX?.price });
      const driver          = computeDriver({ fiiDii, quotes, global, overnightImpact });

      dashboardSlowCache = {
        sentiment: { ...marketBias, overnightImpact, india: indiaSent },
        risk,
        driver,
        fiiDii: {
          fii_net:     fiiDii?.today?.fii_net ?? null,
          dii_net:     fiiDii?.today?.dii_net ?? null,
          date:        fiiDii?.today?.date || '',
          status:      fiiDii?.status || buildStatus('UNAVAILABLE', 'NSE FII/DII'),
          fii_history: (fiiDii?.fii || []).slice(0, 5),
          dii_history: (fiiDii?.dii || []).slice(0, 5),
        },
        vix: {
          spot:   indiaVix,
          series: vixDaily.slice(-24),
          status: indiaVix?.status || buildStatus('UNAVAILABLE', 'India VIX'),
        },
        macro: {
          usdinr:    quotes['USD/INR:Forex'] || null,
          gold:      quotes['XAU/USD:Forex'] || null,
          crude:     quotes['WTI:Commodity'] || null,
          gsec:      quotes['IN10Y:Bond']    || null,
          dxy:       global.DXY              || null,
          vix:       global.VIX              || null,
          gsecDaily: gsecDaily.slice(-24),
        },
        lastUpdated: Date.now(),
        ts:          new Date().toISOString(),
      };
      dashboardSlowLastUpdated = Date.now();
      setCache('dashboard_slow', dashboardSlowCache);
      return dashboardSlowCache;
    } catch (err) {
      console.error('dashboard-slow error:', err.message);
      return dashboardSlowCache || getCache('dashboard_slow')?.data || {};
    } finally {
      dashboardSlowInFlight = null;
    }
  })();

  return dashboardSlowInFlight;
}

app.get('/api/dashboard-slow', async (req, res) => {
  setApiCacheHeaders(res, 10, 30);
  res.json(await getDashboardSlowData());
});

// ── DASHBOARD AGGREGATE (legacy compat) ───────────────────────
app.get('/api/dashboard', async (req, res) => {
  setApiCacheHeaders(res, 10, 30);
  try {
    const [quotes, slow, global] = await Promise.allSettled([
      getDashboardQuotesData(),
      getDashboardSlowData(),
      getGlobalData(),
    ]);
    const q = quotes.status === 'fulfilled' ? quotes.value : {};
    const s = slow.status   === 'fulfilled' ? slow.value   : {};
    const g = global.status === 'fulfilled' ? global.value : {};
    res.json({ quotes: q, ...s, _globalFull: g, ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── HEATMAP ───────────────────────────────────────────────────
const NIFTY50 = {
  'RELIANCE.NS':   { label: 'RELIANCE',  sector: 'Energy',    mcap: 19.2 },
  'TCS.NS':        { label: 'TCS',        sector: 'IT',        mcap: 13.8 },
  'HDFCBANK.NS':   { label: 'HDFC BANK', sector: 'Banks',     mcap: 12.1 },
  'BHARTIARTL.NS': { label: 'AIRTEL',    sector: 'Telecom',   mcap: 9.4  },
  'ICICIBANK.NS':  { label: 'ICICI',     sector: 'Banks',     mcap: 8.9  },
  'INFOSYS.NS':    { label: 'INFY',      sector: 'IT',        mcap: 7.8  },
  'SBIN.NS':       { label: 'SBI',       sector: 'Banks',     mcap: 7.1  },
  'HINDUNILVR.NS': { label: 'HUL',       sector: 'FMCG',      mcap: 6.2  },
  'ITC.NS':        { label: 'ITC',       sector: 'FMCG',      mcap: 5.8  },
  'LT.NS':         { label: 'L&T',       sector: 'Infra',     mcap: 5.4  },
  'BAJFINANCE.NS': { label: 'BAJ FIN',   sector: 'Finance',   mcap: 5.1  },
  'KOTAKBANK.NS':  { label: 'KOTAK',     sector: 'Banks',     mcap: 4.9  },
  'AXISBANK.NS':   { label: 'AXIS',      sector: 'Banks',     mcap: 4.7  },
  'ASIANPAINT.NS': { label: 'ASIAN PT',  sector: 'Paints',    mcap: 4.5  },
  'MARUTI.NS':     { label: 'MARUTI',    sector: 'Auto',      mcap: 4.3  },
  'WIPRO.NS':      { label: 'WIPRO',     sector: 'IT',        mcap: 4.1  },
  'HCLTECH.NS':    { label: 'HCL TECH',  sector: 'IT',        mcap: 4.0  },
  'SUNPHARMA.NS':  { label: 'SUN PH',    sector: 'Pharma',    mcap: 3.9  },
  'ULTRACEMCO.NS': { label: 'ULTRACEM',  sector: 'Cement',    mcap: 3.7  },
  'TITAN.NS':      { label: 'TITAN',     sector: 'Consumer',  mcap: 3.5  },
  'TATAMOTORS.NS': { label: 'TATA MOT',  sector: 'Auto',      mcap: 3.4  },
  'NTPC.NS':       { label: 'NTPC',      sector: 'Energy',    mcap: 3.3  },
  'POWERGRID.NS':  { label: 'PWR GRID',  sector: 'Energy',    mcap: 3.1  },
  'ADANIENT.NS':   { label: 'ADANI ENT', sector: 'Conglom',   mcap: 3.0  },
  'ADANIPORTS.NS': { label: 'ADANI PRT', sector: 'Ports',     mcap: 2.9  },
  'COALINDIA.NS':  { label: 'COAL IND',  sector: 'Energy',    mcap: 2.8  },
  'ONGC.NS':       { label: 'ONGC',      sector: 'Energy',    mcap: 2.7  },
  'TATASTEEL.NS':  { label: 'TATA STL',  sector: 'Metal',     mcap: 2.6  },
  'JSWSTEEL.NS':   { label: 'JSW STL',   sector: 'Metal',     mcap: 2.5  },
  'HINDALCO.NS':   { label: 'HINDALCO',  sector: 'Metal',     mcap: 2.4  },
  'TECHM.NS':      { label: 'TECH M',    sector: 'IT',        mcap: 2.3  },
  'BAJAJFINSV.NS': { label: 'BAJ FINSV', sector: 'Finance',   mcap: 2.2  },
  'DRREDDY.NS':    { label: 'DR REDDY',  sector: 'Pharma',    mcap: 2.1  },
  'CIPLA.NS':      { label: 'CIPLA',     sector: 'Pharma',    mcap: 2.0  },
  'DIVISLAB.NS':   { label: "DIVI'S",    sector: 'Pharma',    mcap: 1.9  },
  'EICHERMOT.NS':  { label: 'EICHER',    sector: 'Auto',      mcap: 1.8  },
  'HEROMOTOCO.NS': { label: 'HERO MOTO', sector: 'Auto',      mcap: 1.7  },
  'NESTLEIND.NS':  { label: 'NESTLE',    sector: 'FMCG',      mcap: 1.6  },
  'BRITANNIA.NS':  { label: 'BRITANIA',  sector: 'FMCG',      mcap: 1.5  },
  'APOLLOHOSP.NS': { label: 'APOLLO H',  sector: 'Health',    mcap: 1.4  },
  'GRASIM.NS':     { label: 'GRASIM',    sector: 'Cement',    mcap: 1.3  },
  'BPCL.NS':       { label: 'BPCL',      sector: 'Energy',    mcap: 1.2  },
  'INDUSINDBK.NS': { label: 'INDUSIND',  sector: 'Banks',     mcap: 1.1  },
  'TATACONSUM.NS': { label: 'TATA CONS', sector: 'FMCG',      mcap: 1.0  },
  'SBILIFE.NS':    { label: 'SBI LIFE',  sector: 'Insurance', mcap: 0.9  },
  'HDFCLIFE.NS':   { label: 'HDFC LIFE', sector: 'Insurance', mcap: 0.8  },
  'SHREECEM.NS':   { label: 'SHREE CEM', sector: 'Cement',    mcap: 0.6  },
  'LTIM.NS':       { label: 'LTIMindtree', sector: 'IT',      mcap: 0.5  },
  'TRENT.NS':      { label: 'TRENT',     sector: 'Retail',    mcap: 0.4  },
};

const HEATMAP_INDICES = {
  'NIFTY 50':   { yahoo: '^NSEI',              sector: 'India', mcap: 10.0 },
  'SENSEX':     { yahoo: '^BSESN',             sector: 'India', mcap: 9.0  },
  'BANK NIFTY': { yahoo: '^NSEBANK',           sector: 'India', mcap: 8.2  },
  'NIFTY IT':   { yahoo: '^CNXIT',             sector: 'India', mcap: 6.3  },
  'NIFTY MID':  { yahoo: 'NIFTY_MID_SELECT.NS',sector: 'India', mcap: 5.2  },
  'S&P 500':    { yahoo: '^GSPC',              sector: 'USA',   mcap: 7.4  },
  'NASDAQ':     { yahoo: '^IXIC',              sector: 'USA',   mcap: 7.0  },
  'DOW':        { yahoo: '^DJI',               sector: 'USA',   mcap: 6.6  },
  'FTSE 100':   { yahoo: '^FTSE',              sector: 'UK',    mcap: 5.2  },
  'DAX':        { yahoo: '^GDAXI',             sector: 'EU',    mcap: 5.0  },
  'NIKKEI':     { yahoo: '^N225',              sector: 'Japan', mcap: 4.8  },
  'HANG SENG':  { yahoo: '^HSI',               sector: 'HK',    mcap: 4.5  },
  'SHANGHAI':   { yahoo: '000001.SS',          sector: 'China', mcap: 4.2  },
};

app.get('/api/heatmap', async (req, res) => {
  const setName = (req.query.set || 'nifty').toString().toLowerCase();
  const key     = `heatmap_${setName}`;
  if (isFresh(key, TTL.HEATMAP)) return res.json(getCache(key).data);
  try {
    const isIndices = setName === 'indices' || setName === 'global';
    const source    = isIndices ? HEATMAP_INDICES : NIFTY50;
    const syms      = Object.keys(source);
    const results   = await Promise.allSettled(syms.map(s => cachedYahooQuote(isIndices ? source[s].yahoo : s)));
    const output    = [];
    syms.forEach((sym, i) => {
      const r = results[i]; const meta = source[sym];
      if (r.status === 'fulfilled' && r.value) {
        const q = r.value;
        output.push({
          sym:    isIndices ? sym : meta.label,
          sector: meta.sector,
          mcap:   meta.mcap,
          price:  q.regularMarketPrice         ?? 0,
          change: q.regularMarketChange        ?? 0,
          pct:    q.regularMarketChangePercent ?? 0,
        });
      }
    });
    setCache(key, output);
    res.json(output);
  } catch (e) {
    const stale = getCache(`heatmap_${setName}`);
    if (stale) return res.json(stale.data);
    res.status(500).json({ error: e.message });
  }
});

// ── MF / ETF — via MFAPI (free, no key) ──────────────────────
const mfapiQueue = [];
let mfapiActive = 0;
const MFAPI_MAX_CONCURRENT = 3;

function mfapiNext() {
  while (mfapiActive < MFAPI_MAX_CONCURRENT && mfapiQueue.length) {
    const { fn, resolve, reject } = mfapiQueue.shift();
    mfapiActive++;
    fn().then(resolve).catch(reject).finally(() => { mfapiActive--; mfapiNext(); });
  }
}

function mfapiThrottle(fn) {
  return new Promise((resolve, reject) => { mfapiQueue.push({ fn, resolve, reject }); mfapiNext(); });
}

async function fetchMfapi(url, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': 'DalalWire/2.0' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i < retries) await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
      else throw e;
    }
  }
}

app.get('/api/mfapi/search', async (req, res) => {
  const q = req.query.q || '';
  try {
    res.json(await fetchMfapi(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/mfapi/:code', async (req, res) => {
  const code = req.params.code;
  const key  = `mfapi_${code}`;
  if (isFresh(key, TTL.MFAPI)) return res.json(getCache(key).data);
  try {
    const data = await mfapiThrottle(() => fetchMfapi(`https://api.mfapi.in/mf/${code}`));
    setCache(key, data);
    res.json(data);
  } catch (e) {
    const stale = getCache(key);
    if (stale) return res.json(stale.data);
    res.status(500).json({ error: e.message });
  }
});

// ── NEWS (RSS + optional Newsdata.io) ─────────────────────────
const RSS_SOURCES = [
  { name: 'Economic Times',    url: 'https://economictimes.indiatimes.com/markets/rss.cms',                 cat: ['market', 'stocks', 'macro'] },
  { name: 'Economic Times',    url: 'https://economictimes.indiatimes.com/markets/stocks/rss.cms',          cat: ['stocks'] },
  { name: 'Moneycontrol',      url: 'https://www.moneycontrol.com/rss/latestnews.xml',                      cat: ['market', 'stocks', 'banks', 'sectors'] },
  { name: 'Moneycontrol',      url: 'https://www.moneycontrol.com/rss/marketreports.xml',                   cat: ['market'] },
  { name: 'Moneycontrol',      url: 'https://www.moneycontrol.com/rss/banking.xml',                         cat: ['banks'] },
  { name: 'LiveMint',          url: 'https://www.livemint.com/rss/markets',                                 cat: ['market', 'stocks'] },
  { name: 'LiveMint',          url: 'https://www.livemint.com/rss/economy',                                 cat: ['macro'] },
  { name: 'Business Standard', url: 'https://www.business-standard.com/rss/markets-106.rss',                cat: ['market', 'stocks'] },
  { name: 'Business Standard', url: 'https://www.business-standard.com/rss/economy-policy-102.rss',        cat: ['macro'] },
  { name: 'Business Standard', url: 'https://www.business-standard.com/rss/banking-104.rss',               cat: ['banks'] },
  { name: 'CNBC TV18',         url: 'https://www.cnbctv18.com/commonfeeds/v1/eng/rss/markets.xml',          cat: ['market', 'stocks'] },
  { name: 'CNBC TV18',         url: 'https://www.cnbctv18.com/commonfeeds/v1/eng/rss/economy.xml',          cat: ['macro'] },
  { name: 'Financial Express', url: 'https://www.financialexpress.com/market/feed/',                       cat: ['market', 'stocks'] },
  { name: 'Reuters Business',  url: 'https://feeds.reuters.com/reuters/businessNews',                      cat: ['global', 'macro'] },
  { name: 'Reuters Markets',   url: 'https://feeds.reuters.com/reuters/financialNews',                     cat: ['global', 'market'] },
  { name: 'Yahoo Finance',     url: 'https://finance.yahoo.com/news/rssindex',                             cat: ['global', 'stocks'] },
  { name: 'ET Tech',           url: 'https://economictimes.indiatimes.com/tech/rss.cms',                   cat: ['sectors'] },
  { name: 'ET Auto',           url: 'https://auto.economictimes.indiatimes.com/rss.cms',                   cat: ['sectors'] },
  { name: 'MC IT',             url: 'https://www.moneycontrol.com/rss/ittelecomsoftware.xml',              cat: ['sectors'] },
  { name: 'MC Pharma',         url: 'https://www.moneycontrol.com/rss/pharma.xml',                         cat: ['sectors'] },
  { name: 'MC Auto',           url: 'https://www.moneycontrol.com/rss/automobile.xml',                     cat: ['sectors'] },
  { name: 'Zee Business',      url: 'https://zeenews.india.com/rss/business.xml',                          cat: ['market', 'stocks'] },
  { name: 'NDTV Profit',       url: 'https://feeds.feedburner.com/ndtvprofit-latest',                      cat: ['market', 'stocks'] },
  { name: 'Hindu BizLine',     url: 'https://www.thehindubusinessline.com/markets/stocks/?service=rss',    cat: ['stocks'] },
];

const CAT_KEYWORDS = {
  market:  ['nifty', 'sensex', 'bse', 'nse', 'dalal', 'india market', 'stock market', 'indices', 'fii', 'dii', 'vix'],
  banks:   ['bank', 'rbi', 'hdfc', 'icici', 'sbi', 'kotak', 'axis', 'pnb', 'canara', 'interest rate', 'repo', 'nbfc', 'credit', 'npa'],
  sectors: ['it sector', 'pharma', 'auto', 'fmcg', 'metal', 'realty', 'energy', 'infra', 'telecom', 'defence', 'consumer', 'cement', 'steel'],
  macro:   ['inflation', 'cpi', 'gdp', 'economy', 'fiscal', 'rupee', 'dollar', 'fed', 'rbi policy', 'budget', 'trade deficit', 'crude'],
  stocks:  ['earnings', 'results', 'profit', 'revenue', 'q4', 'q3', 'quarterly', 'dividend', 'buyback', 'ipo', 'merger', 'acquisition', 'target price'],
  global:  ['wall street', 'nasdaq', 'dow jones', 's&p', 'ftse', 'nikkei', 'hang seng', 'dax', 'federal reserve', 'ecb', 'china', 'us economy', 'global market'],
};

function sentimentFromText(text) {
  const t = (text || '').toLowerCase();
  const bull = ['surge', 'gain', 'rise', 'rally', 'record', 'beat', 'profit', 'up ', 'growth', 'jump', 'soar', 'strong'];
  const bear = ['fall', 'drop', 'crash', 'loss', 'cut', 'decline', 'slump', 'weak', 'miss', 'down ', 'concern', 'risk'];
  const bs = bull.filter(w => t.includes(w)).length;
  const br = bear.filter(w => t.includes(w)).length;
  return bs > br ? 'bull' : br > bs ? 'bear' : 'neutral';
}

function scoreRelevance(text, cat) {
  const t = (text || '').toLowerCase();
  return (CAT_KEYWORDS[cat] || []).filter(k => t.includes(k)).length;
}

function parseRssDate(str) { if (!str) return new Date(0); try { return new Date(str); } catch { return new Date(0); } }

function extractRssItems(xml, sourceName) {
  const items     = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/g) || [];
  itemBlocks.forEach(block => {
    const get = tag => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`));
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    const title = get('title'); const description = get('description');
    const link    = get('link') || block.match(/<link>([^<]+)<\/link>/)?.[1] || '';
    const pubDate = get('pubDate') || get('dc:date') || '';
    if (title && title.length > 15) items.push({ title, description: description.replace(/<[^>]+>/g, '').slice(0, 300), link, pubDate, source: sourceName });
  });
  return items;
}

async function fetchRssFeed(source) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 6000);
  try {
    const r = await fetch(source.url, {
      signal:  controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DalalWire/2.0)', 'Accept': 'application/rss+xml, application/xml, text/xml, */*', 'Cache-Control': 'no-cache' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return extractRssItems(await r.text(), source.name);
  } catch { return []; }
  finally { clearTimeout(timeout); }
}

function extractTags(title, cat) {
  const t = (title || '').toUpperCase();
  const tags = [];
  ['NIFTY', 'SENSEX', 'RELIANCE', 'TCS', 'INFOSYS', 'HDFC', 'ICICI', 'SBI', 'WIPRO', 'ADANI', 'TATA', 'RBI', 'FED', 'SEBI'].forEach(c => { if (t.includes(c)) tags.push(c); });
  if (tags.length === 0) tags.push({ market: 'MARKET', banks: 'BANKING', sectors: 'SECTORS', macro: 'MACRO', stocks: 'STOCKS', global: 'GLOBAL' }[cat] || cat.toUpperCase());
  return tags.slice(0, 3);
}

async function fetchCategoryNews(cat) {
  const sources = RSS_SOURCES.filter(s => s.cat.includes(cat));
  const results = await Promise.allSettled(sources.map(s => fetchRssFeed(s)));
  let allItems  = [];
  results.forEach(r => { if (r.status === 'fulfilled') allItems = allItems.concat(r.value); });

  const seen   = new Set();
  const deduped = allItems.filter(item => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const scored = deduped.map(item => ({
    ...item,
    score:    scoreRelevance(item.title + ' ' + item.description, cat),
    parsedTs: parseRssDate(item.pubDate).getTime(),
  }));
  scored.sort((a, b) => b.parsedTs !== a.parsedTs ? b.parsedTs - a.parsedTs : b.score - a.score);

  return scored.slice(0, 20).map(item => ({
    headline:  item.title,
    body:      item.description || '',
    source:    item.source,
    url:       item.link,
    sentiment: sentimentFromText(item.title + ' ' + item.description),
    tags:      extractTags(item.title, cat),
    pubDate:   item.pubDate,
    freshness: 'RSS',
  }));
}

app.get('/api/news/:category', async (req, res) => {
  setApiCacheHeaders(res, 10, 30);
  const cat   = req.params.category.toLowerCase();
  const key   = `news_${cat}`;
  const force = req.query.force === '1';
  if (!force && isFresh(key, TTL.NEWS)) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(getCache(key).data);
  }
  try {
    let stories = await fetchCategoryNews(cat);
    if ((!stories || stories.length === 0) && (cat === 'banks' || cat === 'sectors')) {
      const broad = await fetchCategoryNews('market');
      stories = broad
        .map(s => ({ ...s, _score: scoreRelevance(`${s.headline} ${s.body}`, cat) }))
        .filter(s => s._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 20)
        .map(({ _score, ...rest }) => rest);
    }
    setCache(key, stories);
    res.setHeader('X-Cache', 'MISS');
    res.json(stories);
  } catch (e) {
    const stale = getCache(key);
    if (stale) return res.json(stale.data);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/news-refresh', (req, res) => {
  ['market', 'banks', 'sectors', 'macro', 'stocks', 'global'].forEach(cat => { delete _cache[`news_${cat}`]; });
  res.json({ status: 'ok' });
});

// ── ADVICE SIGNAL ─────────────────────────────────────────────
function mapTickerToYahooSym(t) {
  const T = (t || 'NIFTY').toUpperCase();
  if (T === 'NIFTY' || T === 'NIFTY50') return '^NSEI';
  if (T === 'SENSEX')                   return '^BSESN';
  if (T === 'BANKNIFTY')                return '^NSEBANK';
  if (T.includes('.NS') || T.startsWith('^')) return T;
  return `${T}.NS`;
}

function levelBand(price, pct) {
  const p    = Number(price) || 0;
  const step = p > 10_000 ? 150 : p > 1_000 ? 30 : 5;
  return {
    support:    Math.max(0, Math.round((p - 2 * step) / step) * step),
    resistance: Math.round((p + 2 * step) / step) * step,
    stop:       Math.max(0, Math.round((p - 3.5 * step) / step) * step),
    target:     Math.round((p + Math.max(2, Math.abs(pct || 1)) * step) / step) * step,
  };
}

app.get('/api/advice/:ticker', async (req, res) => {
  setApiCacheHeaders(res, 10, 30);
  const ticker = (req.params.ticker || 'NIFTY').toUpperCase();
  const key    = `advice_${ticker}`;
  if (isFresh(key, TTL.ADVICE)) return res.json(getCache(key).data);
  try {
    const [q, global, fiiDii] = await Promise.all([
      cachedYahooQuote(mapTickerToYahooSym(ticker)),
      getGlobalData().catch(() => getCache('global')?.data || {}),
      getFiiDiiData().catch(() => getCache('fiidii')?.data  || {}),
    ]);
    const pct    = Number(q?.regularMarketChangePercent || 0);
    const price  = Number(q?.regularMarketPrice || 0);
    const vix    = Number(global?.VIX?.price    || 0);
    const crude  = Number(global?.CRUDE?.price  || 0);
    const fiiNet = Number(fiiDii?.today?.fii_net || 0);
    const score  = (pct > 0 ? 1 : pct < 0 ? -1 : 0) + (fiiNet > 0 ? 1 : fiiNet < 0 ? -1 : 0) + (vix > 18 ? -1 : 1) + (crude > 95 ? -1 : 0);
    const stance = score >= 2 ? 'BULLISH' : score <= -2 ? 'BEARISH' : 'NEUTRAL';
    const out = {
      ticker,
      stance,
      cls:      stance === 'BULLISH' ? 'bull' : stance === 'BEARISH' ? 'bear' : 'neutral',
      message:  `Signal uses live price trend (${pct.toFixed(2)}%), FII/DII flow (${Math.round(fiiNet)} Cr), CBOE VIX (${vix.toFixed(2)}) and crude (${crude.toFixed(2)}). Bias is ${stance} for ${ticker}.`,
      freshness: FEATURE_ADVICE_LIVE ? 'LIVE' : 'FALLBACK',
      note:      FEATURE_ADVICE_LIVE ? undefined : 'Enable FEATURE_ADVICE_LIVE=true and connect Dhan API for live signals',
      metrics:  { price, pct, vix, crude, fiiNet },
      levels:   levelBand(price, pct),
      ts:       new Date().toISOString(),
    };
    setCache(key, out);
    res.json(out);
  } catch (e) {
    const stale = getCache(key);
    if (stale) return res.json({ ...stale.data, stale: true, freshness: 'FALLBACK' });
    res.status(500).json({ error: e.message });
  }
});

// ── LOCK-IN CALENDAR ─────────────────────────────────────────
function lockinImpactFromText(text) {
  const t = (text || '').toLowerCase();
  if (/(large|block|promoter|anchor|major)/.test(t)) return 'High';
  if (/(investor|pre-ipo|ofs|unlock)/.test(t))       return 'Medium';
  return 'Low';
}

function lockinQtyHint(text) {
  const m = (text || '').match(/(\d+(\.\d+)?)\s*(crore|cr|lakh|mn|million)/i);
  return m ? `${m[1]} ${m[3]}` : 'Not disclosed';
}

const BIG_PLAYERS = ['RELIANCE', 'TCS', 'INFOSYS', 'HDFC', 'ICICI', 'SBI', 'ADANI', 'TATA', 'KOTAK', 'AXIS', 'WIPRO', 'LT'];

function detectBigPlayer(text) { return BIG_PLAYERS.some(k => (text || '').toUpperCase().includes(k)); }

function computeCountdown(dateStr) {
  const d = parseRssDate(dateStr);
  if (isNaN(d)) return { daysLeft: null, status: 'UNKNOWN' };
  const deltaDays = Math.ceil((d.getTime() - Date.now()) / 86400000);
  return deltaDays < 0 ? { daysLeft: deltaDays, status: 'ENDED' } : deltaDays <= 7 ? { daysLeft: deltaDays, status: 'SOON' } : { daysLeft: deltaDays, status: 'UPCOMING' };
}

async function fetchLockinFeed() {
  const keywords = ['lock-in', 'lock in', 'unlock', 'anchor', 'pre-ipo', 'offer for sale', 'ofs'];
  const results  = await Promise.allSettled(RSS_SOURCES.map(s => fetchRssFeed(s)));
  let items = [];
  results.forEach(r => { if (r.status === 'fulfilled') items = items.concat(r.value || []); });
  return items
    .filter(x => { const txt = `${x.title} ${x.description}`.toLowerCase(); return keywords.some(k => txt.includes(k)); })
    .sort((a, b) => parseRssDate(b.pubDate) - parseRssDate(a.pubDate))
    .slice(0, 30)
    .map(x => ({
      date:         x.pubDate || '',
      company:      (x.title || '').split(' - ')[0].slice(0, 70),
      event:        x.title || 'Lock-in/Unlock update',
      qty:          lockinQtyHint(`${x.title} ${x.description}`),
      impact:       lockinImpactFromText(`${x.title} ${x.description}`),
      isBigPlayer:  detectBigPlayer(`${x.title} ${x.description}`),
      ...computeCountdown(x.pubDate || ''),
      source:       x.source || '',
      url:          x.link   || '',
    }));
}

app.get('/api/lockin', async (req, res) => {
  if (isFresh('lockin', TTL.LOCKIN)) return res.json(getCache('lockin').data);
  try {
    const events = await fetchLockinFeed();
    events.sort((a, b) => {
      const as = (a.isBigPlayer ? 2 : 0) + (a.status === 'SOON' ? 1 : 0);
      const bs = (b.isBigPlayer ? 2 : 0) + (b.status === 'SOON' ? 1 : 0);
      return bs !== as ? bs - as : parseRssDate(b.date) - parseRssDate(a.date);
    });
    const out = { events, ts: new Date().toISOString() };
    setCache('lockin', out);
    res.json(out);
  } catch (e) {
    const stale = getCache('lockin');
    if (stale) return res.json(stale.data);
    res.status(500).json({ error: e.message });
  }
});

// ── DEBUG (dev only) ─────────────────────────────────────────
if (!IS_PROD) {
  app.get('/api/debug', async (req, res) => {
    try {
      const q = await cachedYahooQuote('RELIANCE.NS');
      res.json({ status: 'ok', price: q.regularMarketPrice, change: q.regularMarketChange, name: q.longName });
    } catch (e) { res.json({ status: 'error', message: e.message }); }
  });
}

// ══════════════════════════════════════════════════════════════
// DHAN BROKER API — all routes behind FEATURE_DHAN_API flag
// Set FEATURE_DHAN_API=true in .env once credentials are ready
// All routes require x-dalal-token header (already enforced above)
// ══════════════════════════════════════════════════════════════

if (FEATURE_DHAN_API) {
  // Validate credentials on startup
  if (!DHAN_CLIENT_ID || !DHAN_ACCESS_TOKEN) {
    console.error('[DHAN] FEATURE_DHAN_API=true but DHAN_CLIENT_ID or DHAN_ACCESS_TOKEN is missing — broker routes will return 503');
  }

  // ── Dhan HTTP helper ─────────────────────────────────────
  async function dhanFetch(endpoint, options = {}) {
    if (!DHAN_CLIENT_ID || !DHAN_ACCESS_TOKEN) {
      throw new Error('Dhan credentials not configured — set DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN in .env');
    }
    const url  = `${DHAN_API_BASE}${endpoint}`;
    const key  = `dhan_${endpoint}`;
    if (isFresh(key, TTL.DHAN)) return getCache(key).data;

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 10_000);

    try {
      const r = await fetch(url, {
        method: options.method || 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type':  'application/json',
          'Accept':        'application/json',
          'access-token':  DHAN_ACCESS_TOKEN,
          'client-id':     DHAN_CLIENT_ID,
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (r.status === 401) throw new Error('Dhan token expired — regenerate access token from dhanhq.co dashboard');
      if (r.status === 429) throw new Error('Dhan rate limit hit — reduce polling frequency');
      if (!r.ok) throw new Error(`Dhan API ${r.status}: ${r.statusText}`);

      const data = await r.json();
      setCache(key, data);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ── Holdings (long-term portfolio) ───────────────────────
  // Dhan docs: GET /v2/holdings
  app.get('/api/broker/holdings', async (req, res) => {
    setApiCacheHeaders(res, 30, 60);
    try {
      const data = await dhanFetch('/v2/holdings');
      res.json({
        data,
        freshness:  'LIVE',
        source:     'Dhan HQ API v2',
        note:       'Holdings are marked to market during trading hours, EOD after close',
        ts:         new Date().toISOString(),
      });
    } catch (e) {
      console.error('[DHAN] holdings error:', e.message);
      res.status(e.message.includes('not configured') ? 503 : 500).json({ error: e.message, freshness: 'UNAVAILABLE' });
    }
  });

  // ── Positions (intraday) ──────────────────────────────────
  // Dhan docs: GET /v2/positions
  app.get('/api/broker/positions', async (req, res) => {
    setApiCacheHeaders(res, 15, 30);
    try {
      const data = await dhanFetch('/v2/positions');
      res.json({
        data,
        freshness:  'LIVE',
        source:     'Dhan HQ API v2',
        ts:         new Date().toISOString(),
      });
    } catch (e) {
      console.error('[DHAN] positions error:', e.message);
      res.status(e.message.includes('not configured') ? 503 : 500).json({ error: e.message, freshness: 'UNAVAILABLE' });
    }
  });

  // ── Funds / margin ────────────────────────────────────────
  // Dhan docs: GET /v2/fundlimit
  app.get('/api/broker/funds', async (req, res) => {
    setApiCacheHeaders(res, 30, 60);
    try {
      const data = await dhanFetch('/v2/fundlimit');
      res.json({ data, freshness: 'LIVE', source: 'Dhan HQ API v2', ts: new Date().toISOString() });
    } catch (e) {
      res.status(500).json({ error: e.message, freshness: 'UNAVAILABLE' });
    }
  });

  // ── Portfolio summary (derived — not a Dhan endpoint) ────
  // Aggregates holdings + funds into a single payload for the UI
  app.get('/api/broker/portfolio', async (req, res) => {
    setApiCacheHeaders(res, 30, 60);
    try {
      const [holdings, funds] = await Promise.allSettled([
        dhanFetch('/v2/holdings'),
        dhanFetch('/v2/fundlimit'),
      ]);
      res.json({
        holdings: holdings.status === 'fulfilled' ? holdings.value : null,
        funds:    funds.status    === 'fulfilled' ? funds.value    : null,
        freshness: 'LIVE',
        source:   'Dhan HQ API v2',
        ts:       new Date().toISOString(),
      });
    } catch (e) {
      res.status(500).json({ error: e.message, freshness: 'UNAVAILABLE' });
    }
  });

  console.log('[DHAN] Broker API routes registered — /api/broker/holdings, /api/broker/positions, /api/broker/funds, /api/broker/portfolio');
} else {
  // Dhan disabled — return clear 503 with instructions
  app.use('/api/broker', (req, res) => {
    res.status(503).json({
      error:    'Broker API is not enabled',
      how_to:   'Set FEATURE_DHAN_API=true and add DHAN_CLIENT_ID + DHAN_ACCESS_TOKEN to your .env file',
      docs:     'https://dhanhq.co/docs/v2/',
      freshness: 'UNAVAILABLE',
    });
  });
}

// ── BROKER STATUS (always available — no feature flag) ───────
app.get('/api/broker/status', (req, res) => {
  res.json({
    enabled:     FEATURE_DHAN_API,
    broker:      'Dhan HQ',
    configured:  FEATURE_DHAN_API && Boolean(DHAN_CLIENT_ID) && Boolean(DHAN_ACCESS_TOKEN),
    message:     FEATURE_DHAN_API
      ? (DHAN_CLIENT_ID && DHAN_ACCESS_TOKEN ? 'Dhan API is active' : 'Dhan API enabled but credentials missing')
      : 'Set FEATURE_DHAN_API=true in .env to enable',
    docs:       'https://dhanhq.co/docs/v2/',
  });
});

// ── START ─────────────────────────────────────────────────────
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║  DALAL WIRE v2.0                                     ║
  ╠══════════════════════════════════════════════════════╣
  ║  Bridge      →  http://localhost:${PORT}               ║
  ║  Terminal    →  http://localhost:${PORT}/terminal      ║
  ║  Health      →  http://localhost:${PORT}/api/health    ║
  ║  Broker      →  http://localhost:${PORT}/api/broker/status ║
  ╠══════════════════════════════════════════════════════╣
  ║  Data: Yahoo Finance · MFAPI · NSE · RSS             ║
  ║  Auth: ${API_SECRET ? 'x-dalal-token enabled ✓' : 'NO API_SECRET — set in .env ⚠'}               ║
  ║  Dhan: ${FEATURE_DHAN_API ? 'ENABLED' : 'disabled (set FEATURE_DHAN_API=true)'}                       ║
  ╚══════════════════════════════════════════════════════╝
    `);

  });
}

export default app;
