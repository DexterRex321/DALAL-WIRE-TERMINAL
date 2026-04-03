/* ═══════════════════════════════════════════════════════════
   DALAL WIRE BRIDGE — SIMPLIFIED APP
   No GSAP. No animation loops. CSS handles motion.
   Single fetch cycle. Clean data flow.
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ── CONFIG ──
const APP_ORIGIN = (() => {
  try {
    const p = window.location?.protocol;
    const o = window.location?.origin;
    if (p === 'file:' || !o || o === 'null') return 'http://127.0.0.1:3000';
    return o;
  } catch { return 'http://127.0.0.1:3000'; }
})();

const POLL_MS = 12_000;    // dashboard refresh
const NEWS_MS = 3 * 60_000; // news refresh

// ── STATE ──
let lastData = null;
let pollTimer = null;
let newsTimer = null;
let tickerBuilt = false;

// ── AUTH MANAGER ─────────────────────────────────────────────
let dToken = null;
let dTokenFetching = null;

async function getDalalToken() {
  if (dToken) return dToken;
  if (dTokenFetching) return dTokenFetching;
  dTokenFetching = fetch('/api/auth/session', { headers: { 'x-skip-auth': '1' } })
    .then(r => {
      if (!r.ok) throw new Error('Session fetch failed');
      return r.json();
    })
    .then(d => { dToken = d.token; dTokenFetching = null; return dToken; })
    .catch(e => { dTokenFetching = null; throw e; });
  return dTokenFetching;
}

const originalFetch = window.fetch;
window.fetch = async function () {
  const url = arguments[0];
  const strUrl = typeof url === 'string' ? url : (url.url || '');
  const isApi = strUrl.includes('/api/') && !strUrl.includes('/api/auth/session');
  
  if (isApi) {
    const token = await getDalalToken();
    if (!arguments[1]) arguments[1] = {};
    if (!arguments[1].headers) arguments[1].headers = {};
    arguments[1].headers['x-dalal-token'] = token;
  }
  
  let result = await originalFetch.apply(this, arguments);
  
  if (isApi && result.status === 401) {
    dToken = null;
    const newToken = await getDalalToken();
    arguments[1].headers['x-dalal-token'] = newToken;
    result = await originalFetch.apply(this, arguments);
  }
  
  return result;
};

setInterval(async () => {
  dToken = null;
  await getDalalToken();
}, 14 * 60 * 1000);

// ── UTILITIES ──
function $(id) { return document.getElementById(id); }

function fmt(v, digits = 2) {
  const n = Number(v);
  if (!isFinite(n)) return '--';
  if (Math.abs(n) >= 10000) return n.toLocaleString('en-IN', { maximumFractionDigits: 1 });
  if (Math.abs(n) >= 1000)  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return n.toFixed(digits);
}

function fmtChg(change, pct) {
  const c = Number(change), p = Number(pct);
  if (!isFinite(c)) return { text: '--', cls: 'flat' };
  const sign = c >= 0 ? '+' : '';
  const pctStr = isFinite(p) ? `${sign}${p.toFixed(2)}%` : '--';
  return {
    text: `${sign}${c.toFixed(2)}  ${pctStr}`,
    cls: c > 0 ? 'up' : c < 0 ? 'dn' : 'flat',
  };
}

function fmtCr(v) {
  const n = Number(v);
  if (!isFinite(n)) return '--';
  const sign = n >= 0 ? '+' : '';
  return `${sign}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')} Cr`;
}

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val ?? '--';
}

function setClass(el, cls) {
  if (!el) return;
  el.className = el.className.replace(/\bup\b|\bdn\b|\bflat\b/g, '').trim() + ' ' + cls;
}

// ── CLOCK ──
function updateClock() {
  const el = $('tb-clock');
  if (!el) return;
  el.textContent = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Kolkata',
  });
}
updateClock();
setInterval(updateClock, 1000);

// ── MARKET STATUS ──
function updateMarketStatus() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay(); // 0=Sun, 6=Sat
  const h = ist.getHours(), m = ist.getMinutes();
  const mins = h * 60 + m;
  const open = day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
  const el = $('mkt-badge');
  if (el) {
    el.textContent = open ? 'OPEN' : 'CLOSED';
    el.className = `mkt-badge ${open ? 'mkt-open' : 'mkt-closed'}`;
  }
}
updateMarketStatus();
setInterval(updateMarketStatus, 30_000);

// ── NAVIGATION (fast transition) ──
window.navigate = function(event, url, label) {
  if (event) event.preventDefault();
  const veil = $('veil');
  if (veil) veil.classList.add('on');
  setTimeout(() => { window.location.href = url; }, 150);
};

window.openTerminal = function(cardEl) {
  const route = cardEl?.dataset?.route || 'market';
  const url = `/terminal?cat=${route}&focus=terminal`;
  navigate(null, url);
};

// ── FETCH ──
async function fetchJSON(path, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(new URL(path, APP_ORIGIN).toString(), {
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ── STATUS STRIP ──
function setLiveDot(state) {
  const dot = $('live-dot');
  if (!dot) return;
  dot.className = `ss-dot ${state}`;
}

function updateStatusStrip(data) {
  if (!data) return;

  const fii = data.fiiDii;
  if (fii?.today?.fii_net != null && fii?.today?.dii_net != null) {
    const net = Number(fii.today.fii_net) + Number(fii.today.dii_net);
    const netStr = fmtCr(fii.today.fii_net);
    setText('ss-fii', `FII ${netStr}`);
  }

  const vixPrice = data.global?.indiaVix?.price;
  if (vixPrice) setText('ss-vix', `INDIA VIX  ${fmt(vixPrice)}`);

  // Bias
  const niftyPct = Number(data.ticker?.nifty?.percent_change || 0);
  const vixVal   = Number(data.global?.indiaVix?.price || 0);
  const fiiNet   = Number(data.fiiDii?.fii_net || 0);
  let biasText = 'NEUTRAL';
  const score = (niftyPct > 0 ? 1 : niftyPct < 0 ? -1 : 0)
              + (fiiNet > 0 ? 1 : fiiNet < 0 ? -1 : 0)
              + (vixVal > 18 ? -1 : vixVal < 14 ? 1 : 0);
  if (score >= 2)  biasText = 'RISK ON';
  else if (score <= -2) biasText = 'RISK OFF';
  else if (score < 0)   biasText = 'MIXED ↓';
  else if (score > 0)   biasText = 'MIXED ↑';
  setText('ss-bias', `BIAS  ${biasText}`);

  const now = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  });
  setText('ss-updated', `UPDATED ${now} IST`);
}

// ── INDEX CARDS ──
const CARD_MAP = {
  'NIFTY:NSE':     { val: 'ic-nifty',     chg: 'ic-nifty-chg',     bar: 'ic-nifty-bar',     card: null },
  'SENSEX:BSE':    { val: 'ic-sensex',    chg: 'ic-sensex-chg',    bar: 'ic-sensex-bar',    card: null },
  'BANKNIFTY:NSE': { val: 'ic-banknifty', chg: 'ic-banknifty-chg', bar: 'ic-banknifty-bar', card: null },
};

// Dow maps from global endpoint
function updateCards(quotes, globalData) {
  // Indian indices from quotes
  for (const [sym, ids] of Object.entries(CARD_MAP)) {
    const q = quotes[sym];
    if (!q) continue;
    const price = q.price || q.close;
    const chg   = fmtChg(q.change, q.percent_change);

    const valEl  = $(ids.val);
    const chgEl  = $(ids.chg);
    const barEl  = $(ids.bar);

    const prevVal = valEl?.dataset?.prev;
    const newVal  = fmt(price);

    // Flash on change
    if (prevVal && prevVal !== newVal) {
      const card = document.querySelector(`[data-sym="${sym}"]`);
      if (card) {
        card.classList.remove('flash-up', 'flash-dn');
        void card.offsetWidth; // reflow
        card.classList.add(chg.cls === 'up' ? 'flash-up' : 'flash-dn');
      }
    }
    if (valEl) { valEl.textContent = newVal; valEl.dataset.prev = newVal; }
    if (chgEl) { chgEl.textContent = chg.text; chgEl.className = `ic-change ${chg.cls}`; }

    // Bar: map pct to 0–100 width (±3% = 0–100%)
    if (barEl) {
      const pct = Number(q.percent_change || 0);
      const w = Math.min(100, Math.abs(pct) / 3 * 100);
      barEl.style.width = w + '%';
      barEl.className = `ic-bar-fill ${chg.cls}`;
    }
  }

  // Dow Jones from global
  const dow = globalData?.DOW;
  if (dow) {
    const chg = fmtChg(dow.change, dow.percent_change);
    const valEl = $('ic-dow');
    const newVal = fmt(dow.price);
    if (valEl) { valEl.textContent = newVal; valEl.dataset.prev = newVal; }
    const chgEl = $('ic-dow-chg');
    if (chgEl) { chgEl.textContent = chg.text; chgEl.className = `ic-change ${chg.cls}`; }
    const barEl = $('ic-dow-bar');
    if (barEl) {
      const pct = Number(dow.percent_change || 0);
      barEl.style.width = Math.min(100, Math.abs(pct) / 3 * 100) + '%';
      barEl.className = `ic-bar-fill ${chg.cls}`;
    }
  }
}

// ── MACRO STRIP ──
function updateMacro(quotes, globalData) {
  const pairs = [
    ['mc-usdinr',  'mc-usdinr-chg',  quotes['USD/INR:Forex']],
    ['mc-crude',   'mc-crude-chg',   quotes['WTI:Commodity']],
    ['mc-gold',    'mc-gold-chg',    quotes['XAU/USD:Forex']],
    ['mc-sp500',   'mc-sp500-chg',   globalData?.SP500],
    ['mc-dxy',     'mc-dxy-chg',     globalData?.DXY],
  ];

  for (const [valId, chgId, q] of pairs) {
    if (!q) continue;
    const price = q.price || q.close;
    const chg   = fmtChg(q.change, q.percent_change);
    setText(valId, fmt(price));
    const chgEl = $(chgId);
    if (chgEl) { chgEl.textContent = chg.text; chgEl.className = `mc-chg ${chg.cls}`; }
  }

  // VIX special — show raw value
  const vix = globalData?.indiaVix || quotes?.['indiaVix'];
  if (vix) {
    setText('mc-vix', fmt(vix.price || vix.close));
    const chgEl = $('mc-vix-chg');
    if (chgEl) {
      const chg = fmtChg(vix.change, vix.percent_change);
      chgEl.textContent = chg.text;
      chgEl.className = `mc-chg ${chg.cls}`;
    }
  }
}

// ── FII / DII PANEL ──
function updateFiiDii(fiiData) {
  if (!fiiData) return;
  const today = fiiData.today || {};
  const status = fiiData.status || {};

  const fiiBuy  = Number(fiiData.fii?.[0]?.buy || 0);
  const fiiSell = Number(fiiData.fii?.[0]?.sell || 0);
  const fiiNet  = Number(today.fii_net ?? fiiData.fii?.[0]?.net ?? 0);
  const diiBuy  = Number(fiiData.dii?.[0]?.buy || 0);
  const diiSell = Number(fiiData.dii?.[0]?.sell || 0);
  const diiNet  = Number(today.dii_net ?? fiiData.dii?.[0]?.net ?? 0);

  setText('fii-buy',  `₹${Math.abs(Math.round(fiiBuy)).toLocaleString('en-IN')}Cr`);
  setText('fii-sell', `₹${Math.abs(Math.round(fiiSell)).toLocaleString('en-IN')}Cr`);
  const fiiNetEl = $('fii-net');
  if (fiiNetEl) {
    fiiNetEl.textContent = fmtCr(fiiNet);
    fiiNetEl.className = `fii-net ${fiiNet >= 0 ? 'up' : 'dn'}`;
  }

  setText('dii-buy',  `₹${Math.abs(Math.round(diiBuy)).toLocaleString('en-IN')}Cr`);
  setText('dii-sell', `₹${Math.abs(Math.round(diiSell)).toLocaleString('en-IN')}Cr`);
  const diiNetEl = $('dii-net');
  if (diiNetEl) {
    diiNetEl.textContent = fmtCr(diiNet);
    diiNetEl.className = `fii-net ${diiNet >= 0 ? 'up' : 'dn'}`;
  }

  // Bar split
  const totalAbsBuy  = Math.abs(fiiBuy) + Math.abs(diiBuy);
  const totalAbsSell = Math.abs(fiiSell) + Math.abs(diiSell);
  const maxFlow = Math.max(totalAbsBuy, totalAbsSell, 1);
  const buyBar  = $('fii-bar-buy');
  const sellBar = $('fii-bar-sell');
  if (buyBar)  buyBar.style.width  = Math.min(100, totalAbsBuy  / maxFlow * 100) + '%';
  if (sellBar) sellBar.style.width = Math.min(100, totalAbsSell / maxFlow * 100) + '%';

  // Tag
  const tag = $('fii-tag');
  if (tag) {
    const src  = status.source || 'NSE';
    const date = status.sourceDate || today.date || '';
    tag.textContent = `${status.tag || 'EOD'} · ${src}${date ? ' · ' + date : ''}`;
  }

  setText('fii-date', today.date ? `AS OF ${today.date}` : '');
}

// ── TICKER TAPE ──
function buildTicker(quotes, globalData) {
  const tape = $('ticker-tape');
  if (!tape || tickerBuilt) {
    // Just update values
    updateTickerValues(quotes, globalData);
    return;
  }

  const items = [
    { sym: 'NIFTY 50',  q: quotes['NIFTY:NSE'] },
    { sym: 'SENSEX',    q: quotes['SENSEX:BSE'] },
    { sym: 'BANK NIFTY',q: quotes['BANKNIFTY:NSE'] },
    { sym: 'USD/INR',   q: quotes['USD/INR:Forex'] },
    { sym: 'CRUDE WTI', q: quotes['WTI:Commodity'] },
    { sym: 'GOLD',      q: quotes['XAU/USD:Forex'] },
    { sym: 'S&P 500',   q: globalData?.SP500 },
    { sym: 'NASDAQ',    q: globalData?.NASDAQ },
    { sym: 'DOW',       q: globalData?.DOW },
    { sym: 'DXY',       q: globalData?.DXY },
    { sym: 'INDIA VIX', q: globalData?.indiaVix },
  ].filter(i => i.q);

  if (!items.length) return;

  // Duplicate for seamless loop
  const html = [...items, ...items].map(({ sym, q }) => {
    const price = q.price || q.close;
    const chg   = fmtChg(q.change, q.percent_change);
    return `<span class="tk-item">
      <span class="tk-sym">${sym}</span>
      <span class="tk-val">${fmt(price)}</span>
      <span class="tk-chg ${chg.cls}">${chg.text.split(' ')[1] || chg.text}</span>
    </span>`;
  }).join('');

  tape.innerHTML = html;
  tickerBuilt = true;
}

function updateTickerValues(quotes, globalData) {
  // No DOM rebuild — just let the next full update handle it
  // Ticker is CSS-animated; values update on next buildTicker call
}

// ── NEWS FEED ──
let lastNewsHash = '';

async function fetchNews() {
  const feed = $('news-feed');
  if (!feed) return;

  try {
    const stories = await fetchJSON('/api/news/market', 8000);
    if (!Array.isArray(stories) || !stories.length) return;

    const hash = stories.slice(0, 5).map(s => s.headline).join('|');
    if (hash === lastNewsHash) return; // no change
    lastNewsHash = hash;

    const tag = $('news-tag');
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
    if (tag) tag.textContent = `RSS · ${stories.length} STORIES · ${now}`;

    feed.innerHTML = stories.slice(0, 8).map(s => {
      const sentiment = s.sentiment || 'neutral';
      const tagCls = sentiment === 'bull' ? 'ni-tag-bull' : sentiment === 'bear' ? 'ni-tag-bear' : 'ni-tag-neu';
      const tagLabel = sentiment === 'bull' ? 'BULL' : sentiment === 'bear' ? 'BEAR' : 'WATCH';
      const time = s.pubDate
        ? new Date(s.pubDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST'
        : '';
      const src = s.source || '';
      const url = s.url ? `href="${s.url}" target="_blank" rel="noopener"` : `href="/terminal"`;

      return `<a class="news-item" ${url}>
        <div class="ni-meta">
          <span class="ni-tag ${tagCls}">${tagLabel}</span>
          ${time ? `<span class="ni-time">${time}</span>` : ''}
          ${src ? `<span class="ni-src">${src}</span>` : ''}
        </div>
        <div class="ni-hl">${s.headline}</div>
      </a>`;
    }).join('');

  } catch (e) {
    console.warn('News fetch failed:', e.message);
  }
}

// ── MAIN DASHBOARD FETCH ──
async function fetchDashboard() {
  try {
    const data = await fetchJSON('/api/dashboard');
    lastData = data;

    const quotes     = data.quotes || {};
    const globalData = (() => {
      // dashboard returns lowercase keys in .global — fetch directly for uppercase
      return null; // handled by fetchGlobal
    })();
    const fiiData    = data.fiiDii || null;

    updateStatusStrip(data);
    updateCards(quotes, data._globalFull || {});
    updateMacro(quotes, data._globalFull || {});
    updateFiiDii(fiiData);
    buildTicker(quotes, data._globalFull || {});

    setLiveDot(data.quotes && Object.values(data.quotes).some(q => !q?.stale) ? 'live' : 'stale');

    const src = $('ss-source');
    if (src) src.textContent = 'LIVE · YAHOO FINANCE · NSE';

  } catch (e) {
    console.warn('Dashboard fetch failed:', e.message);
    setLiveDot('err');
    const src = $('ss-source');
    if (src) src.textContent = 'CONNECTION ERROR';
  }
}

// ── GLOBAL FETCH (uppercase keys for proper display) ──
let globalFetched = false;

async function fetchGlobal() {
  try {
    const data = await fetchJSON('/api/global', 8000);
    if (!data || !Object.keys(data).length) return;

    // Stash on lastData for card updates
    if (lastData) lastData._globalFull = data;

    // Update DOW card
    const dow = data.DOW;
    if (dow) {
      const chg = fmtChg(dow.change, dow.percent_change);
      const valEl = $('ic-dow');
      if (valEl) { valEl.textContent = fmt(dow.price); valEl.dataset.prev = fmt(dow.price); }
      const chgEl = $('ic-dow-chg');
      if (chgEl) { chgEl.textContent = chg.text; chgEl.className = `ic-change ${chg.cls}`; }
      const barEl = $('ic-dow-bar');
      if (barEl) { const pct = Number(dow.percent_change||0); barEl.style.width = Math.min(100, Math.abs(pct)/3*100)+'%'; barEl.className=`ic-bar-fill ${chg.cls}`; }
    }

    // Update macro strip with global data
    const macroGlobal = [
      ['mc-sp500', 'mc-sp500-chg', data.SP500],
      ['mc-dxy',   'mc-dxy-chg',   data.DXY],
    ];
    for (const [valId, chgId, q] of macroGlobal) {
      if (!q) continue;
      setText(valId, fmt(q.price));
      const chgEl = $(chgId);
      if (chgEl) { const chg = fmtChg(q.change, q.percent_change); chgEl.textContent = chg.text; chgEl.className = `mc-chg ${chg.cls}`; }
    }

    // India VIX from dashboard (already have)
    if (lastData) buildTicker(lastData.quotes || {}, data);
    globalFetched = true;

  } catch (e) {
    console.warn('Global fetch failed:', e.message);
  }
}

// ── BOOT SEQUENCE ──
async function boot() {
  // Parallel first fetch
  await Promise.allSettled([
    fetchDashboard(),
    fetchGlobal(),
    fetchNews(),
  ]);

  // Poll dashboard
  pollTimer = setInterval(async () => {
    await fetchDashboard();
    if (!globalFetched || Math.random() < 0.25) fetchGlobal(); // refresh global every ~4 cycles
  }, POLL_MS);

  // News refresh
  newsTimer = setInterval(fetchNews, NEWS_MS);
}

// Start
boot();

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  clearInterval(pollTimer);
  clearInterval(newsTimer);
});