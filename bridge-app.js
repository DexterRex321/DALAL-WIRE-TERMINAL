/* ═══════════════════════════════════════════════════════════
   DALAL WIRE BRIDGE — DETERMINISTIC APP v2.0
   Centralized State. Reactive Rendering. Auth-First Boot.
   No race conditions. No silent failures.
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

const POLL_MS = 12_000;    
const NEWS_MS = 3 * 60_000; 

// ── STATE ──
const STATE = {
  status: 'INIT', // INIT, AUTH_PENDING, DATA_PENDING, READY, SYNC_ERROR, AUTH_ERROR
  auth: {
    token: null,
    fetching: null,
    lastUpdate: 0
  },
  data: {
    dashboard: null,
    global: null,
    news: [],
    lastSuccess: {
      dashboard: 0,
      global: 0,
      news: 0
    }
  },
  ui: {
    lastTickerHash: '',
    lastNewsHash: '',
    pollTimer: null,
    newsTimer: null
  }
};

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

// ── AUTH MANAGER (Hardened) ──
async function getDalalToken() {
  if (STATE.auth.token && (Date.now() - STATE.auth.lastUpdate < 14 * 60 * 1000)) {
    return STATE.auth.token;
  }
  
  if (STATE.auth.fetching) return STATE.auth.fetching;

  STATE.auth.fetching = fetch('/api/auth/session', { headers: { 'x-skip-auth': '1' } })
    .then(r => {
      if (!r.ok) throw new Error('AUTH_FAILED');
      return r.json();
    })
    .then(d => {
      STATE.auth.token = d.token;
      STATE.auth.lastUpdate = Date.now();
      STATE.auth.fetching = null;
      return d.token;
    })
    .catch(e => {
      STATE.auth.fetching = null;
      STATE.status = 'AUTH_ERROR';
      renderApp();
      throw e;
    });

  return STATE.auth.fetching;
}

// Global fetch wrapper with forced auth wait
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
    STATE.auth.token = null; // force refresh
    const newToken = await getDalalToken();
    arguments[1].headers['x-dalal-token'] = newToken;
    result = await originalFetch.apply(this, arguments);
  }
  
  return result;
};

// ── RENDER ENGINE ──

function renderApp() {
  const s = STATE.status;

  // 1. Status Strip (Always visible)
  renderStatusStrip();

  // 2. Global Loader state
  const veil = $('veil');
  if (s === 'READY' || s === 'SYNC_ERROR') {
    if (veil && veil.classList.contains('on')) veil.classList.remove('on');
  }

  if (s === 'AUTH_PENDING' || s === 'DATA_PENDING') {
    // Show skeletons if first load
    if (!STATE.data.dashboard) {
      document.querySelectorAll('.ic-value').forEach(el => el.innerHTML = '<span class="ic-skeleton"></span>');
    }
  }

  if (s === 'AUTH_ERROR') {
    setText('ss-source', 'AUTHENTICATION FAILED');
    const dot = $('live-dot');
    if (dot) dot.className = 'ss-dot err';
    return;
  }

  // 3. Conditional panel renders
  if (STATE.data.dashboard) {
    renderIndices();
    renderMacro();
    renderFiiDii();
    renderTicker();
  }

  if (STATE.data.news && STATE.data.news.length > 0) {
    renderNews();
  }

  // 4. Market Badge & Clock (Heartbeat)
  renderHeartbeat();
}

function renderStatusStrip() {
  const d = STATE.data.dashboard;
  const dot = $('live-dot');
  if (!dot) return;

  if (STATE.status === 'AUTH_ERROR') {
    dot.className = 'ss-dot err';
    setText('ss-source', 'AUTH ERROR');
    return;
  }

  if (STATE.status === 'SYNC_ERROR') {
    dot.className = 'ss-dot err';
    setText('ss-source', 'SYNC ERROR');
  } else if (d) {
    const isLive = Object.values(d.quotes || {}).some(q => !q?.stale);
    dot.className = `ss-dot ${isLive ? 'live' : 'stale'}`;
    setText('ss-source', 'LIVE · YAHOO FINANCE · NSE');
  }

  if (d) {
    // FII Status
    const fii = d.fiiDii;
    if (fii?.today?.fii_net != null) {
      setText('ss-fii', `FII ${fmtCr(fii.today.fii_net)}`);
    }

    // VIX Status
    const vixPrice = d.global?.indiaVix?.price;
    if (vixPrice) setText('ss-vix', `INDIA VIX ${fmt(vixPrice)}`);

    // Bias Logic
    const niftyPct = Number(d.ticker?.nifty?.percent_change || 0);
    const vixVal   = Number(d.global?.indiaVix?.price || 0);
    const fiiNet   = Number(d.fiiDii?.fii_net || 0);
    let biasText = 'NEUTRAL';
    const score = (niftyPct > 0 ? 1 : niftyPct < 0 ? -1 : 0)
                + (fiiNet > 0 ? 1 : fiiNet < 0 ? -1 : 0)
                + (vixVal > 18 ? -1 : vixVal < 14 ? 1 : 0);
    if (score >= 2)  biasText = 'RISK ON';
    else if (score <= -2) biasText = 'RISK OFF';
    else if (score < 0)   biasText = 'MIXED ↓';
    else if (score > 0)   biasText = 'MIXED ↑';
    setText('ss-bias', `BIAS ${biasText}`);

    const now = new Date(STATE.data.lastSuccess.dashboard || Date.now()).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
    });
    setText('ss-updated', `UPDATED ${now} IST`);
  }
}

function renderIndices() {
  const quotes = STATE.data.dashboard.quotes || {};
  const global = STATE.data.global || {};

  const map = {
    'NIFTY:NSE':     { val: 'ic-nifty',     chg: 'ic-nifty-chg',     bar: 'ic-nifty-bar' },
    'SENSEX:BSE':    { val: 'ic-sensex',    chg: 'ic-sensex-chg',    bar: 'ic-sensex-bar' },
    'BANKNIFTY:NSE': { val: 'ic-banknifty', chg: 'ic-banknifty-chg', bar: 'ic-banknifty-bar' },
    'DOW':           { val: 'ic-dow',       chg: 'ic-dow-chg',       bar: 'ic-dow-bar', data: global.DOW }
  };

  for (const [sym, ids] of Object.entries(map)) {
    const q = ids.data || quotes[sym];
    if (!q) continue;

    const price = q.price || q.close;
    const chg   = fmtChg(q.change, q.percent_change);
    const valEl = $(ids.val);
    const chgEl = $(ids.chg);
    const barEl = $(ids.bar);

    const newVal = fmt(price);
    if (valEl) {
      if (valEl.dataset.prev && valEl.dataset.prev !== newVal) {
        const card = document.querySelector(`[data-sym="${sym}"]`);
        if (card) {
          card.classList.remove('flash-up', 'flash-dn');
          void card.offsetWidth;
          card.classList.add(chg.cls === 'up' ? 'flash-up' : 'flash-dn');
        }
      }
      valEl.textContent = newVal;
      valEl.dataset.prev = newVal;
    }

    if (chgEl) {
      chgEl.textContent = chg.text;
      chgEl.className = `ic-change ${chg.cls}`;
    }

    if (barEl) {
      const pct = Number(q.percent_change || 0);
      barEl.style.width = Math.min(100, Math.abs(pct) / 3 * 100) + '%';
      barEl.className = `ic-bar-fill ${chg.cls}`;
    }
  }
}

function renderMacro() {
  const quotes = STATE.data.dashboard.quotes || {};
  const global = STATE.data.global || {};

  const pairs = [
    ['mc-usdinr',  'mc-usdinr-chg',  quotes['USD/INR:Forex']],
    ['mc-crude',   'mc-crude-chg',   quotes['WTI:Commodity']],
    ['mc-gold',    'mc-gold-chg',    quotes['XAU/USD:Forex']],
    ['mc-sp500',   'mc-sp500-chg',   global.SP500],
    ['mc-dxy',     'mc-dxy-chg',     global.DXY],
    ['mc-vix',     'mc-vix-chg',     global.indiaVix || quotes['indiaVix']]
  ];

  for (const [valId, chgId, q] of pairs) {
    if (!q) continue;
    const price = q.price || q.close;
    const chg   = fmtChg(q.change, q.percent_change);
    setText(valId, fmt(price));
    const chgEl = $(chgId);
    if (chgEl) {
      chgEl.textContent = chg.text;
      chgEl.className = `mc-chg ${chg.cls}`;
    }
  }
}

function renderFiiDii() {
  const fiiData = STATE.data.dashboard.fiiDii;
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
  const fn = $('fii-net');
  if (fn) { fn.textContent = fmtCr(fiiNet); fn.className = `fii-net ${fiiNet >= 0 ? 'up' : 'dn'}`; }

  setText('dii-buy',  `₹${Math.abs(Math.round(diiBuy)).toLocaleString('en-IN')}Cr`);
  setText('dii-sell', `₹${Math.abs(Math.round(diiSell)).toLocaleString('en-IN')}Cr`);
  const dn = $('dii-net');
  if (dn) { dn.textContent = fmtCr(diiNet); dn.className = `fii-net ${diiNet >= 0 ? 'up' : 'dn'}`; }

  const totalAbsBuy  = Math.max(Math.abs(fiiBuy) + Math.abs(diiBuy), 1);
  const totalAbsSell = Math.max(Math.abs(fiiSell) + Math.abs(diiSell), 1);
  const maxFlow = Math.max(totalAbsBuy, totalAbsSell);
  
  const bBar = $('fii-bar-buy');
  const sBar = $('fii-bar-sell');
  if (bBar) bBar.style.width = (totalAbsBuy / maxFlow * 100) + '%';
  if (sBar) sBar.style.width = (totalAbsSell / maxFlow * 100) + '%';

  const t = $('fii-tag');
  if (t) {
    const src = status.source || 'NSE';
    const date = status.sourceDate || today.date || '';
    t.textContent = `${status.tag || 'EOD'} · ${src}${date ? ' · ' + date : ''}`;
  }
  setText('fii-date', today.date ? `AS OF ${today.date}` : '');
}

function renderTicker() {
  const tape = $('ticker-tape');
  if (!tape) return;

  const quotes = STATE.data.dashboard.quotes || {};
  const global = STATE.data.global || {};

  const items = [
    { sym: 'NIFTY 50',  q: quotes['NIFTY:NSE'] },
    { sym: 'SENSEX',    q: quotes['SENSEX:BSE'] },
    { sym: 'BANK NIFTY',q: quotes['BANKNIFTY:NSE'] },
    { sym: 'USD/INR',   q: quotes['USD/INR:Forex'] },
    { sym: 'CRUDE WTI', q: quotes['WTI:Commodity'] },
    { sym: 'GOLD',      q: quotes['XAU/USD:Forex'] },
    { sym: 'S&P 500',   q: global.SP500 },
    { sym: 'NASDAQ',    q: global.NASDAQ },
    { sym: 'DOW',       q: global.DOW },
    { sym: 'DXY',       q: global.DXY },
    { sym: 'INDIA VIX', q: global.indiaVix },
  ].filter(i => i.q);

  if (!items.length) return;

  const hash = items.map(i => `${i.sym}:${i.q.price || i.q.close}`).join('|');
  if (hash === STATE.ui.lastTickerHash) return;
  STATE.ui.lastTickerHash = hash;

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
}

function renderNews() {
  const feed = $('news-feed');
  if (!feed) return;

  const stories = STATE.data.news;
  const hash = stories.slice(0, 5).map(s => s.headline).join('|');
  if (hash === STATE.ui.lastNewsHash) return;
  STATE.ui.lastNewsHash = hash;

  const tag = $('news-tag');
  const now = new Date(STATE.data.lastSuccess.news || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  if (tag) tag.textContent = `RSS · ${stories.length} STORIES · ${now}`;

  feed.innerHTML = stories.slice(0, 8).map(s => {
    const sentiment = s.sentiment || 'neutral';
    const tagCls = sentiment === 'bull' ? 'ni-tag-bull' : sentiment === 'bear' ? 'ni-tag-bear' : 'ni-tag-neu';
    const tagLabel = sentiment === 'bull' ? 'BULL' : sentiment === 'bear' ? 'BEAR' : 'WATCH';
    const time = s.pubDate ? new Date(s.pubDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST' : '';
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
}

function renderHeartbeat() {
  // Clock
  const clock = $('tb-clock');
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: 'Asia/Kolkata',
    });
  }

  // Market Status
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay(); 
  const mins = ist.getHours() * 60 + ist.getMinutes();
  const open = day >= 1 && day <= 5 && mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
  
  const mkt = $('mkt-badge');
  if (mkt) {
    mkt.textContent = open ? 'OPEN' : 'CLOSED';
    mkt.className = `mkt-badge ${open ? 'mkt-open' : 'mkt-closed'}`;
  }
}

// ── DATA FLOW ──

async function fetchJSON(path, timeoutMs = 8000) {
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

async function updateDashboardData() {
  try {
    const data = await fetchJSON('/api/dashboard');
    STATE.data.dashboard = data;
    STATE.data.lastSuccess.dashboard = Date.now();
    if (STATE.status === 'DATA_PENDING' || STATE.status === 'SYNC_ERROR') STATE.status = 'READY';
    renderApp();
  } catch (e) {
    console.warn('Dashboard fetch failed:', e.message);
    STATE.status = 'SYNC_ERROR';
    renderApp();
  }
}

async function updateGlobalData() {
  try {
    const data = await fetchJSON('/api/global');
    STATE.data.global = data;
    STATE.data.lastSuccess.global = Date.now();
    renderApp();
  } catch (e) { console.warn('Global fetch failed'); }
}

async function updateNewsData() {
  try {
    const data = await fetchJSON('/api/news/market');
    if (Array.isArray(data)) {
      STATE.data.news = data;
      STATE.data.lastSuccess.news = Date.now();
      renderApp();
    }
  } catch (e) { console.warn('News fetch failed'); }
}

// ── BOOT SEQUENCE (Deterministic) ──

async function boot() {
  try {
    // Phase 1: Authentication
    STATE.status = 'AUTH_PENDING';
    renderApp();
    await getDalalToken();

    // Phase 2: Initial Data Hydration
    STATE.status = 'DATA_PENDING';
    renderApp();
    
    await Promise.allSettled([
      updateDashboardData(),
      updateGlobalData(),
      updateNewsData()
    ]);

    // Phase 3: Start Lifecycle
    if (STATE.status !== 'SYNC_ERROR') STATE.status = 'READY';
    renderApp();

    // Polling intervals
    STATE.ui.pollTimer = setInterval(async () => {
      await updateDashboardData();
      if (Math.random() < 0.25) updateGlobalData(); // refresh global ~1 min
    }, POLL_MS);

    STATE.ui.newsTimer = setInterval(updateNewsData, NEWS_MS);

    // Clock heartbeat
    setInterval(renderHeartbeat, 1000);

  } catch (e) {
    console.error('Boot sequence failed:', e);
    // STATE.status already updated by catch blocks in specific functions
  }
}

// Start
boot();

// Cleanup
window.addEventListener('beforeunload', () => {
  clearInterval(STATE.ui.pollTimer);
  clearInterval(STATE.ui.newsTimer);
});

// Navigation helpers
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