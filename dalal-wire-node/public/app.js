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
  const isApi = typeof url === 'string' && url.includes('/api/') && !url.includes('/api/auth/session');
  
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

// Start token rotation loop
setInterval(async () => {
  dToken = null;
  await getDalalToken();
}, 14 * 60 * 1000);

// ── SIDEBAR CONFIG ──
const DEFAULT_INDICES = [
  { sym: 'NIFTY:NSE', label: 'NIFTY 50', valId: 's-nifty', chgId: 's-nifty-chg' },
  { sym: 'SENSEX:BSE', label: 'SENSEX', valId: 's-sensex', chgId: 's-sensex-chg' },
  { sym: 'BANKNIFTY:NSE', label: 'BANK NIFTY', valId: 's-banknifty', chgId: 's-banknifty-chg' },
];
const DEFAULT_MACRO = [
  { key: 'usdinr', label: 'USD/INR', valId: 'm-usdinr', static: '--', live: true, tag: 'LIVE' },
  { key: 'crude', label: 'WTI Crude', valId: 'm-crude', static: '--', live: true, tag: 'DELAYED 15m' },
  { key: 'gold', label: 'Gold', valId: 'm-gold', static: '--', live: true, tag: 'DELAYED 15m' },
  { key: 'gsec', label: '10Y G-Sec', valId: 'm-gsec', static: '--', live: true, tag: 'DELAYED 15m' },
  { key: 'fii', label: 'FII Flow', valId: 'm-fii', static: 'Awaiting NSE EOD', live: true, cls: 'dn', tag: 'EOD' },
  { key: 'dii', label: 'DII Flow', valId: 'm-dii', static: 'Awaiting NSE EOD', live: true, cls: 'up', tag: 'EOD' },
];
const AVAILABLE_SYMBOLS = [
  { sym: 'NIFTY:NSE', label: 'NIFTY 50' }, { sym: 'SENSEX:BSE', label: 'SENSEX' },
  { sym: 'BANKNIFTY:NSE', label: 'BANK NIFTY' }, { sym: 'RELIANCE:NSE', label: 'RELIANCE' },
  { sym: 'HDFCBANK:NSE', label: 'HDFC BANK' }, { sym: 'ICICIBANK:NSE', label: 'ICICI BANK' },
  { sym: 'SBIN:NSE', label: 'SBI' }, { sym: 'WIPRO:NSE', label: 'WIPRO' },
  { sym: 'TATAMOTORS:NSE', label: 'TATA MOTORS' }, { sym: 'TATASTEEL:NSE', label: 'TATA STEEL' },
  { sym: 'ADANIENT:NSE', label: 'ADANI ENT' }, { sym: 'BAJFINANCE:NSE', label: 'BAJAJ FIN' },
  { sym: 'MARUTI:NSE', label: 'MARUTI' }, { sym: 'AXISBANK:NSE', label: 'AXIS BANK' },
  { sym: 'KOTAKBANK:NSE', label: 'KOTAK BANK' }, { sym: 'LT:NSE', label: 'L&T' },
  { sym: 'SUNPHARMA:NSE', label: 'SUN PHARMA' }, { sym: 'HINDUNILVR:NSE', label: 'HUL' },
];
const AVAILABLE_MACRO = [
  { key: 'usdinr', label: 'USD/INR', static: '--', live: true, tag: 'LIVE' },
  { key: 'crude', label: 'WTI Crude', static: '--', live: true, tag: 'DELAYED 15m' },
  { key: 'gold', label: 'Gold', static: '--', live: true, tag: 'DELAYED 15m' },
  { key: 'gsec', label: '10Y G-Sec', static: '--', live: true, tag: 'DELAYED 15m' },
  { key: 'fii', label: 'FII Flow', static: 'Awaiting NSE EOD', live: false, cls: 'dn', tag: 'EOD' },
  { key: 'dii', label: 'DII Flow', static: 'Awaiting NSE EOD', live: false, cls: 'up', tag: 'EOD' },
];

let editMode = false, dragSrc = null;
let appState = { view: 'indices', selectedIndex: null, selectedStock: null, userWatchlist: [] };
const BLOCKED_LEFT_RAIL_SYMBOLS = new Set(['TCS:NSE', 'INFY:NSE']);
const DEFAULT_INDEX_SYMBOLS = new Set(DEFAULT_INDICES.map(item => item.sym));
let userWatchlist = JSON.parse(localStorage.getItem('dw-watchlist') || 'null');
if (!Array.isArray(userWatchlist)) userWatchlist = [];
userWatchlist = userWatchlist
  .filter(item => item && item.sym && !BLOCKED_LEFT_RAIL_SYMBOLS.has(item.sym) && !DEFAULT_INDEX_SYMBOLS.has(item.sym))
  .map((item) => {
    const template = AVAILABLE_SYMBOLS.find(sym => sym.sym === item.sym);
    const base = template || { sym: item.sym, label: item.label || item.sym.split(':')[0] };
    const id = 's-' + base.sym.split(':')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    return { sym: base.sym, label: base.label, valId: id, chgId: id + '-chg' };
  });
appState.userWatchlist = userWatchlist.map(item => ({ ...item }));

function buildDefaultSidebarIndices() {
  const seen = new Set();
  return DEFAULT_INDICES.concat(appState.userWatchlist || []).filter((item) => {
    if (!item || !item.sym || BLOCKED_LEFT_RAIL_SYMBOLS.has(item.sym) || seen.has(item.sym)) return false;
    seen.add(item.sym);
    return true;
  }).map(item => ({ ...item }));
}

let sidebarIndices = JSON.parse(localStorage.getItem('dw-indices') || 'null') || buildDefaultSidebarIndices();
let sidebarMacro = JSON.parse(localStorage.getItem('dw-macro') || 'null') || DEFAULT_MACRO.map(x => ({ ...x }));

function sanitizeSidebarConfig() {
  const macroTemplate = new Map(AVAILABLE_MACRO.map(item => [item.key, item]));
  const allowedSymbols = new Set([...DEFAULT_INDEX_SYMBOLS, ...(appState.userWatchlist || []).map(item => item.sym)]);
  sidebarIndices = sidebarIndices
    .filter(item => item && item.sym && allowedSymbols.has(item.sym) && !BLOCKED_LEFT_RAIL_SYMBOLS.has(item.sym))
    .map(item => ({ ...item }));
  if (!sidebarIndices.length) sidebarIndices = buildDefaultSidebarIndices();
  const existingSymbols = new Set(sidebarIndices.map(item => item.sym));
  DEFAULT_INDICES.forEach((item) => {
    if (!existingSymbols.has(item.sym)) sidebarIndices.unshift({ ...item });
  });
  sidebarIndices = buildDefaultSidebarIndices().filter((item) => {
    if (!existingSymbols.has(item.sym) && !DEFAULT_INDEX_SYMBOLS.has(item.sym)) return false;
    return true;
  });
  sidebarMacro = sidebarMacro.map(item => { const template = macroTemplate.get(item.key); return template ? { ...template, ...item, label: template.label, tag: template.tag } : item; }).filter(item => macroTemplate.has(item.key));
  if (!sidebarMacro.length) sidebarMacro = DEFAULT_MACRO.map(item => ({ ...item }));
}

function truthTagClass(tag) { const key = String(tag || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'); return 'truth-tag-' + key; }
function saveConfig() {
  localStorage.setItem('dw-indices', JSON.stringify(sidebarIndices));
  localStorage.setItem('dw-macro', JSON.stringify(sidebarMacro));
  localStorage.setItem('dw-watchlist', JSON.stringify(appState.userWatchlist || []));
}
function resetToDefaults() {
  appState.userWatchlist = [];
  sidebarIndices = DEFAULT_INDICES.map(x => ({ ...x }));
  sidebarMacro = DEFAULT_MACRO.map(x => ({ ...x }));
  saveConfig();
  renderSidebar();
  fetchLivePrices();
}
function toggleEdit() { editMode = !editMode; document.body.classList.toggle('edit-mode', editMode); const b = document.getElementById('edit-btn'); b.textContent = editMode ? 'DONE' : 'EDIT'; b.classList.toggle('active', editMode); renderSidebar(); }
function renderSidebar() { renderSidebarIndices(); renderMacro(); decorateMacroRows(); }
function getSidebarViewAction(sym) {
  if (INDEX_VIEW_CONFIG[sym]) return `openIndexDetail('${sym}')`;
  if (STOCK_STATIC_DATA[sym]) return `openStockDetail('${sym}')`;
  return '';
}
function renderSidebarIndices() {
  const el = document.getElementById('idx-list'); el.innerHTML = '';
  sidebarIndices.forEach((item, i) => {
    const d = document.createElement('div'); d.className = 'idx-cell'; d.draggable = editMode; d.dataset.i = i; d.dataset.section = 'idx';
    const action = getSidebarViewAction(item.sym);
    if (action && !editMode) { d.classList.add('idx-cell-nav'); d.setAttribute('role', 'button'); d.tabIndex = 0; d.setAttribute('onclick', action); d.setAttribute('onkeydown', `if(event.key==='Enter'||event.key===' '){event.preventDefault();${action};}`); }
    d.innerHTML = `<span class="edit-drag">⠿</span><div class="idx-name">${item.label}</div><div class="idx-val" id="${item.valId}">--</div><div class="idx-chg" id="${item.chgId}">--</div><div class="week52-bar" id="w52-${item.valId}" style="display:none;margin-top:5px"><div style="display:flex;justify-content:space-between;font-size:10px;color:#444;margin-bottom:2px"><span id="w52l-${item.valId}"></span><span style="color:#666">52W</span><span id="w52h-${item.valId}"></span></div><div style="height:3px;background:#1a1a2e;border-radius:2px;position:relative"><div id="w52p-${item.valId}" style="position:absolute;top:-2px;width:7px;height:7px;background:#ff6600;border-radius:50%;transform:translateX(-50%)"></div></div></div><span class="edit-del" onclick="event.stopPropagation();removeIdx(${i})">✕</span>`;
    if (editMode) attachDrag(d, 'idx', i);
    el.appendChild(d);
  });
  if (editMode) { const rst = document.createElement('div'); rst.style.cssText = 'text-align:center;padding:6px 0 2px'; rst.innerHTML = '<span onclick="resetToDefaults()" style="color:#ff6600;font-size:11px;cursor:pointer;letter-spacing:.5px;opacity:.7;transition:opacity .2s" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.7">↺ RESET TO DEFAULTS</span>'; el.appendChild(rst); }
  const add = document.createElement('div'); add.id = 'add-idx-row';
  add.innerHTML = `<input class="add-input" id="add-idx-sym" type="text" placeholder="e.g. RELIANCE" list="add-idx-list" autocomplete="off" style="flex:1"/><datalist id="add-idx-list">${AVAILABLE_SYMBOLS.map(s => `<option value="${s.sym}">${s.label}</option>`).join('')}</datalist><button class="add-btn" onclick="addIdx()">+ ADD</button>`;
  el.appendChild(add);
  animateCollection('#idx-list .idx-cell', { y: 10, stagger: 0.035, duration: 0.34 });
}

function update52WBar(valId, price, low, high) {
  if (!low || !high || low >= high) return;
  const bar = document.getElementById(`w52-${valId}`); const lEl = document.getElementById(`w52l-${valId}`); const hEl = document.getElementById(`w52h-${valId}`); const dot = document.getElementById(`w52p-${valId}`);
  if (!bar || !lEl || !hEl || !dot) return;
  bar.style.display = 'block';
  lEl.textContent = low >= 1000 ? low.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : low.toFixed(0);
  hEl.textContent = high >= 1000 ? high.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : high.toFixed(0);
  const pct = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
  dot.style.left = pct + '%';
  dot.style.background = pct < 30 ? '#ff4444' : pct > 70 ? '#00cc66' : '#ff6600';
}

function renderMacro() {
  const el = document.getElementById('macro-list'); el.innerHTML = '';
  sidebarMacro.forEach((item, i) => {
    const d = document.createElement('div'); d.className = 'macro-row'; d.draggable = editMode; d.dataset.i = i; d.dataset.section = 'macro';
    d.innerHTML = `<span class="edit-drag">⠿</span><span class="mk">${item.label}</span><span class="mv ${item.cls || ''}" id="${item.valId || 'm-' + item.key}">${item.static || '--'}</span><span class="edit-del" onclick="removeMacro(${i})">✕</span>`;
    if (editMode) attachDrag(d, 'macro', i);
    el.appendChild(d);
  });
  const add = document.createElement('div'); add.id = 'add-macro-row';
  add.innerHTML = `<select class="add-input" id="add-macro-key" style="flex:1">${AVAILABLE_MACRO.map(m => `<option value="${m.key}">${m.label}</option>`).join('')}</select><button class="add-btn" onclick="addMacro()">+ ADD</button>`;
  el.appendChild(add);
  animateCollection('#macro-list .macro-row', { y: 8, stagger: 0.03, duration: 0.3 });
}

function decorateMacroRows() {
  document.querySelectorAll('#macro-list .macro-row').forEach((row, i) => {
    const item = sidebarMacro[i]; const labelEl = row.querySelector('.mk');
    if (!item || !labelEl || !item.tag) return;
    if (row.querySelector('.truth-tag')) return;
    const wrap = document.createElement('span'); wrap.className = 'mk-wrap'; labelEl.replaceWith(wrap); wrap.appendChild(labelEl);
    const tag = document.createElement('span'); tag.className = 'truth-tag ' + truthTagClass(item.tag); tag.textContent = item.tag; wrap.appendChild(tag);
  });
}

function attachDrag(el, section, i) {
  el.addEventListener('dragstart', e => { dragSrc = { section, i }; e.dataTransfer.effectAllowed = 'move'; });
  el.addEventListener('dragover', e => { e.preventDefault(); el.style.borderTop = '2px solid #ff6600'; });
  el.addEventListener('dragleave', () => { el.style.borderTop = ''; });
  el.addEventListener('drop', e => {
    e.preventDefault(); el.style.borderTop = '';
    if (!dragSrc || dragSrc.section !== section) return;
    const from = dragSrc.i, to = parseInt(el.dataset.i); if (from === to) return;
    const arr = section === 'idx' ? sidebarIndices : sidebarMacro; const [moved] = arr.splice(from, 1); arr.splice(to, 0, moved);
    saveConfig(); renderSidebar();
  });
}

function removeIdx(i) {
  const removed = sidebarIndices[i];
  sidebarIndices.splice(i, 1);
  if (removed && !DEFAULT_INDEX_SYMBOLS.has(removed.sym)) {
    appState.userWatchlist = (appState.userWatchlist || []).filter(item => item.sym !== removed.sym);
  }
  saveConfig();
  renderSidebar();
}
function removeMacro(i) { sidebarMacro.splice(i, 1); saveConfig(); renderSidebar(); }
function addIdx() {
  const input = document.getElementById('add-idx-sym'); if (!input) return;
  const val = input.value.trim().toUpperCase(); if (!val) return;
  const match = AVAILABLE_SYMBOLS.find(s => s.sym.toUpperCase() === val || s.sym.split(':')[0].toUpperCase() === val || s.label.toUpperCase() === val);
  const sym = match ? match.sym : (val.includes(':') ? val : val + ':NSE'); const label = match ? match.label : val.split(':')[0];
  const id = 's-' + sym.split(':')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  if (sidebarIndices.find(x => x.sym === sym)) { input.value = ''; return; }
  if (!DEFAULT_INDEX_SYMBOLS.has(sym)) {
    appState.userWatchlist = [...(appState.userWatchlist || []), { sym, label, valId: id, chgId: id + '-chg' }];
  }
  sidebarIndices.push({ sym, label, valId: id, chgId: id + '-chg' }); input.value = ''; saveConfig(); renderSidebar(); fetchLivePrices();
}
function addMacro() {
  const key = document.getElementById('add-macro-key')?.value; if (!key) return;
  const t = AVAILABLE_MACRO.find(m => m.key === key);
  if (!t || sidebarMacro.find(m => m.key === key)) return;
  sidebarMacro.push({ ...t, valId: 'm-' + key }); saveConfig(); renderSidebar();
}

const INDEX_VIEW_CONFIG = {
  'NIFTY:NSE': {
    label: 'Nifty 50',
    code: 'LEVEL 1 · INDICES',
    note: 'Large-cap India benchmark. Use this as the primary market pulse.',
    constituents: [
      { sym: 'HDFCBANK:NSE', label: 'HDFC Bank', weight: 13.2, sector: 'Financials', pe: 18.4, industryPe: 16.9, debtToEquity: 6.8 },
      { sym: 'RELIANCE:NSE', label: 'Reliance', weight: 9.1, sector: 'Energy', pe: 24.6, industryPe: 19.8, debtToEquity: 0.42 },
      { sym: 'ICICIBANK:NSE', label: 'ICICI Bank', weight: 8.2, sector: 'Financials', pe: 17.8, industryPe: 16.9, debtToEquity: 7.1 },
      { sym: 'INFY:NSE', label: 'Infosys', weight: 6.1, sector: 'IT', pe: 29.5, industryPe: 27.2, debtToEquity: 0.09 },
      { sym: 'TCS:NSE', label: 'TCS', weight: 4.8, sector: 'IT', pe: 31.4, industryPe: 27.2, debtToEquity: 0.12 },
      { sym: 'SBIN:NSE', label: 'SBI', weight: 3.1, sector: 'Financials', pe: 10.4, industryPe: 16.9, debtToEquity: 12.6 },
      { sym: 'BHARTIARTL:NSE', label: 'Bharti Airtel', weight: 4.3, sector: 'Telecom', pe: 62.7, industryPe: 38.1, debtToEquity: 1.86 },
      { sym: 'LT:NSE', label: 'L&T', weight: 3.7, sector: 'Industrials', pe: 34.8, industryPe: 28.4, debtToEquity: 1.21 }
    ]
  },
  'SENSEX:BSE': {
    label: 'Sensex',
    code: 'LEVEL 1 · INDICES',
    note: 'BSE large-cap basket with concentrated heavyweight representation.',
    constituents: [
      { sym: 'HDFCBANK:NSE', label: 'HDFC Bank', weight: 14.6, sector: 'Financials', pe: 18.4, industryPe: 16.9, debtToEquity: 6.8 },
      { sym: 'RELIANCE:NSE', label: 'Reliance', weight: 11.3, sector: 'Energy', pe: 24.6, industryPe: 19.8, debtToEquity: 0.42 },
      { sym: 'ICICIBANK:NSE', label: 'ICICI Bank', weight: 8.9, sector: 'Financials', pe: 17.8, industryPe: 16.9, debtToEquity: 7.1 },
      { sym: 'INFY:NSE', label: 'Infosys', weight: 7.9, sector: 'IT', pe: 29.5, industryPe: 27.2, debtToEquity: 0.09 },
      { sym: 'TCS:NSE', label: 'TCS', weight: 5.5, sector: 'IT', pe: 31.4, industryPe: 27.2, debtToEquity: 0.12 },
      { sym: 'SBIN:NSE', label: 'SBI', weight: 3.2, sector: 'Financials', pe: 10.4, industryPe: 16.9, debtToEquity: 12.6 }
    ]
  },
  'BANKNIFTY:NSE': {
    label: 'Bank Nifty',
    code: 'LEVEL 1 · INDICES',
    note: 'Concentrated banking benchmark. Track weights before reading sector momentum.',
    constituents: [
      { sym: 'HDFCBANK:NSE', label: 'HDFC Bank', weight: 29.5, sector: 'Private Bank', pe: 18.4, industryPe: 16.9, debtToEquity: 6.8 },
      { sym: 'ICICIBANK:NSE', label: 'ICICI Bank', weight: 24.8, sector: 'Private Bank', pe: 17.8, industryPe: 16.9, debtToEquity: 7.1 },
      { sym: 'SBIN:NSE', label: 'SBI', weight: 11.6, sector: 'PSU Bank', pe: 10.4, industryPe: 16.9, debtToEquity: 12.6 },
      { sym: 'KOTAKBANK:NSE', label: 'Kotak Bank', weight: 8.4, sector: 'Private Bank', pe: 20.7, industryPe: 16.9, debtToEquity: 5.9 },
      { sym: 'AXISBANK:NSE', label: 'Axis Bank', weight: 8.1, sector: 'Private Bank', pe: 14.1, industryPe: 16.9, debtToEquity: 7.4 },
      { sym: 'INDUSINDBK:NSE', label: 'IndusInd Bank', weight: 4.3, sector: 'Private Bank', pe: 11.2, industryPe: 16.9, debtToEquity: 8.8 }
    ]
  }
};

const STOCK_STATIC_DATA = Object.values(INDEX_VIEW_CONFIG).flatMap(index => index.constituents).reduce((acc, stock) => {
  if (!acc[stock.sym]) acc[stock.sym] = { ...stock };
  return acc;
}, {});

sanitizeSidebarConfig();
renderSidebar();
saveConfig();

// ── ALL STORIES ──
const ALL_STORIES = {
  market: [
    { headline: "Sensex sinks 1,470 pts to 74,563 — Nifty cracks to 23,151, a 10-month low", body: "BSE Sensex fell 1,470.50 points (-1.93%) to close at 74,563.92 on Friday, while Nifty 50 dropped 488.05 points (-2.06%) to 23,151.10. Market breadth was deeply negative across all sectors.", sentiment: "bear", tags: ["SENSEX", "NIFTY", "10-MONTH LOW"], source: "Trading Economics / ICICI Direct" },
    { headline: "Crude oil hits record $119.5/bbl — raising India's import bill, fiscal deficit concerns", body: "Crude oil prices hit a record $119.5 per barrel this week as Iran-Israel-US tensions escalated. For India — heavily import-dependent — this raises concerns about the fiscal deficit.", sentiment: "bear", tags: ["CRUDE OIL", "FISCAL DEFICIT", "INFLATION"], source: "News24 / ICICI Direct" },
    { headline: "FIIs dump ₹49,000 Cr in March — 11 consecutive sessions of selling", body: "Foreign institutional investors have sold approximately ₹49,000 crore of Indian equities in March 2026 — the largest single-month outflow since January 2025.", sentiment: "bear", tags: ["FII", "OUTFLOW", "DII"], source: "NewsX / Trading Economics" },
    { headline: "Nifty RSI falls below 30 — oversold zone reached but no reversal signal yet", body: "The Nifty 50's RSI has dropped below 30, entering oversold territory. Bank Nifty RSI is at 26.71. Analysts advise waiting for a decisive close above 23,777.", sentiment: "neutral", tags: ["RSI", "OVERSOLD", "TECHNICALS"], source: "5paisa Research" },
  ],
  banks: [
    { headline: "Bank Nifty crashes 1,343 pts (-2.44%) to 53,757 — down 7% for the week", body: "The Nifty Bank index closed at 53,757.85, down 1,343.10 points (-2.44%) on Friday. Bank Nifty is now down 12.96% from its 52-week high.", sentiment: "bear", tags: ["BANKNIFTY", "WEEKLY LOSS", "OVERSOLD"], source: "5paisa Research" },
    { headline: "PSU banks lead crash — UnionBank -4.45%, PNB -4.18%, Canara -3.98%, SBI -3.61%", body: "Public sector banks bore the brunt of Friday's sell-off. Union Bank fell 4.45%, PNB dropped 4.18%, Canara Bank shed 3.98%.", sentiment: "bear", tags: ["SBI", "PSU BANKS", "AXIS BANK"], source: "5paisa / ICICI Direct" },
    { headline: "RBI likely to hold rates at April MPC meeting despite inflation concerns — Reuters poll", body: "A Reuters poll of 52 economists showed a majority expect the RBI to keep the repo rate unchanged at 6.25% at its April 7–9 MPC meeting.", sentiment: "neutral", tags: ["RBI", "MPC", "REPO RATE"], source: "Reuters" },
  ],
  sectors: [
    { headline: "Nifty Auto worst sectoral performer — crashes 10.6% in a single week", body: "The Nifty Auto index was the worst-performing sectoral index this week, crashing 10.6% or 2,881 points.", sentiment: "bear", tags: ["NIFTY AUTO", "TATA MOTORS", "SECTOR CRASH"], source: "Upstox" },
    { headline: "IT sector outperforms — Nifty IT up 0.55% as weak rupee boosts dollar revenue", body: "The Nifty IT index bucked the broad market decline, rising 0.55%. A weakening rupee is boosting the revenue outlook for IT exporters.", sentiment: "bull", tags: ["NIFTY IT", "RUPEE", "INFOSYS"], source: "Nomura / CNBC TV18" },
  ],
  macro: [
    { headline: "India CPI rises to 11-month high of 3.21% in February — above estimate of 3.1%", body: "India's retail inflation climbed to 3.21% in February 2026, an 11-month high.", sentiment: "bear", tags: ["CPI", "INFLATION", "RBI"], source: "Trading Economics" },
    { headline: "Rupee weakens to 92.44 against US dollar — FII outflows and crude surge weigh", body: "The Indian rupee weakened to 92.4350 against the US dollar. The rupee has been battered by FII outflows.", sentiment: "bear", tags: ["RUPEE", "USD/INR", "FII"], source: "ICICI Direct" },
  ],
  stocks: [
    { headline: "Tata Motors wins 5,000+ bus orders from 8 state transport bodies across India", body: "Tata Motors secured orders for over 5,000 buses from MSRTC, GSRTC, NWKRTC, TGSRTC, BSRTC, RSRTC, KSRTC, and Haryana Roadways.", sentiment: "bull", tags: ["TATA MOTORS", "EV", "ORDER WIN"], source: "DSIJ Insights" },
    { headline: "Zomato hits 52-week low — quick commerce competition intensifies", body: "Zomato shares hit a new 52-week low, falling 5.3%. Goldman Sachs cut their target price from ₹285 to ₹240.", sentiment: "bear", tags: ["ZOMATO", "QUICK COMMERCE", "52W LOW"], source: "Goldman Sachs / Economic Times" },
  ],
  global: [
    { headline: "Iran-Israel-US conflict escalates — Strait of Hormuz fears push oil to $119.5/bbl", body: "The Iran-Israel-US conflict has entered a more dangerous phase with fears of disruptions to the Strait of Hormuz.", sentiment: "bear", tags: ["IRAN", "CRUDE OIL", "STRAIT OF HORMUZ"], source: "News24 / NewsX" },
    { headline: "Gold hits ₹1,59,400/10g on MCX — safe haven demand surges amid geopolitical chaos", body: "Gold prices on MCX hit ₹1,59,400 per 10 grams this week, driven by surging safe-haven demand.", sentiment: "bull", tags: ["GOLD", "MCX", "SAFE HAVEN"], source: "Motilal Oswal / Economic Times" },
  ]
};

// ── STATE ──
let currentRP = 'detail', currentTicker = 'NIFTY', currentStories = [], activeIdx = -1, currentCat = 'market';
let miniVixSeries = [];
let miniGsecSeries = [];
let commoditiesData = null;
let lockinData = null;
let manualPulseRoute = null;
let headlinesEmptyState = { title: 'No live stories yet', detail: 'Refresh the current feed or switch categories.' };
let dashStore = null;
let sectionLoadState = { indices: 'loading', news: 'idle', slow: 'idle', sentiment: 'idle' };
const stockDetailCache = {};
const stockDetailInFlight = {};
const stockDetailControllers = {};
let modalLoadState = { constituentsReady: false };
let constituentsHydrationToken = 0;
let newsRequestController = null;
let newsRequestToken = 0;
let indicesFastController = null;
let dashboardSlowController = null;
let refreshNewsTimer = null;
let slowBootScheduled = false;
let pendingStateTransition = '';
let isStartupBoot = true;

function getStateTransition(fromView, toView) {
  if (!toView || fromView === toView) return '';
  if (fromView === 'indices' && toView === 'indexDetail') return 'forward';
  if (fromView === 'indexDetail' && toView === 'stockDetail') return 'deeper';
  if (fromView === 'stockDetail' && toView === 'indexDetail') return 'back-deeper';
  if (fromView === 'indexDetail' && toView === 'indices') return 'back';
  if (fromView === 'stockDetail' && toView === 'indices') return 'back';
  return '';
}

function setState(updates = {}) {
  pendingStateTransition = getStateTransition(appState.view, updates.view ?? appState.view);
  appState = { ...appState, ...updates };
  renderApp();
}
window.setState = setState;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[match]));
}

function getExplorerRoot() { return document.getElementById('state-view-root'); }
function getExplorerModalHost() {
  let host = document.getElementById('state-modal-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'state-modal-host';
    document.body.appendChild(host);
  }
  return host;
}
function getQuoteForKey(sym) { return stockDetailCache[sym] || dashStore?.quotes?.[sym] || null; }
function getConstituentRows(indexKey) { return (INDEX_VIEW_CONFIG[indexKey]?.constituents || []).slice().sort((a, b) => b.weight - a.weight); }
function findStockMeta(sym) { return STOCK_STATIC_DATA[sym] || null; }
function getStoryUniverse() { return Object.values(newsCache).filter(entry => entry && Array.isArray(entry.stories)).flatMap(entry => entry.stories).concat(Array.isArray(currentStories) ? currentStories : []); }

function getStockContextStories(sym) {
  const stock = findStockMeta(sym);
  if (!stock) return [];
  const symToken = sym.split(':')[0].toLowerCase();
  const labelToken = stock.label.toLowerCase();
  const seen = new Set();
  return getStoryUniverse().filter((story) => {
    const hay = `${story?.headline || ''} ${story?.body || ''} ${(story?.tags || []).join(' ')}`.toLowerCase();
    return hay.includes(symToken) || hay.includes(labelToken);
  }).filter((story) => {
    const key = `${story?.headline || ''}|${story?.source || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

function getIndexQuoteSummary(indexKey) {
  const quote = getQuoteForKey(indexKey);
  const pending = !quote && sectionLoadState.indices === 'loading';
  return {
    price: quote ? fmtPrice(quote.close || quote.price) : '---',
    change: quote ? fmtChg(quote.change, quote.percent_change) : { txt: '---', cls: 'flat' },
    stale: Boolean(quote?.stale),
    pending
  };
}

function fmtCompactNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '--';
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function getStateShellClass() {
  return `state-shell${pendingStateTransition ? ` state-shell-${pendingStateTransition}` : ''}`;
}

function queueConstituentModalHydration(indexKey) {
  constituentsHydrationToken += 1;
  const token = constituentsHydrationToken;
  modalLoadState.constituentsReady = false;
  setTimeout(() => {
    if (token !== constituentsHydrationToken) return;
    if (!appState.selectedIndex || appState.selectedIndex !== indexKey) return;
    if (appState.view !== 'indexDetail' && appState.view !== 'stockDetail') return;
    modalLoadState.constituentsReady = true;
    renderApp();
  }, 0);
}

function renderApp() {
  const root = getExplorerRoot(); const emptyEl = document.getElementById('detail-empty'); const bodyEl = document.getElementById('detail-body');
  if (!root || !emptyEl || !bodyEl) return;
  if (activeIdx >= 0) {
    root.style.display = 'none';
    const host = getExplorerModalHost();
    host.innerHTML = '';
    host.className = '';
    return;
  }
  root.style.display = 'block';
  emptyEl.style.display = 'none';
  bodyEl.style.display = 'none';
  root.classList.toggle('state-view-detail', appState.view !== 'indices');
  renderIndices();
  renderExplorerModal();
}

function renderIndices() {
  const root = getExplorerRoot(); if (!root) return;
  const cards = Object.entries(INDEX_VIEW_CONFIG).map(([indexKey, index]) => {
    const summary = getIndexQuoteSummary(indexKey);
    return `<button class="state-card state-card-index ${appState.selectedIndex === indexKey ? 'is-active' : ''} ${summary.pending ? 'is-loading' : ''}" type="button" onclick="selectIndexView('${indexKey}')">
      <div class="state-card-title">${escapeHtml(index.label)}</div>
      <div class="state-card-meta">
        <span class="state-price ${summary.pending ? 'state-placeholder-text' : ''}">${summary.price}</span>
        <span class="state-change ${summary.change.cls} ${summary.pending ? 'state-placeholder-text' : ''}">${summary.change.txt}</span>
      </div>
      <div class="state-card-minor">${summary.pending ? 'Loading fast quote' : (summary.stale ? 'Fallback quote' : 'Live quote')}</div>
    </button>`;
  }).join('');
  root.innerHTML = `<div class="${getStateShellClass()}">
    <div class="state-shell-head">
      <div>
        <div class="state-eyebrow">LEVEL 1</div>
        <div class="state-title">Indices</div>
      </div>
      <div class="state-shell-copy">${sectionLoadState.indices === 'loading' ? 'Loading fast quotes first. Details and secondary data hydrate independently.' : 'Minimal market view. Select an index to move into constituents, weights, and sectors.'}</div>
    </div>
    <div class="state-grid">${cards}</div>
  </div>`;
}

function buildIndexModalMarkup() {
  const index = INDEX_VIEW_CONFIG[appState.selectedIndex];
  if (!index) return '';
  const summary = getIndexQuoteSummary(appState.selectedIndex);
  const constituents = getConstituentRows(appState.selectedIndex);
  const rows = modalLoadState.constituentsReady
    ? (() => {
        const maxWeight = constituents.reduce((max, stock) => Math.max(max, Number(stock.weight) || 0), 0) || 1;
        return constituents.map((stock, idx) => {
          const width = Math.max(8, Math.min(100, ((Number(stock.weight) || 0) / maxWeight) * 100));
          const symbol = stock.sym.includes(':') ? stock.sym.split(':')[0] : stock.sym;
          return `<button class="state-modal-row" type="button" onclick="openStockDetail('${stock.sym}')">
            <span class="state-modal-rank">${idx + 1}</span>
            <span class="state-modal-name-block">
              <span class="state-modal-name">${escapeHtml(stock.label)}</span>
              <span class="state-modal-sub">${escapeHtml(symbol)}</span>
            </span>
            <span class="state-modal-weight">${stock.weight.toFixed(1)}%</span>
            <span class="state-modal-bar" aria-hidden="true"><span class="state-modal-bar-fill" style="width:${width}%"></span></span>
          </button>`;
        }).join('');
      })()
    : Array.from({ length: Math.min(6, constituents.length || 6) }, () => `<div class="state-modal-row state-modal-row-skeleton" aria-hidden="true">
        <span class="state-modal-rank state-placeholder-text">--</span>
        <span class="state-modal-name-block">
          <span class="section-skeleton-line"></span>
          <span class="section-skeleton-line section-skeleton-line-short"></span>
        </span>
        <span class="section-skeleton-line section-skeleton-line-short"></span>
        <span class="state-modal-bar"><span class="state-modal-bar-fill state-modal-bar-fill-skeleton" style="width:58%"></span></span>
      </div>`).join('');
  return `<section class="state-modal-card state-modal-card-index ${pendingStateTransition ? `state-modal-card-${pendingStateTransition}` : ''}" onclick="event.stopPropagation()">
    <div class="state-modal-head">
      <div>
        <div class="state-eyebrow">INDEX DETAIL</div>
        <div class="state-title">${escapeHtml(index.label)}</div>
      </div>
      <button class="state-modal-close" type="button" onclick="closeModal()">×</button>
    </div>
    <div class="state-hero-line">
      <span class="state-price">${summary.price}</span>
      <span class="state-change ${summary.change.cls}">${summary.change.txt}</span>
    </div>
    <div class="state-modal-section">
      <div class="state-block-title">Constituents</div>
      <div class="state-panel-copy">${modalLoadState.constituentsReady ? 'Click any row to open stock detail. Quote data loads on demand.' : 'Loading constituent structure…'}</div>
      <div class="state-modal-list">${rows}</div>
    </div>
  </section>`;
}

function buildStockModalMarkup() {
  const meta = findStockMeta(appState.selectedStock);
  if (!meta) return '';
  const quote = stockDetailCache[appState.selectedStock];
  const change = quote ? fmtChg(quote.change, quote.percent_change) : { txt: '--', cls: 'flat' };
  const price = quote ? fmtPrice(quote.close || quote.price) : '--';
  const volume = quote ? fmtCompactNumber(quote.volume) : '--';
  const marketCap = quote ? fmtCompactNumber(quote.marketCap) : '--';
  const isLoading = Boolean(stockDetailInFlight[appState.selectedStock]);
  const metricsMarkup = isLoading && !quote
    ? `<div class="state-stock-grid">
        ${Array.from({ length: 4 }, () => `<div class="state-metric state-metric-skeleton">
          <span class="section-skeleton-line section-skeleton-line-short"></span>
          <span class="section-skeleton-line"></span>
        </div>`).join('')}
      </div>`
    : `<div class="state-stock-grid">
        <div class="state-metric"><span>Price</span><strong>${price}</strong></div>
        <div class="state-metric"><span>Change %</span><strong class="${change.cls}">${change.txt}</strong></div>
        <div class="state-metric"><span>Volume</span><strong>${volume}</strong></div>
        <div class="state-metric"><span>Market Cap</span><strong>${marketCap}</strong></div>
      </div>`;
  return `<section class="state-modal-card state-modal-card-stock ${pendingStateTransition ? `state-modal-card-${pendingStateTransition}` : ''}" onclick="event.stopPropagation()">
    <div class="state-modal-head">
      <div>
        <div class="state-backline"><button class="state-back" type="button" onclick="goToIndexDetail()">← Back to index</button><span class="state-eyebrow">STOCK DETAIL</span></div>
        <div class="state-title">${escapeHtml(quote?.name || meta.label)}</div>
      </div>
      <button class="state-modal-close" type="button" onclick="closeModal()">×</button>
    </div>
    <div class="state-hero-line">
      <span class="state-price">${price}</span>
      <span class="state-change ${change.cls}">${change.txt}</span>
      <span class="state-inline-note">${isLoading ? 'Loading Yahoo quote…' : 'Live Yahoo quote'}</span>
    </div>
    ${metricsMarkup}
  </section>`;
}

function renderExplorerModal() {
  const host = getExplorerModalHost();
  const hasIndexModal = Boolean(appState.selectedIndex && INDEX_VIEW_CONFIG[appState.selectedIndex] && (appState.view === 'indexDetail' || appState.view === 'stockDetail'));
  const hasStockModal = Boolean(appState.view === 'stockDetail' && appState.selectedStock);
  if (!hasIndexModal && !hasStockModal) {
    host.innerHTML = '';
    host.className = '';
    return;
  }
  host.className = `state-modal-host${hasStockModal ? ' has-stock-modal' : ''}`;
  host.innerHTML = `<div class="state-modal-backdrop" onclick="handleModalBackdropClick(event)">
    <div class="state-modal-stack">
      ${hasIndexModal ? buildIndexModalMarkup() : ''}
      ${hasStockModal ? buildStockModalMarkup() : ''}
    </div>
  </div>`;
}

function renderIndexDetail() {
  const root = getExplorerRoot(); if (!root) return;
  const index = INDEX_VIEW_CONFIG[appState.selectedIndex];
  if (!index) { setState({ view: 'indices', selectedIndex: null, selectedStock: null }); return; }
  const summary = getIndexQuoteSummary(appState.selectedIndex);
  const rows = getConstituentRows(appState.selectedIndex).map((stock, idx) => {
    const quote = getQuoteForKey(stock.sym);
    const change = quote ? fmtChg(quote.change, quote.percent_change) : { txt: '--', cls: 'flat' };
    const price = quote ? fmtPrice(quote.close || quote.price) : '--';
    const low = Number(quote?.week52Low); const high = Number(quote?.week52High);
    const highLow = Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0 ? `${low.toLocaleString('en-IN', { maximumFractionDigits: 0 })} / ${high.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '-- / --';
    return `<button class="state-row" type="button" onclick="openStockDetail('${stock.sym}')">
      <span class="state-rank">${idx + 1}</span>
      <span class="state-name-block">
        <span class="state-name">${escapeHtml(stock.label)}</span>
        <span class="state-sub">${escapeHtml(stock.sector)}</span>
      </span>
      <span class="state-weight">${stock.weight.toFixed(1)}%</span>
      <span class="state-price-col">${price}</span>
      <span class="state-change ${change.cls}">${change.txt}</span>
      <span class="state-range">${highLow}</span>
    </button>`;
  }).join('');
  root.innerHTML = `<div class="${getStateShellClass()}">
    <div class="state-shell-head">
      <div>
        <div class="state-backline"><button class="state-back" type="button" onclick="goToIndicesView()">← All indices</button><span class="state-eyebrow">LEVEL 2</span></div>
        <div class="state-title">${escapeHtml(index.label)}</div>
      </div>
      <div class="state-shell-copy">${escapeHtml(index.note)}</div>
    </div>
    <div class="state-hero-line">
      <span class="state-price">${summary.price}</span>
      <span class="state-change ${summary.change.cls}">${summary.change.txt}</span>
      <span class="state-inline-note">${index.constituents.length} weighted names · highest to lowest</span>
    </div>
    <div class="state-table-head">
      <span>#</span><span>Name</span><span>Wt</span><span>CMP</span><span>%</span><span>52W L/H</span>
    </div>
    <div class="state-table">${rows}</div>
  </div>`;
}

function renderIndexDetailView() {
  const root = getExplorerRoot(); if (!root) return;
  const index = INDEX_VIEW_CONFIG[appState.selectedIndex];
  if (!index) { setState({ view: 'indices', selectedIndex: null, selectedStock: null }); return; }

  const summary = getIndexQuoteSummary(appState.selectedIndex);
  const indexQuote = getQuoteForKey(appState.selectedIndex);
  const dayLow = Number(indexQuote?.low);
  const dayHigh = Number(indexQuote?.high);
  const spot = Number(indexQuote?.close || indexQuote?.price);
  const hasDayRange = Number.isFinite(dayLow) && Number.isFinite(dayHigh) && dayHigh > dayLow;
  const rangePct = hasDayRange && Number.isFinite(spot) ? Math.max(0, Math.min(100, ((spot - dayLow) / (dayHigh - dayLow)) * 100)) : 50;

  const constituents = getConstituentRows(appState.selectedIndex);
  const maxWeight = constituents.reduce((max, stock) => Math.max(max, Number(stock.weight) || 0), 0) || 1;
  const constituentRows = constituents.map((stock) => {
    const quote = getQuoteForKey(stock.sym);
    const change = quote ? fmtChg(quote.change, quote.percent_change) : { txt: '--', cls: 'flat' };
    const price = quote ? fmtPrice(quote.close || quote.price) : '--';
    const width = Math.max(8, Math.min(100, (Number(stock.weight) / maxWeight) * 100));
    return `<button class="state-bar-row" type="button" onclick="openStockDetail('${stock.sym}')">
      <span class="state-bar-main">
        <span class="state-name-block">
          <span class="state-name">${escapeHtml(stock.label)}</span>
          <span class="state-sub">${escapeHtml(stock.sector)}</span>
        </span>
        <span class="state-bar-weight">${stock.weight.toFixed(1)}%</span>
      </span>
      <span class="state-bar-track"><span class="state-bar-fill" style="width:${width}%"></span></span>
      <span class="state-bar-meta">
        <span class="state-price-col">${price}</span>
        <span class="state-change ${change.cls}">${change.txt}</span>
      </span>
    </button>`;
  }).join('');

  const sectorWeights = constituents.reduce((acc, stock) => {
    const sector = stock.sector || 'Other';
    acc[sector] = (acc[sector] || 0) + (Number(stock.weight) || 0);
    return acc;
  }, {});
  const sectors = Object.entries(sectorWeights).sort((a, b) => b[1] - a[1]);
  const maxSectorWeight = sectors.reduce((max, [, percent]) => Math.max(max, percent), 0) || 1;
  const sectorRows = sectors.map(([name, percent]) => {
    const width = Math.max(10, Math.min(100, (percent / maxSectorWeight) * 100));
    return `<div class="state-bar-row state-bar-row-static">
      <span class="state-bar-main">
        <span class="state-name-block">
          <span class="state-name">${escapeHtml(name)}</span>
        </span>
        <span class="state-bar-weight">${percent.toFixed(1)}%</span>
      </span>
      <span class="state-bar-track"><span class="state-bar-fill state-bar-fill-sector" style="width:${width}%"></span></span>
    </div>`;
  }).join('');

  root.innerHTML = `<div class="state-shell">
    <div class="state-shell-head">
      <div>
        <div class="state-backline"><button class="state-back" type="button" onclick="goToIndicesView()">← All indices</button><span class="state-eyebrow">LEVEL 2</span></div>
        <div class="state-title">${escapeHtml(index.label)}</div>
      </div>
      <div class="state-shell-copy">${escapeHtml(index.note)}</div>
    </div>
    <div class="state-hero-line">
      <span class="state-price">${summary.price}</span>
      <span class="state-change ${summary.change.cls}">${summary.change.txt}</span>
      <span class="state-inline-note">${constituents.length} weighted names · highest to lowest${summary.stale ? ' · fallback quote' : ''}</span>
    </div>
    <div class="state-detail-grid">
      <section class="state-panel">
        <div class="state-block-title">Constituents</div>
        <div class="state-panel-copy">Top stocks by weight. Select a row to move into stock detail.</div>
        <div class="state-bars">${constituentRows}</div>
      </section>
      <section class="state-panel">
        <div class="state-block-title">Sector Breakdown</div>
        <div class="state-panel-copy">Clean weight view of sector concentration inside this index.</div>
        <div class="state-bars">${sectorRows}</div>
      </section>
      <section class="state-panel state-panel-range">
        <div class="state-block-title">Range</div>
        <div class="state-panel-copy">Current position inside today's low to high range.</div>
        <div class="state-day-range">
          <div class="state-range-head">
            <span>Day low</span>
            <strong>${hasDayRange ? fmtPrice(dayLow) : '--'}</strong>
          </div>
          <div class="state-range-track state-range-track-main">
            <div class="state-range-fill"></div>
            <div class="state-range-marker" style="left:${rangePct}%"></div>
          </div>
          <div class="state-range-values">
            <span>${hasDayRange ? fmtPrice(dayLow) : '--'}</span>
            <span class="state-range-current">${summary.price}</span>
            <span>${hasDayRange ? fmtPrice(dayHigh) : '--'}</span>
          </div>
          <div class="state-range-note">${hasDayRange ? 'Day low → high' : 'Range unavailable'}</div>
        </div>
      </section>
    </div>
  </div>`;
}

function renderStockDetail() {
  const root = getExplorerRoot(); if (!root) return;
  const meta = findStockMeta(appState.selectedStock);
  if (!meta) { setState({ view: 'indices', selectedIndex: null, selectedStock: null }); return; }
  const quote = stockDetailCache[appState.selectedStock];
  const change = quote ? fmtChg(quote.change, quote.percent_change) : { txt: '--', cls: 'flat' };
  const price = quote ? fmtPrice(quote.close || quote.price) : '--';
  const volume = quote ? fmtCompactNumber(quote.volume) : '--';
  const marketCap = quote ? fmtCompactNumber(quote.marketCap) : '--';
  const isLoading = Boolean(stockDetailInFlight[appState.selectedStock]);
  root.innerHTML = `<div class="${getStateShellClass()}">
    <div class="state-shell-head">
      <div>
        <div class="state-backline"><button class="state-back" type="button" onclick="goToIndexDetail()">← Back to index</button><span class="state-eyebrow">LEVEL 3</span></div>
        <div class="state-title">${escapeHtml(quote?.name || meta.label)}</div>
      </div>
      <div class="state-shell-copy">${escapeHtml(meta.sector)}${quote?.stale ? ' · fallback quote' : ''}</div>
    </div>
    <div class="state-hero-line">
      <span class="state-price">${price}</span>
      <span class="state-change ${change.cls}">${change.txt}</span>
      <span class="state-inline-note">${isLoading ? 'Loading Yahoo quote…' : 'Live Yahoo quote'}</span>
    </div>
    <div class="state-stock-grid">
      <div class="state-metric"><span>Price</span><strong>${price}</strong></div>
      <div class="state-metric"><span>Change %</span><strong class="${change.cls}">${change.txt}</strong></div>
      <div class="state-metric"><span>Volume</span><strong>${volume}</strong></div>
      <div class="state-metric"><span>Market Cap</span><strong>${marketCap}</strong></div>
    </div>
  </div>`;
}

async function fetchStockDetail(symbol) {
  if (!symbol || stockDetailCache[symbol] || stockDetailInFlight[symbol]) return;
  stockDetailInFlight[symbol] = true;
  if (stockDetailControllers[symbol]) {
    try { stockDetailControllers[symbol].abort(); } catch {}
  }
  const controller = new AbortController();
  stockDetailControllers[symbol] = controller;
  renderApp();
  try {
    const ticker = symbol.includes(':') ? symbol.split(':')[0] : symbol;
    const res = await fetch(`/api/quote/${encodeURIComponent(ticker)}`, { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data?.error) stockDetailCache[symbol] = { ...data, symbol };
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('Stock detail fetch failed:', e.message);
  } finally {
    delete stockDetailInFlight[symbol];
    if (stockDetailControllers[symbol] === controller) delete stockDetailControllers[symbol];
    renderApp();
  }
}

function prefetchIndexConstituents(indexKey) {
  getConstituentRows(indexKey).forEach((stock) => {
    if (!getQuoteForKey(stock.sym)) fetchStockDetail(stock.sym);
  });
}

function closeModal() {
  constituentsHydrationToken += 1;
  modalLoadState.constituentsReady = false;
  if (appState.view === 'stockDetail') {
    setState({ view: 'indexDetail', selectedStock: null });
    queueConstituentModalHydration(appState.selectedIndex);
    return;
  }
  setState({ view: 'indices', selectedIndex: null, selectedStock: null });
}

function handleModalBackdropClick(event) {
  if (event.target === event.currentTarget) closeModal();
}

function goToIndicesView() { activeIdx = -1; setState({ view: 'indices', selectedIndex: null, selectedStock: null }); }
function selectIndexView(indexKey) { if (!INDEX_VIEW_CONFIG[indexKey]) return; activeIdx = -1; switchRP('detail'); modalLoadState.constituentsReady = false; setState({ selectedIndex: indexKey, selectedStock: null, view: 'indexDetail' }); queueConstituentModalHydration(indexKey); }
function openIndexDetail(indexKey) { if (!INDEX_VIEW_CONFIG[indexKey]) return; activeIdx = -1; switchRP('detail'); modalLoadState.constituentsReady = false; setState({ view: 'indexDetail', selectedIndex: indexKey, selectedStock: null }); queueConstituentModalHydration(indexKey); }
function openStockDetail(symbol) { if (!findStockMeta(symbol)) return; activeIdx = -1; switchRP('detail'); setState({ view: 'stockDetail', selectedStock: symbol }); fetchStockDetail(symbol); }
function goToIndexDetail() { if (appState.selectedIndex && INDEX_VIEW_CONFIG[appState.selectedIndex]) { activeIdx = -1; modalLoadState.constituentsReady = false; setState({ view: 'indexDetail', selectedStock: null }); queueConstituentModalHydration(appState.selectedIndex); return; } goToIndicesView(); }
window.goToIndicesView = goToIndicesView;
window.selectIndexView = selectIndexView;
window.openIndexDetail = openIndexDetail;
window.openStockDetail = openStockDetail;
window.goToIndexDetail = goToIndexDetail;
window.closeModal = closeModal;
window.handleModalBackdropClick = handleModalBackdropClick;

// ── GLOBAL DATA STORE — normalized with UPPERCASE keys ──
// FIX: always store full uppercase-keyed global data separately from dashboard
let globalData = null;
let globalFetching = false;

// ── FEAR & GREED STATE ──
let fngData = null;
let fngFetching = false;
let fngLastFetch = 0;

// ── CLOCK ──
function tick() {
  document.getElementById('clk').textContent = new Date().toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST';
  const h = parseInt(new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
  const day = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' });
  const open = day !== 'Sun' && day !== 'Sat' && h >= 9 && h < 16;
  const el = document.getElementById('mkt-st'); el.textContent = open ? 'NSE OPEN' : 'NSE CLOSED'; el.className = open ? 'mkt-open' : 'mkt-closed';
}
tick(); setInterval(tick, 1000);

// ── RIGHT PANEL ──
function switchRP(tab, options = {}) {
  const fetchAdviceOnOpen = options.fetchAdviceOnOpen ?? !isStartupBoot;
  currentRP = tab;
  document.querySelectorAll('.rp-tab').forEach(t => {
    const tabKey = t.dataset.rp || (t.textContent === 'STORY' ? 'detail' : t.textContent.toLowerCase());
    t.classList.toggle('active-rp-tab', tabKey === tab);
  });
  const panels = ['rp-story', 'rp-advice', 'rp-global', 'rp-heatmap', 'rp-mf', 'rp-commodities', 'rp-lockin', 'rp-feargreed'];
  panels.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  const panelMap = { detail: 'rp-story', advice: 'rp-advice', global: 'rp-global', heatmap: 'rp-heatmap', mf: 'rp-mf', commodities: 'rp-commodities', lockin: 'rp-lockin', feargreed: 'rp-feargreed' };
  const activePanel = document.getElementById(panelMap[tab]);
  if (activePanel) activePanel.style.display = 'block';

  // FIX: Global tab now always fetches from /api/global directly (uppercase keys)
  if (tab === 'global') fetchGlobal();
  if (tab === 'heatmap') fetchHeatmap();
  if (tab === 'mf') fetchMF();
  if (tab === 'commodities') fetchCommodities();
  if (tab === 'lockin') fetchLockin();
  if (tab === 'advice' && fetchAdviceOnOpen) updateAdviceForTicker(currentTicker);
  if (tab === 'feargreed') fetchFearGreed();
  saveLayout();
  refreshFinanceBridge();
}

// ── GLOBAL FETCH — always uses /api/global directly for correct uppercase keys ──
async function fetchGlobal() {
  if (globalFetching) return;
  globalFetching = true;
  try {
    const data = await fetch('/api/global').then(r => r.json());
    globalData = data; // Store with original uppercase keys
    renderGlobal(globalData);
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
    const glUp = document.getElementById('gl-updated');
    if (glUp) glUp.textContent = 'Updated ' + now + ' IST';
    // Also update the bridge global metric now that we have proper data
    refreshFinanceBridge();
  } catch (e) {
    const el = document.getElementById('gl-content');
    if (el) el.innerHTML = `<div style="color:#ff4444;font-size:13px;padding:20px">Error: ${e.message}</div>`;
  } finally {
    globalFetching = false;
  }
}

// FIX: forceGlobal now clears cache and refetches from /api/global
function forceGlobal() { globalData = null; fetchGlobal(); }

function applyTicker() {
  const v = document.getElementById('rp-ticker').value.trim().toUpperCase(); if (!v) return;
  currentTicker = v;
  document.getElementById('rp-ticker').value = '';
  const al = document.getElementById('advice-ticker-label'); if (al) al.textContent = 'LIVE SIGNAL - ' + v;
  updateAdviceForTicker(v);
  switchRP('advice');
  refreshFinanceBridge();
}

async function updateAdviceForTicker(t) {
  const key = (t || 'NIFTY').toUpperCase();
  const tickerLabel = document.getElementById('advice-ticker-label');
  if (tickerLabel) tickerLabel.textContent = 'LIVE SIGNAL - ' + key;
  const badge = document.getElementById('adv-stance-badge');
  const text = document.getElementById('adv-stance-text');
  try {
    const res = await fetch(`/api/advice/${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    const cls = d?.cls || 'neutral'; const stance = d?.stance || 'NEUTRAL'; const m = d?.metrics || {};
    const hasRealData = Number(m.price || 0) > 0;
    if (badge) { badge.textContent = stance; badge.style.background = cls === 'bull' ? '#003311' : cls === 'bear' ? '#1a0000' : '#1a1000'; badge.style.color = cls === 'bull' ? '#00cc66' : cls === 'bear' ? '#ff4444' : '#ff9900'; badge.style.border = '1px solid ' + (cls === 'bull' ? '#004d1a' : cls === 'bear' ? '#330000' : '#2a1800'); }
    if (text && hasRealData) { const l = d?.levels || {}; text.textContent = `${d?.message || ''} ${key} Price ${Number(m.price).toFixed(2)}, VIX ${Number(m.vix).toFixed(2)}, Crude ${Number(m.crude).toFixed(2)}. Support ${l.support ?? '--'}, Resistance ${l.resistance ?? '--'}.`; }
    else if (text) { _patchAdviceFromDOM(key); }
  } catch { _patchAdviceFromDOM(key); }
}

function _patchAdviceFromDOM(key) {
  const text = document.getElementById('adv-stance-text'); const badge = document.getElementById('adv-stance-badge');
  const priceEl = document.getElementById('s-nifty'); const price = priceEl?.textContent?.trim() || '--';
  if (badge) { badge.textContent = 'WAITING'; badge.style.background = '#101626'; badge.style.color = '#9bb2c7'; badge.style.border = '1px solid #273448'; }
  if (text) text.textContent = `Live signal pending for ${key}. Price: ${price}. Click REFRESH.`;
}

// ── FEAR & GREED ──
// Color and label helpers
function fngColor(score) {
  if (score >= 75) return '#00c98a';
  if (score >= 60) return '#5ec98a';
  if (score >= 45) return '#c9a84c';
  if (score >= 25) return '#ff8a38';
  return '#e45454';
}
function fngLabel(score) {
  if (score >= 75) return 'EXTREME GREED';
  if (score >= 60) return 'GREED';
  if (score >= 45) return 'NEUTRAL';
  if (score >= 25) return 'FEAR';
  return 'EXTREME FEAR';
}

function marketBiasColor(bias) {
  if (bias === 'BULLISH') return '#6fc28a';
  if (bias === 'BEARISH') return '#d27979';
  return '#a2a2a2';
}

function overnightImpactColor(impact) {
  if (impact === 'POSITIVE') return '#6fc28a';
  if (impact === 'NEGATIVE') return '#d27979';
  return '#a2a2a2';
}

// Draw semi-circle gauge on canvas
function drawFngGauge(canvasId, score, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const parent = canvas.parentElement;
  const size = Math.min(parent?.clientWidth || 200, 200);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = (size * 0.65) * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = (size * 0.65) + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size * 0.65);
  const cx = size / 2, cy = size * 0.58, r = size * 0.38;
  const startAngle = Math.PI, scoreAngle = startAngle + (score / 100) * Math.PI;
  // Track
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = size * 0.072; ctx.lineCap = 'round'; ctx.stroke();
  // Zones
  [{ from: 0, to: .25, c: '#e4545455' }, { from: .25, to: .45, c: '#ff8a3855' }, { from: .45, to: .55, c: '#c9a84c55' }, { from: .55, to: .75, c: '#5ec98a55' }, { from: .75, to: 1, c: '#00c98a55' }].forEach(z => {
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI + z.from * Math.PI, Math.PI + z.to * Math.PI);
    ctx.strokeStyle = z.c; ctx.lineWidth = size * 0.068; ctx.lineCap = 'butt'; ctx.stroke();
  });
  // Active
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, scoreAngle);
  ctx.strokeStyle = color; ctx.lineWidth = size * 0.072; ctx.lineCap = 'round';
  ctx.shadowBlur = 14; ctx.shadowColor = color; ctx.stroke(); ctx.shadowBlur = 0;
  // Needle
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(scoreAngle) * r * .82, cy + Math.sin(scoreAngle) * r * .82);
  ctx.strokeStyle = '#dde1ea'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
  // Center dot
  ctx.beginPath(); ctx.arc(cx, cy, size * .035, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}

// Draw 30-day sparkline history
function drawFngSparkline(canvasId, history, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !history?.length) return;
  const parent = canvas.parentElement;
  const w = parent?.clientWidth || 300, h = 48;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  const scores = history.map(d => Number(d.score)).filter(Number.isFinite);
  if (scores.length < 2) return;
  const mn = Math.min(...scores) - 5, mx = Math.max(...scores) + 5, range = mx - mn || 1;
  const pts = scores.map((s, i) => ({ x: (i / (scores.length - 1)) * w, y: h - ((s - mn) / range) * (h - 8) - 4 }));
  const grad = ctx.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, color + '44'); grad.addColorStop(1, color + '00');
  ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  // End dot
  const lp = pts[pts.length - 1];
  ctx.beginPath(); ctx.arc(lp.x, lp.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}

function renderSentimentLoading() {
  const panel = document.getElementById('rp-feargreed');
  if (!panel) return;
  panel.innerHTML = `<div class="section-loading-panel">
    <div class="section-loading-title">Sentiment</div>
    <div class="section-skeleton-line" style="width:46%"></div>
    <div class="section-skeleton-grid">
      <div class="section-skeleton-card">
        <div class="section-skeleton-line" style="width:38%"></div>
        <div class="section-skeleton-ring"></div>
        <div class="section-skeleton-line section-skeleton-line-short" style="width:30%"></div>
      </div>
      <div class="section-skeleton-card">
        <div class="section-skeleton-line" style="width:42%"></div>
        <div class="section-skeleton-ring"></div>
        <div class="section-skeleton-line section-skeleton-line-short" style="width:34%"></div>
      </div>
    </div>
  </div>`;
}

async function fetchFearGreed() {
  const panel = document.getElementById('rp-feargreed');
  if (!panel) return;
  // Debounce — don't re-fetch if fetched within 15 min
  if (fngData && (Date.now() - fngLastFetch) < 15 * 60_000) { renderFearGreed(); return; }
  if (fngFetching) return;
  fngFetching = true;
  sectionLoadState.sentiment = 'loading';
  renderSentimentLoading();
  try {
    const data = await fetch('/api/sentiment').then(r => r.json());
    fngData = data;
    fngLastFetch = Date.now();
    sectionLoadState.sentiment = 'ready';
    renderFearGreed();
  } catch (e) {
    sectionLoadState.sentiment = 'error';
    panel.innerHTML = `<div style="padding:20px;color:#ff4444;font-size:13px">Error loading sentiment: ${e.message}</div>`;
  } finally { fngFetching = false; }
}

function renderFearGreed() {
  const panel = document.getElementById('rp-feargreed');
  if (!panel || !fngData) return;

  const global = fngData.global;
  const india = fngData.india;
  const marketBias = dashStore?.sentiment || null;
  const overnightImpact = marketBias?.overnightImpact || null;
  const bias = String(marketBias?.bias || 'NEUTRAL').toUpperCase();
  const strength = String(marketBias?.strength || 'WEAK').toUpperCase();
  const biasReason = marketBias?.reason || 'Calculating bias from FII, DII, VIX, and index momentum.';
  const biasColor = marketBiasColor(bias);
  const overnightLabel = String(overnightImpact?.impact || 'NEUTRAL').toUpperCase();
  const overnightReason = overnightImpact?.reason || 'Overnight market inputs are still loading.';
  const overnightColor = overnightImpactColor(overnightLabel);
  const fiiStr = Number.isFinite(Number(marketBias?.fii)) ? `${Number(marketBias.fii) >= 0 ? '+' : ''}${Math.round(Number(marketBias.fii))}Cr` : '--';
  const diiStr = Number.isFinite(Number(marketBias?.dii)) ? `${Number(marketBias.dii) >= 0 ? '+' : ''}${Math.round(Number(marketBias.dii))}Cr` : '--';
  const vixStr = Number.isFinite(Number(marketBias?.vix)) ? Number(marketBias.vix).toFixed(1) : '--';
  const gc = global ? fngColor(global.score) : '#c9a84c';
  const ic = india ? fngColor(india.score) : '#c9a84c';
  const gl = global ? fngLabel(global.score) : '--';
  const il = india ? fngLabel(india.score) : '--';
  const gs = global ? Math.round(global.score) : '--';
  const is_ = india ? Math.round(india.score) : '--';
  const globalChange = global ? Number((global.score - (global.oneWeekAgo || global.score)).toFixed(1)) : null;
  const changeStr = globalChange !== null ? `${globalChange >= 0 ? '▲' : '▼'} ${Math.abs(globalChange)} vs last week` : '';
  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });

  panel.innerHTML = `
  <div style="padding:16px 18px">

    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:10px">
      <div style="color:#ff6600;font-size:17px;font-weight:bold;letter-spacing:1.5px">MARKET SENTIMENT</div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="color:#444;font-size:10px;letter-spacing:.4px">Updated ${now} IST</span>
        <button onclick="fngData=null;fetchFearGreed()" style="background:#1a0a00;border:1px solid #ff6600;color:#ff6600;font-family:'Courier New',monospace;font-size:11px;padding:4px 12px;cursor:pointer;border-radius:3px">↻ REFRESH</button>
      </div>
    </div>

    <div style="background:#0b0c14;border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:14px 16px;margin-bottom:14px">
      <div style="color:#6d6a63;font-size:10px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:10px">Overnight Impact</div>
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <span style="color:${overnightColor};font-size:22px;font-weight:700;letter-spacing:.02em">${overnightLabel}</span>
      </div>
      <div style="color:#a09a8b;font-size:13px;line-height:1.6">${overnightReason}</div>
    </div>

    <div style="background:#0b0c14;border:1px solid rgba(255,255,255,.05);border-radius:12px;padding:14px 16px;margin-bottom:14px">
      <div style="color:#6d6a63;font-size:10px;letter-spacing:.18em;text-transform:uppercase;margin-bottom:10px">Market Bias</div>
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <span style="color:${biasColor};font-size:24px;font-weight:700;letter-spacing:.02em">${bias}</span>
        <span style="color:#908b7f;font-size:11px;letter-spacing:.14em;text-transform:uppercase">${strength}</span>
      </div>
      <div style="color:#a09a8b;font-size:13px;line-height:1.6;margin-bottom:10px">${biasReason}</div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;color:#777166;font-size:11px;letter-spacing:.08em;text-transform:uppercase">
        <span>FII ${fiiStr}</span>
        <span>DII ${diiStr}</span>
        <span>VIX ${vixStr}</span>
      </div>
    </div>

    <!-- Two gauge cards -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">

      <!-- US F&G -->
      <div style="background:#0a0a18;border:1px solid #1a1a2e;border-radius:10px;padding:16px;position:relative;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:.2em;color:#666">US FEAR &amp; GREED</span>
          <span style="font-family:'Courier New',monospace;font-size:8px;padding:2px 7px;border-radius:999px;border:1px solid rgba(0,204,102,.35);color:#00cc66;background:rgba(0,51,17,.55)">CNN</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <canvas id="fng-gauge-global" style="display:block;max-width:200px;width:100%"></canvas>
          <div style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;color:${gc};line-height:1">${gs}</div>
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:.2em;color:${gc}">${gl}</div>
        </div>
        <div style="margin:12px 0 4px">
          <canvas id="fng-spark-global" style="display:block;width:100%;height:48px"></canvas>
        </div>
        <div style="font-family:'Courier New',monospace;font-size:9px;color:#444;text-align:center">${changeStr}</div>
        ${global?.indicators ? `
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid #1a1a2e;display:flex;flex-direction:column;gap:7px">
          ${Object.values(global.indicators).slice(0, 4).map(ind => `
          <div style="display:flex;align-items:center;gap:7px">
            <span style="font-family:'Courier New',monospace;font-size:8px;color:#444;width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(ind.label || '').split(' ').slice(-2).join(' ')}</span>
            <div style="flex:1;height:3px;background:rgba(255,255,255,.05);border-radius:999px;overflow:hidden"><div style="height:100%;border-radius:999px;width:${ind.score}%;background:${fngColor(ind.score)};transition:width .9s ease"></div></div>
            <span style="font-family:'Courier New',monospace;font-size:8px;color:${fngColor(ind.score)};width:50px;text-align:right">${(ind.rating || '').split(' ').pop()?.toUpperCase() || ''}</span>
          </div>`).join('')}
        </div>` : ''}
      </div>

      <!-- India Sentiment -->
      <div style="background:#0a0a18;border:1px solid #1a1a2e;border-radius:10px;padding:16px;position:relative;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:.2em;color:#666">INDIA SENTIMENT</span>
          <span style="font-family:'Courier New',monospace;font-size:8px;padding:2px 7px;border-radius:999px;border:1px solid rgba(0,204,102,.35);color:#00cc66;background:rgba(0,51,17,.55)">LIVE</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <canvas id="fng-gauge-india" style="display:block;max-width:200px;width:100%"></canvas>
          <div style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;color:${ic};line-height:1">${is_}</div>
          <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:.2em;color:${ic}">${il}</div>
        </div>
        <div style="margin-top:14px;padding-top:10px;border-top:1px solid #1a1a2e;display:flex;flex-direction:column;gap:8px">
          ${india?.components ? Object.entries(india.components).map(([k, comp]) => {
    const isPos = Number(comp.value) > 0, isNeg = Number(comp.value) < 0;
    const color = isPos ? '#00cc66' : isNeg ? '#ff4444' : '#888';
    let valStr = k === 'vix' ? Number(comp.value).toFixed(1) : k === 'fii' ? (Number(comp.value) >= 0 ? '+' : '') + Math.round(Number(comp.value)) + 'Cr' : (Number(comp.value) >= 0 ? '+' : '') + Number(comp.value).toFixed(2) + '%';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.03)"><span style="font-family:'Courier New',monospace;font-size:10px;color:#666">${comp.label}</span><span style="font-family:'Courier New',monospace;font-size:11px;font-weight:700;color:${color}">${valStr}</span></div>`;
  }).join('') : '<div style="color:#333;font-size:11px;padding:8px 0">Component data loading...</div>'}
        </div>
        <div style="font-family:'Courier New',monospace;font-size:8px;color:#333;margin-top:8px;text-align:center">VIX · Nifty · FII Flow · INR</div>
      </div>
    </div>

    <!-- Historical comparison row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#1a1a2e;border:1px solid #1a1a2e;border-radius:8px;overflow:hidden;margin-bottom:14px">
      ${[
      ['PREV CLOSE', global ? Math.round(global.prevClose) : '--', global ? fngColor(global.prevClose) : '#666'],
      ['1 WEEK AGO', global ? Math.round(global.oneWeekAgo) : '--', global ? fngColor(global.oneWeekAgo) : '#666'],
      ['1 MONTH AGO', global ? Math.round(global.oneMonthAgo) : '--', global ? fngColor(global.oneMonthAgo) : '#666'],
      ['INDIA SCORE', india ? Math.round(india.score) + '/100' : '--', ic],
    ].map(([label, val, color]) => `
        <div style="background:#0a0a18;padding:10px 12px">
          <div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:.14em;color:#444;margin-bottom:3px">${label}</div>
          <div style="font-family:'Courier New',monospace;font-size:15px;font-weight:700;color:${color}">${val}</div>
        </div>`).join('')}
    </div>

    <!-- Source note -->
    <div style="font-family:'Courier New',monospace;font-size:9px;color:#333;letter-spacing:.1em;text-align:center">
      US data: CNN Money · India composite: NSE VIX + Nifty momentum + FII flow + INR
    </div>

  </div>`;

  // Draw canvases after DOM is ready
  requestAnimationFrame(() => {
    if (global) { drawFngGauge('fng-gauge-global', global.score, gc); drawFngSparkline('fng-spark-global', global.history || [], gc); }
    if (india) drawFngGauge('fng-gauge-india', india.score, ic);
    // Animate indicator bars
    panel.querySelectorAll('[style*="transition:width"]').forEach(bar => {
      const w = bar.style.width; bar.style.width = '0'; setTimeout(() => { bar.style.width = w; }, 100);
    });
  });
}

// ── HEADLINES ──
function tagHtml(s) { return s === 'bull' ? '<span class="ntag t-bull">BULL</span>' : s === 'bear' ? '<span class="ntag t-bear">BEAR</span>' : '<span class="ntag t-watch">WATCH</span>'; }
function storyTime() { return 'NO TIME'; }

function setHeadlinesEmptyState(title, detail = '') { headlinesEmptyState = { title, detail }; }

function renderHeadlines(resetScroll = false) {
  const list = document.getElementById('hl-list'); const countEl = document.getElementById('hl-count');
  if (!list || !countEl) return;
  list.innerHTML = '';
  const hlContainer = document.getElementById('headlines');
  if (resetScroll && hlContainer) hlContainer.scrollTop = 0;
  if (!currentStories.length) {
    countEl.textContent = '0 STORIES';
    list.innerHTML = `<div class="headline-empty"><div class="headline-empty-title">${headlinesEmptyState.title}</div><div class="headline-empty-copy">${headlinesEmptyState.detail}</div></div>`;
    return;
  }
  countEl.textContent = currentStories.length + ' STORIES';
  currentStories.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'nl' + (i === activeIdx ? ' active' : ''); d.style.animationDelay = Math.min(i * 35, 280) + 'ms';
    const timeStr = s.pubDate ? new Date(s.pubDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST' : storyTime(i);
    const srcStr = s.source ? `<span class="nl-src">${s.source}</span>` : '';
    d.innerHTML = `<div class="nl-meta">${tagHtml(s.sentiment)}<span class="nl-time">${timeStr}</span></div><div class="nl-hl">${s.headline}</div>${srcStr}`;
    d.addEventListener('click', () => showDetail(i)); list.appendChild(d);
  });
  animateCollection('#hl-list .nl', { x: -10, y: 10, stagger: 0.035, duration: 0.32 });
}

function showDetail(i) {
  if (!currentStories || !currentStories[i]) return;
  activeIdx = i; const s = currentStories[i]; renderHeadlines();
  const emptyEl = document.getElementById('detail-empty'); const bodyEl = document.getElementById('detail-body');
  const stateRoot = getExplorerRoot();
  const srcEl = document.getElementById('db-src'); const tagsEl = document.getElementById('db-tags');
  const headEl = document.getElementById('db-headline'); const textEl = document.getElementById('db-text');
  if (!emptyEl || !bodyEl || !srcEl || !tagsEl || !headEl || !textEl) return;
  if (stateRoot) stateRoot.style.display = 'none';
  emptyEl.style.display = 'none'; bodyEl.style.display = 'block';
  srcEl.textContent = s.source || 'NEWSFEED'; tagsEl.innerHTML = (s.tags || []).map(t => `<span class="db-tag">${t}</span>`).join(' ') + ' ' + tagHtml(s.sentiment);
  headEl.textContent = s.headline;
  const body = (s.body || '').trim();
  const summary = body ? body.split(/[.!?]+/).map(x => x.trim()).filter(Boolean).slice(0, 2).join('. ') + '.' : 'Summary unavailable.';
  let bodyHtml = `<p><b>Summary:</b> ${summary}</p>`;
  bodyHtml += (s.body || '').split('\n').filter(Boolean).map(p => `<p>${p}</p>`).join('');
  if (s.url) bodyHtml += `<p><a href="${s.url}" style="color:#ff6600;font-size:13px;" target="_blank">Read full article ↗</a></p>`;
  textEl.innerHTML = bodyHtml;
  switchRP('detail'); refreshFinanceBridge();
}

function clearDetail() { activeIdx = -1; renderHeadlines(); renderApp(); refreshFinanceBridge(); }

function loadCategory(cat, options = {}) {
  const shouldFetchNews = options.fetchNews ?? !isStartupBoot;
  const forceNews = options.forceNews ?? false;
  currentCat = cat; activeIdx = -1;
  document.getElementById('hl-label').textContent = cat.toUpperCase();
  renderApp();
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active-chip', c.textContent.toLowerCase() === cat));
  document.getElementById('sb-q').textContent = cat.toUpperCase() + ' — INDIA MARKET';
  if (shouldFetchNews) fetchLiveNews(cat, !forceNews);
  saveLayout(); refreshFinanceBridge();
}

const newsCache = {};
const NEWS_CLIENT_TTL = 5 * 60 * 1000;

async function fetchLiveNews(cat, useCache = true) {
  const cached = newsCache[cat]; const isFresh = cached && (Date.now() - cached.ts) < NEWS_CLIENT_TTL;
  if (useCache && isFresh) { currentStories = Array.isArray(cached.stories) ? cached.stories : []; sectionLoadState.news = 'ready'; setHeadlinesEmptyState('No cached live stories', 'Refresh the feed or try another category.'); renderHeadlines(true); renderApp(); refreshFinanceBridge(); return; }
  if (newsRequestController) { try { newsRequestController.abort(); } catch {} }
  const token = ++newsRequestToken;
  const controller = new AbortController();
  newsRequestController = controller;
  showNewsLoading();
  try {
    const url = useCache ? `/api/news/${cat}` : `/api/news/${cat}?force=1`;
    const res = await fetch(url, { signal: controller.signal }); if (!res.ok) throw new Error('API ' + res.status);
    const stories = await res.json(); if (stories.error) throw new Error(stories.error);
    if (token !== newsRequestToken) return;
    currentStories = Array.isArray(stories) ? stories : [];
    newsCache[cat] = { stories: currentStories, ts: Date.now() };
    sectionLoadState.news = 'ready';
    setHeadlinesEmptyState('No live stories returned', 'This feed is quiet right now. Try refreshing in a moment.');
    renderHeadlines(true); renderApp(); refreshFinanceBridge();
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
    const countEl = document.getElementById('hl-count');
    if (countEl) countEl.textContent = currentStories.length ? currentStories.length + ' STORIES · LIVE RSS · ' + now : '0 STORIES · LIVE RSS';
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.warn('Live news failed:', e.message);
    sectionLoadState.news = 'error';
    currentStories = []; setHeadlinesEmptyState('Live RSS unavailable', 'The current feed could not be loaded. Try refresh or switch categories.');
    renderHeadlines(true); renderApp(); refreshFinanceBridge();
    document.getElementById('hl-count').textContent = 'LIVE RSS UNAVAILABLE';
  } finally {
    if (newsRequestController === controller) newsRequestController = null;
  }
}

function refreshNews() { clearTimeout(refreshNewsTimer); refreshNewsTimer = setTimeout(async () => { newsCache[currentCat] = null; try { await fetch('/api/news-refresh'); } catch (e) { } fetchLiveNews(currentCat, false); }, 120); }

function showNewsLoading() {
  sectionLoadState.news = 'loading';
  const list = document.getElementById('hl-list'); list.innerHTML = ''; document.getElementById('hl-count').textContent = 'LOADING...';
  for (let i = 0; i < 6; i++) {
    const d = document.createElement('div'); d.className = 'nl';
    d.innerHTML = `<div class="section-skeleton-line" style="width:${60 + Math.random() * 30 | 0}%"></div><div class="section-skeleton-line section-skeleton-line-short" style="width:${40 + Math.random() * 40 | 0}%"></div>`;
    list.appendChild(d);
  }
}

function doSearch() {
  const q = document.getElementById('q-input').value.trim().toLowerCase();
  if (!q) { loadCategory(currentCat); return; }
  const liveAll = Object.values(newsCache).filter(c => c && Array.isArray(c.stories)).flatMap(c => c.stories);
  const seen = new Set(); const merged = [];
  [...liveAll, ...currentStories].forEach(s => { const key = (s.headline || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50); if (!seen.has(key)) { seen.add(key); merged.push(s); } });
  currentStories = merged.filter(s => ((s.headline || '').toLowerCase().includes(q)) || ((s.body || '').toLowerCase().includes(q)) || ((s.tags || []).some(t => t.toLowerCase().includes(q))));
  setHeadlinesEmptyState('No live search matches', 'Try a broader symbol or topic.'); activeIdx = -1;
  document.getElementById('hl-label').textContent = 'SEARCH'; document.getElementById('hl-count').textContent = currentStories.length + ' RESULTS';
  renderApp();
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active-chip')); renderHeadlines(true);
}
document.getElementById('q-input').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

// ── MINI SPARKLINES ──
function drawMiniSparkline(canvasId, series, line, fill) {
  const c = document.getElementById(canvasId); if (!c || !Array.isArray(series) || !series.length) return;
  const src = series.length === 1 ? [series[0], series[0]] : series;
  c.width = c.parentElement.clientWidth - 12; c.height = 48;
  const ctx = c.getContext('2d'); const w = c.width, h = c.height; ctx.clearRect(0, 0, w, h);
  const min = Math.min(...src), max = Math.max(...src), rng = (max - min) || 1;
  const pts = src.map((v, i) => ({ x: (i / (src.length - 1)) * w, y: h - 6 - ((v - min) / rng) * (h - 12) }));
  ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.lineWidth = 1.5; ctx.strokeStyle = line; ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}

function renderMiniMacroCharts() {
  const vv = miniVixSeries[miniVixSeries.length - 1]; const gv = miniGsecSeries[miniGsecSeries.length - 1];
  const vixEl = document.getElementById('mini-vix-val'); const gsecEl = document.getElementById('mini-gsec-val');
  if (Number.isFinite(vv)) setEl('mini-vix-val', vv.toFixed(2));
  else if (vixEl && !vixEl.classList.contains('has-data')) vixEl.textContent = '--';
  if (Number.isFinite(gv)) setEl('mini-gsec-val', gv.toFixed(3) + '%');
  else if (gsecEl && !gsecEl.classList.contains('has-data')) gsecEl.textContent = '--';
  drawMiniSparkline('mini-vix-chart', miniVixSeries, '#ff9900', 'rgba(255,153,0,.14)');
  drawMiniSparkline('mini-gsec-chart', miniGsecSeries, '#7fd5ff', 'rgba(127,213,255,.12)');
}

// ── MARKET BREADTH BAR ──
function renderBreadthBar(advances, declines) {
  let bar = document.getElementById('breadth-bar-wrap');
  if (!bar) { bar = document.createElement('div'); bar.id = 'breadth-bar-wrap'; bar.style.cssText = 'padding:8px 10px 10px;border-bottom:1px solid #0d0d18;'; const miniCharts = document.getElementById('mini-macro-charts'); if (miniCharts) miniCharts.parentNode.insertBefore(bar, miniCharts); }
  const total = advances + declines || 1; const advPct = (advances / total * 100).toFixed(0); const decPct = (declines / total * 100).toFixed(0);
  bar.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:9px;color:#444;letter-spacing:.5px;margin-bottom:4px"><span>ADV <span style="color:#00cc66">${advances}</span></span><span style="font-size:8px;color:#333">MARKET BREADTH</span><span>DEC <span style="color:#ff4444">${declines}</span></span></div><div style="display:flex;height:4px;border-radius:999px;overflow:hidden;background:#0a0a18;gap:1px"><div id="breadth-adv" style="height:100%;border-radius:999px 0 0 999px;background:linear-gradient(to right,#004d1a,#00cc66);width:0%;transition:width 1s cubic-bezier(.2,.9,.2,1)"></div><div id="breadth-dec" style="height:100%;border-radius:0 999px 999px 0;background:linear-gradient(to left,#4d0000,#ff4444);width:0%;transition:width 1s cubic-bezier(.2,.9,.2,1)"></div></div>`;
  requestAnimationFrame(() => { setTimeout(() => { const a = document.getElementById('breadth-adv'); const d = document.getElementById('breadth-dec'); if (a) a.style.width = advPct + '%'; if (d) d.style.width = decPct + '%'; }, 300); });
}

const TICKER_MAP = {
  'NIFTY:NSE': { tkVal: 'tk-nifty', tkChg: 'tk-nifty-chg' }, 'SENSEX:BSE': { tkVal: 'tk-sensex', tkChg: 'tk-sensex-chg' },
  'BANKNIFTY:NSE': { tkVal: 'tk-banknifty', tkChg: 'tk-banknifty-chg' }, 'RELIANCE:NSE': { tkVal: 'tk-reliance', tkChg: 'tk-reliance-chg' },
  'TCS:NSE': { tkVal: 'tk-tcs', tkChg: 'tk-tcs-chg' }, 'INFY:NSE': { tkVal: 'tk-infy', tkChg: 'tk-infy-chg' },
  'HDFCBANK:NSE': { tkVal: 'tk-hdfc', tkChg: 'tk-hdfc-chg' }, 'ICICIBANK:NSE': { tkVal: 'tk-icici', tkChg: 'tk-icici-chg' },
  'SBIN:NSE': { tkVal: 'tk-sbi', tkChg: 'tk-sbi-chg' }, 'WIPRO:NSE': { tkVal: 'tk-wipro', tkChg: 'tk-wipro-chg' },
  'TATAMOTORS:NSE': { tkVal: 'tk-tatamotors', tkChg: 'tk-tatamotors-chg' }, 'TATASTEEL:NSE': { tkVal: 'tk-tatasteel', tkChg: 'tk-tatasteel-chg' },
  'ADANIENT:NSE': { tkVal: 'tk-adani', tkChg: 'tk-adani-chg' }, 'USD/INR:Forex': { tkVal: 'tk-usdinr', tkChg: 'tk-usdinr-chg' },
  'XAU/USD:Forex': { tkVal: 'tk-gold', tkChg: 'tk-gold-chg' }, 'WTI:Commodity': { tkVal: 'tk-crude', tkChg: 'tk-crude-chg' },
};

function flashCell(valId, dir) { const cell = document.getElementById(valId)?.closest('.idx-cell'); if (!cell) return; cell.classList.remove('flash-up', 'flash-dn'); void cell.offsetWidth; cell.classList.add(dir === 'up' ? 'flash-up' : 'flash-dn'); const valEl = document.getElementById(valId); if (valEl) { valEl.classList.remove('num-update'); void valEl.offsetWidth; valEl.classList.add('num-update'); } }
function fmtPrice(v) { const n = parseFloat(v); if (isNaN(n)) return '--'; return n >= 1000 ? n.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : n.toFixed(2); }
function fmtChg(c, p) { const cv = parseFloat(c), pv = parseFloat(p); if (isNaN(cv)) return { txt: '--', cls: 'flat' }; const s = cv >= 0 ? '+' : ''; return { txt: `${s}${cv.toFixed(1)} (${s}${pv.toFixed(2)}%)`, cls: cv >= 0 ? 'up' : 'dn' }; }
function setEl(id, txt) { const e = document.getElementById(id); if (e) { e.textContent = txt; e.classList.add('has-data'); } }

function processLivePrices(data) {
  if (!data) return;
  try {
    Object.keys(data).forEach(key => {
      const d = data[key]; if (!d) return;
      const price = fmtPrice(d.close || d.price); const { txt, cls } = fmtChg(d.change, d.percent_change);
      const raw = parseFloat(d.close || d.price); const chgRaw = parseFloat(d.change || 0);
      const tm = TICKER_MAP[key];
      if (tm) { setEl(tm.tkVal, price); const te = document.getElementById(tm.tkChg); if (te) { te.textContent = txt; te.className = cls + ' has-data'; } if (tm.tkVal === 'tk-nifty') { setEl('tk-nifty2', price); const e2 = document.getElementById('tk-nifty-chg2'); if (e2) { e2.textContent = txt; e2.className = cls + ' has-data'; } } if (tm.tkVal === 'tk-sensex') { setEl('tk-sensex2', price); const e2 = document.getElementById('tk-sensex-chg2'); if (e2) { e2.textContent = txt; e2.className = cls + ' has-data'; } } }
      sidebarIndices.forEach(item => { if (item.sym === key) { const prevTxt = document.getElementById(item.valId)?.textContent; setEl(item.valId, price); const ce = document.getElementById(item.chgId); if (ce) { ce.textContent = txt; ce.className = 'idx-chg has-data ' + cls; } if (prevTxt && prevTxt !== '--' && prevTxt !== price) flashCell(item.valId, cls); if (d.week52High && d.week52Low) update52WBar(item.valId, raw, d.week52Low, d.week52High); } });
      if (key.startsWith('USD/INR')) { const e = document.getElementById('m-usdinr'); if (e) { e.textContent = raw.toFixed(2) + (chgRaw >= 0 ? ' ▲' : ' ▼'); e.className = 'mv ' + (chgRaw > 0 ? 'dn' : 'up'); } }
      if (key.startsWith('XAU/USD')) { const usdInr = parseFloat(document.getElementById('m-usdinr')?.textContent) || 84; const goldInr = Math.round(raw * usdInr / 31.1035 * 10); const e = document.getElementById('m-gold'); if (e) { e.textContent = '₹' + goldInr.toLocaleString('en-IN') + '/10g'; e.className = 'mv'; } }
      if (key.startsWith('WTI')) { const e = document.getElementById('m-crude'); if (e) { e.textContent = '$' + raw.toFixed(2) + '/bbl' + (chgRaw >= 0 ? ' ▲' : ' ▼'); e.className = 'mv ' + (chgRaw > 0 ? 'dn' : 'up'); } }
      if (key.startsWith('IN10Y')) { const e = document.getElementById('m-gsec'); if (e) { e.textContent = raw.toFixed(3) + '%' + (chgRaw >= 0 ? ' ▲' : ' ▼'); e.className = 'mv ' + (chgRaw > 0 ? 'dn' : 'up'); } miniGsecSeries.push(raw); if (miniGsecSeries.length > 24) miniGsecSeries.shift(); }
    });
    renderMiniMacroCharts();
    if (heatmapData && heatmapData.length) { const adv = heatmapData.filter(s => (s.pct || 0) > 0).length; const dec = heatmapData.filter(s => (s.pct || 0) < 0).length; renderBreadthBar(adv, dec); }
  } catch (e) { console.error('processLivePrices:', e.message); }
}

function processMiniVix(d) {
  try {
    if (!d) return;
    if (Array.isArray(d?.vix) && d.vix.length) miniVixSeries = d.vix.slice(-24);
    if (Array.isArray(d?.gsec) && d.gsec.length) miniGsecSeries = d.gsec.slice(-24);
    const vixTag = document.getElementById('mini-vix-tag'); const gsecTag = document.getElementById('mini-gsec-tag');
    const vixMeta = document.getElementById('mini-vix-meta'); const gsecMeta = document.getElementById('mini-gsec-meta');
    const vixHasValue = Number.isFinite(d?.spot?.vix);
    const gsecHasValue = Number.isFinite(d?.spot?.gsec);
    if (!miniVixSeries.length && vixHasValue) miniVixSeries = [Number(d.spot.vix)];
    if (!miniGsecSeries.length && gsecHasValue) miniGsecSeries = [Number(d.spot.gsec)];
    if (vixHasValue) setEl('mini-vix-val', Number(d.spot.vix).toFixed(2));
    if (gsecHasValue) setEl('mini-gsec-val', Number(d.spot.gsec).toFixed(3) + '%');
    // Only trust the server tag if a real value exists; otherwise force UNAVAILABLE
    if (vixTag) { const tag = vixHasValue ? (d?.meta?.vix?.tag || 'LIVE') : 'UNAVAILABLE'; vixTag.textContent = tag; vixTag.className = 'truth-tag ' + truthTagClass(tag); }
    if (gsecTag) { const tag = d?.meta?.gsec?.tag || 'DELAYED 15m'; gsecTag.textContent = tag; gsecTag.className = 'truth-tag ' + truthTagClass(tag); }
    if (vixMeta) vixMeta.textContent = vixHasValue ? (d?.meta?.vix?.source || 'NSE India VIX') : 'NSE India VIX — Awaiting data';
    if (gsecMeta) gsecMeta.textContent = d?.meta?.gsec?.source || 'Yahoo Finance India 10Y';
    renderMiniMacroCharts();
  } catch { }
}

// ── GLOBAL MARKETS RENDER ──
// FIX: renderGlobal now receives uppercase-keyed data directly from /api/global
const REGIONS = [
  { key: 'USA', label: '🇺🇸 United States', symbols: ['SP500', 'DOW', 'NASDAQ', 'VIX', 'US10Y'] },
  { key: 'UK', label: '🇬🇧 United Kingdom', symbols: ['FTSE100', 'GBPUSD'] },
  { key: 'EU', label: '🇪🇺 Europe', symbols: ['DAX', 'CAC40', 'EURO50', 'EURUSD'] },
  { key: 'ASIA', label: '🌏 Asia Pacific', symbols: ['NIKKEI', 'HANGSENG', 'SHANGHAI', 'KOSPI'] },
  { key: 'COMM', label: '📦 Commodities', symbols: ['GOLD', 'CRUDE', 'SILVER', 'NATGAS', 'DXY'] },
];

function processGlobal(data) {
  if (!data) return;
  globalData = data;
  renderGlobal(globalData);
  refreshFinanceBridge();
  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  const glUp = document.getElementById('gl-updated'); if (glUp) glUp.textContent = 'Updated ' + now + ' IST';
}

function renderGlobal(data) {
  const el = document.getElementById('gl-content'); if (!el) return;
  if (!data || !Object.keys(data).length) { el.innerHTML = '<div style="color:#444;font-size:13px;padding:20px">No data returned — try refreshing</div>'; return; }
  let html = '';
  REGIONS.forEach((region, ri) => {
    const items = region.symbols.map(k => data[k]).filter(Boolean);
    if (!items.length) return;
    const cols = items.length >= 4 ? 'grid-template-columns:1fr 1fr 1fr' : 'grid-template-columns:1fr 1fr';
    html += `<div class="gl-region" style="animation-delay:${ri * 60}ms"><div class="gl-title">${region.label}</div><div class="gl-grid" style="${cols}">`;
    items.forEach((item, ii) => {
      const pct = parseFloat(item.percent_change || 0); const chg = parseFloat(item.change || 0); const cls = pct > 0 ? 'up' : pct < 0 ? 'dn' : 'flat'; const sign = chg >= 0 ? '+' : ''; const price = parseFloat(item.price || 0);
      const priceStr = price >= 1000 ? price.toLocaleString('en-US', { maximumFractionDigits: 1 }) : price >= 10 ? price.toFixed(2) : price.toFixed(4);
      const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '—'; const barW = Math.min(100, Math.abs(pct) * 20); const barCol = pct > 0 ? 'rgba(0,204,102,.35)' : pct < 0 ? 'rgba(255,68,68,.35)' : 'rgba(100,100,100,.2)';
      html += `<div class="gl-cell" style="animation-delay:${ri * 60 + ii * 30}ms;position:relative;overflow:hidden"><div style="position:absolute;bottom:0;left:0;height:2px;width:${barW}%;background:${barCol};transition:width 1s ease;border-radius:0 2px 0 0"></div><div class="gl-name">${item.label || ''}</div><div class="gl-val">${priceStr}</div><div class="gl-chg ${cls}">${arrow} ${sign}${chg.toFixed(2)} (${sign}${pct.toFixed(2)}%)</div></div>`;
    });
    html += `</div></div>`;
  });
  el.innerHTML = html || '<div style="color:#444;padding:20px">No data returned — try refreshing</div>';
  animateCollection('#gl-content .gl-region', { y: 14, stagger: 0.06, duration: 0.34 });
  animateCollection('#gl-content .gl-cell', { y: 10, stagger: 0.02, duration: 0.26, delay: 0.08 });
}

setInterval(() => { if (currentRP === 'global') { fetchGlobal(); } }, 60000);

// ── TICKER SEARCH ──
const ALL_TICKERS = [
  { sym: 'NIFTY', label: 'Nifty 50' }, { sym: 'SENSEX', label: 'BSE Sensex' }, { sym: 'BANKNIFTY', label: 'Bank Nifty' },
  { sym: 'NIFTYIT', label: 'Nifty IT' }, { sym: 'RELIANCE', label: 'Reliance Industries' }, { sym: 'TCS', label: 'Tata Consultancy' },
  { sym: 'INFY', label: 'Infosys' }, { sym: 'HDFCBANK', label: 'HDFC Bank' }, { sym: 'ICICIBANK', label: 'ICICI Bank' },
  { sym: 'SBIN', label: 'State Bank of India' }, { sym: 'WIPRO', label: 'Wipro' }, { sym: 'TATAMOTORS', label: 'Tata Motors' },
  { sym: 'TATASTEEL', label: 'Tata Steel' }, { sym: 'ADANIENT', label: 'Adani Enterprises' }, { sym: 'BAJFINANCE', label: 'Bajaj Finance' },
  { sym: 'MARUTI', label: 'Maruti Suzuki' }, { sym: 'AXISBANK', label: 'Axis Bank' }, { sym: 'KOTAKBANK', label: 'Kotak Mahindra' },
  { sym: 'LT', label: 'Larsen & Toubro' }, { sym: 'SUNPHARMA', label: 'Sun Pharmaceutical' }, { sym: 'HINDUNILVR', label: 'HUL' },
  { sym: 'ITC', label: 'ITC Limited' }, { sym: 'ASIANPAINT', label: 'Asian Paints' }, { sym: 'TITAN', label: 'Titan Company' },
  { sym: 'DRREDDY', label: "Dr Reddy's" }, { sym: 'CIPLA', label: 'Cipla' }, { sym: 'COALINDIA', label: 'Coal India' },
  { sym: 'POWERGRID', label: 'Power Grid' }, { sym: 'NTPC', label: 'NTPC' }, { sym: 'ONGC', label: 'ONGC' },
  { sym: 'HCLTECH', label: 'HCL Technologies' }, { sym: 'TECHM', label: 'Tech Mahindra' }, { sym: 'ZOMATO', label: 'Zomato' },
  { sym: 'INDIGO', label: 'IndiGo' }, { sym: 'DLF', label: 'DLF' }, { sym: 'BAJAJFINSV', label: 'Bajaj Finserv' },
];

let tickerHighlight = -1;
function showTickerDropdown(q) { const dd = document.getElementById('ticker-dropdown'); if (!dd) return; const query = q.trim().toUpperCase(); if (!query) { dd.style.display = 'none'; return; } const matches = ALL_TICKERS.filter(t => t.sym.includes(query) || t.label.toUpperCase().includes(query)).slice(0, 12); if (!matches.length) { dd.style.display = 'none'; return; } tickerHighlight = -1; dd.innerHTML = matches.map((t, i) => `<div class="td-item" data-sym="${t.sym}" onmousedown="selectTicker('${t.sym}')" onmouseover="tickerHighlight=${i};renderHighlight()"><span style="color:#ff6600;font-weight:bold;font-size:17px">${t.sym}</span><span style="color:#666;font-size:16px;margin-left:8px">${t.label}</span></div>`).join(''); dd.style.display = 'block'; }
function renderHighlight() { document.querySelectorAll('.td-item').forEach((el, i) => { el.style.background = i === tickerHighlight ? '#1a1a2e' : (el.getAttribute('data-sym') ? '' : ''); }); }
function handleTickerKey(e) { const dd = document.getElementById('ticker-dropdown'); const items = dd ? dd.querySelectorAll('.td-item') : []; if (e.key === 'ArrowDown') { e.preventDefault(); tickerHighlight = Math.min(tickerHighlight + 1, items.length - 1); renderHighlight(); } else if (e.key === 'ArrowUp') { e.preventDefault(); tickerHighlight = Math.max(tickerHighlight - 1, 0); renderHighlight(); } else if (e.key === 'Enter') { if (tickerHighlight >= 0 && items[tickerHighlight]) selectTicker(items[tickerHighlight].dataset.sym); else applyTicker(); } else if (e.key === 'Escape') { dd.style.display = 'none'; } }
function selectTicker(sym) { document.getElementById('rp-ticker').value = sym; const dd = document.getElementById('ticker-dropdown'); if (dd) dd.style.display = 'none'; applyTicker(); }
document.addEventListener('click', e => { if (!e.target.closest('#rp-ticker-row')) { const dd = document.getElementById('ticker-dropdown'); if (dd) dd.style.display = 'none'; } });

// ── HEATMAP ──
let heatmapData = null; let heatmapSet = 'nifty';
async function fetchHeatmap() { const el = document.getElementById('heatmap-content'); if (!el) return; heatmapSet = document.getElementById('hm-set')?.value || 'nifty'; if (heatmapData) { renderHeatmap(); return; } el.innerHTML = '<div style="color:#4CAF82;text-align:center;padding:40px;font-size:14px">Loading heatmap...</div>'; try { const res = await fetch(`/api/heatmap?set=${encodeURIComponent(heatmapSet)}`); heatmapData = await res.json(); renderHeatmap(); if (Array.isArray(heatmapData) && heatmapData.length) { const adv = heatmapData.filter(s => (s.pct || 0) > 0).length; const dec = heatmapData.filter(s => (s.pct || 0) < 0).length; renderBreadthBar(adv, dec); } } catch (e) { el.innerHTML = `<div style="color:#ff4444;padding:20px">Error: ${e.message}</div>`; } }
function forceHeatmap() { heatmapData = null; fetchHeatmap(); }
function onHeatmapSetChange() { heatmapData = null; fetchHeatmap(); }
function heatColor(pct) { if (pct > 2) return { bg: '#006633', fg: '#00ff88' }; if (pct > 0) return { bg: '#004422', fg: '#00cc55' }; if (pct === 0) return { bg: '#1a1a2e', fg: '#666' }; if (pct > -2) return { bg: '#4d0000', fg: '#ff6666' }; return { bg: '#800000', fg: '#ff3333' }; }

let dwTooltip = null;
function ensureTooltip() { if (dwTooltip) return dwTooltip; const el = document.createElement('div'); el.className = 'dw-tooltip'; el.id = 'dw-tooltip'; document.body.appendChild(el); dwTooltip = el; return el; }
function showTooltip(html, x, y) { const tt = ensureTooltip(); tt.innerHTML = html; const ox = 14, oy = 16; const vw = window.innerWidth, vh = window.innerHeight; tt.style.transform = `translate3d(${x + ox}px,${y + oy}px,0)`; tt.classList.add('on'); const r = tt.getBoundingClientRect(); let nx = x + ox, ny = y + oy; if (nx + r.width + 8 > vw) nx = Math.max(8, vw - r.width - 8); if (ny + r.height + 8 > vh) ny = Math.max(8, vh - r.height - 8); tt.style.transform = `translate3d(${nx}px,${ny}px,0)`; }
function hideTooltip() { if (!dwTooltip) return; dwTooltip.classList.remove('on'); }

let lastRenderedHeatmapParams = '';
function renderHeatmap() {
  const el = document.getElementById('heatmap-content'); if (!el || !heatmapData) return;
  const groupBy = document.getElementById('hm-group')?.value || 'sector'; const setName = document.getElementById('hm-set')?.value || heatmapSet || 'nifty'; const sortBy = document.getElementById('hm-sort')?.value || 'mcap'; const q = (document.getElementById('hm-q')?.value || '').trim().toLowerCase();
  const dataSig = heatmapData.map(s => `${s.sym}_${s.price}_${s.pct}`).join('|'); const currentSig = `${groupBy}_${setName}_${sortBy}_${q}::${dataSig}`;
  if (lastRenderedHeatmapParams === currentSig) return; lastRenderedHeatmapParams = currentSig;
  let filtered = heatmapData;
  if (q) filtered = heatmapData.filter(s => (s.sym || '').toLowerCase().includes(q) || (s.sector || '').toLowerCase().includes(q));
  const sorter = { mcap: (a, b) => (b.mcap - a.mcap) || (Math.abs(b.pct) - Math.abs(a.pct)), pct: (a, b) => b.pct - a.pct, sym: (a, b) => (a.sym || '').localeCompare(b.sym || '') }[sortBy] || ((a, b) => b.mcap - a.mcap);
  filtered = [...filtered].sort(sorter);
  const metaEl = document.getElementById('hm-meta'); if (metaEl) { const up = filtered.filter(s => s.pct > 0).length; const dn = filtered.filter(s => s.pct < 0).length; metaEl.textContent = `${setName.toUpperCase()} · ${filtered.length} items · ${up} up · ${dn} down`; }
  let html = '';
  if (groupBy === 'sector') { const sectors = {}; filtered.forEach(s => { if (!sectors[s.sector]) sectors[s.sector] = []; sectors[s.sector].push(s); }); Object.entries(sectors).sort(([a], [b]) => a.localeCompare(b)).forEach(([sector, stocks]) => { const avg = stocks.reduce((acc, x) => acc + (x.pct || 0), 0) / Math.max(1, stocks.length); const avgSign = avg >= 0 ? '+' : ''; html += `<div class="hm-sector"><div class="hm-sector-title"><span><b>${sector.toUpperCase()}</b> <span style="color:#444">(${stocks.length})</span></span><span style="color:${avg >= 0 ? '#00cc66' : avg < 0 ? '#ff4444' : '#666'}">${avgSign}${avg.toFixed(2)}%</span></div><div class="hm-grid">`; stocks.forEach((s, i) => { const { bg, fg } = heatColor(s.pct); const sign = s.pct >= 0 ? '+' : ''; html += `<div class="hm-tile hm-enter" data-sym="${s.sym}" data-sector="${s.sector}" data-pct="${s.pct}" data-price="${s.price || 0}" data-change="${s.change || 0}" data-mcap="${s.mcap || 0}" style="background:${bg};color:${fg};animation-delay:${Math.min(220, i * 14)}ms"><div class="hm-sym" style="color:${fg}">${s.sym}</div><div class="hm-pct" style="color:${fg}">${sign}${(s.pct || 0).toFixed(2)}%</div><div class="hm-sub" style="color:${fg}">₹${s.price ? s.price.toFixed(2) : '--'} · mcap ${s.mcap}</div></div>`; }); html += `</div></div>`; }); }
  else { html = `<div class="hm-grid">`; filtered.forEach((s, i) => { const { bg, fg } = heatColor(s.pct); const sign = s.pct >= 0 ? '+' : ''; html += `<div class="hm-tile hm-enter" data-sym="${s.sym}" data-sector="${s.sector}" data-pct="${s.pct}" data-price="${s.price || 0}" data-change="${s.change || 0}" data-mcap="${s.mcap || 0}" style="background:${bg};color:${fg};animation-delay:${Math.min(220, i * 12)}ms"><div class="hm-sym" style="color:${fg}">${s.sym}</div><div class="hm-pct" style="color:${fg}">${sign}${(s.pct || 0).toFixed(2)}%</div><div class="hm-sub" style="color:${fg}">${s.sector || ''}</div></div>`; }); html += `</div>`; }
  el.innerHTML = html || '<div style="color:#444;padding:20px">No data</div>';
  el.onpointermove = (ev) => { const tile = ev.target.closest?.('.hm-tile'); if (!tile) return; const sym = tile.dataset.sym || '', sector = tile.dataset.sector || '', pct = parseFloat(tile.dataset.pct || '0') || 0, price = parseFloat(tile.dataset.price || '0') || 0, change = parseFloat(tile.dataset.change || '0') || 0, mcap = parseFloat(tile.dataset.mcap || '0') || 0; const sign = pct >= 0 ? '+' : ''; const csign = change >= 0 ? '+' : ''; showTooltip(`<div class="dw-tt-h"><div><div class="dw-tt-sym">${sym}</div><div class="dw-tt-sec">${sector}</div></div><div style="text-align:right"><div class="dw-tt-sym" style="color:${pct >= 0 ? '#00cc66' : pct < 0 ? '#ff4444' : '#666'}">${sign}${pct.toFixed(2)}%</div><div class="dw-tt-sec">${csign}${change.toFixed(2)}</div></div></div><div class="dw-tt-row"><span>Price</span><b>₹${price ? price.toFixed(2) : '--'}</b></div><div class="dw-tt-row"><span>Market cap (w)</span><b>${mcap}</b></div>`, ev.clientX, ev.clientY); };
  el.onpointerleave = () => hideTooltip();
}

// ── MF / ETF SCREENER ──
const MF_SCHEMES = [
  { code: '120503', label: 'Axis Bluechip Fund – Growth', amc: 'Axis', cat: 'Large Cap', aum: 26800, er: 0.53 },
  { code: '118834', label: 'HDFC Top 100 Fund – Growth', amc: 'HDFC', cat: 'Large Cap', aum: 35400, er: 0.54 },
  { code: '120586', label: 'ICICI Pru Bluechip – Growth', amc: 'ICICI', cat: 'Large Cap', aum: 58200, er: 0.86 },
  { code: '119707', label: 'SBI Bluechip Fund – Growth', amc: 'SBI', cat: 'Large Cap', aum: 46000, er: 0.82 },
  { code: '118825', label: 'Mirae Asset Large Cap – Growth', amc: 'Mirae', cat: 'Large Cap', aum: 38700, er: 0.53 },
  { code: '120465', label: 'Axis Midcap Fund – Growth', amc: 'Axis', cat: 'Mid Cap', aum: 25000, er: 0.52 },
  { code: '118989', label: 'HDFC Mid-Cap Opps – Growth', amc: 'HDFC', cat: 'Mid Cap', aum: 70200, er: 0.76 },
  { code: '125354', label: 'Quant Small Cap Fund – Growth', amc: 'Quant', cat: 'Small Cap', aum: 22000, er: 0.52 },
  { code: '119364', label: 'Nippon India Small Cap – Growth', amc: 'Nippon', cat: 'Small Cap', aum: 62000, er: 0.68 },
  { code: '122639', label: 'Parag Parikh Flexi Cap – Growth', amc: 'PPFAS', cat: 'Flexi Cap', aum: 78600, er: 0.63, isFoF: true },
  { code: '118550', label: 'HDFC Flexi Cap – Growth', amc: 'HDFC', cat: 'Flexi Cap', aum: 62400, er: 0.78 },
  { code: '112300', label: 'Axis Long Term Equity – Growth', amc: 'Axis', cat: 'ELSS', aum: 32000, er: 0.53 },
  { code: '120847', label: 'HDFC Nifty 50 Index – Growth', amc: 'HDFC', cat: 'Index', aum: 16400, er: 0.20 },
  { code: '120594', label: 'UTI Nifty 50 Index – Growth', amc: 'UTI', cat: 'Index', aum: 19200, er: 0.18 },
  { code: '119131', label: 'HDFC Liquid Fund – Growth', amc: 'HDFC', cat: 'Debt', aum: 58000, er: 0.20 },
  { code: '119403', label: 'HDFC Balanced Advantage – Growth', amc: 'HDFC', cat: 'Hybrid', aum: 88000, er: 0.76 },
  { code: '120587', label: 'ICICI Pru BAF – Growth', amc: 'ICICI', cat: 'Hybrid', aum: 56000, er: 0.79 },
  { code: '149364', label: 'Mirae Asset NYSE FANG+ FoF', amc: 'Mirae', cat: 'FoF', aum: 2800, er: 0.64, isFoF: true },
  { code: '130408', label: 'Motilal Nasdaq 100 FoF', amc: 'Motilal', cat: 'FoF', aum: 5600, er: 0.42, isFoF: true },
];

const ETF_LIST = [
  { label: 'Nippon Nifty BeES', amc: 'Nippon', type: 'Nifty 50', nse: 'NIFTYBEES', er: 0.04, aum: 24000, code: '120594' },
  { label: 'HDFC Nifty 50 ETF', amc: 'HDFC', type: 'Nifty 50', nse: 'HDFCNIFTY', er: 0.05, aum: 9800, code: '118989' },
  { label: 'SBI ETF Nifty 50', amc: 'SBI', type: 'Nifty 50', nse: 'SETFNIF50', er: 0.07, aum: 16600, code: '103504' },
  { label: 'Nippon Bank BeES', amc: 'Nippon', type: 'Bank Nifty', nse: 'BANKBEES', er: 0.19, aum: 7800, code: '119598' },
  { label: 'Nippon IT BeES', amc: 'Nippon', type: 'Nifty IT', nse: 'ITBEES', er: 0.19, aum: 3200, code: '120503' },
  { label: 'Nippon Gold BeES', amc: 'Nippon', type: 'Gold', nse: 'GOLDBEES', er: 0.82, aum: 8400, code: '118778' },
  { label: 'Mirae Asset NYSE FANG+', amc: 'Mirae', type: 'Global Tech', nse: 'MAFANG', er: 0.64, aum: 2800, code: '100444' },
  { label: 'Motilal Nasdaq 100 ETF', amc: 'Motilal', type: 'Global Tech', nse: 'MOM100', er: 0.50, aum: 4100, code: '120594' },
];

const ALL_AMCS = [...new Set([...MF_SCHEMES.map(s => s.amc), ...ETF_LIST.map(e => e.amc)])].sort();
let mfData = null, mfTab = 'mf', mfExpanded = '', mfView = 'card', mfAmcFilter = new Set(), mfSearchTimeout = null, mfLiveSearchMode = false;

async function fetchMF() {
  if (mfData) { buildMFChips(); renderMF(); return; }
  showMFSkeleton();
  const fetchFull = async (scheme) => { try { const r = await fetch('/api/mfapi/' + scheme.code); if (!r.ok) return null; const d = await r.json(); const h = d?.data || []; if (!h.length) return null; const latest = parseFloat(h[0]?.nav || 0); const prev = parseFloat(h[1]?.nav || latest); const chg1d = latest - prev; const pct1d = prev > 0 ? (chg1d / prev) * 100 : 0; const getH = (days) => { const target = Date.now() - days * 86400000; for (let i = h.length - 1; i >= 0; i--) { const [dd, mm, yyyy] = (h[i].date || '').split('-'); const ts = new Date(yyyy + '-' + mm + '-' + dd).getTime(); if (ts <= target) return parseFloat(h[i].nav || 0); } return 0; }; const n1 = getH(365), n3 = getH(1095), n5 = getH(1825); return { ...scheme, nav: latest, date: h[0]?.date || '', change: chg1d, pct: pct1d, ret1y: n1 > 0 ? ((latest - n1) / n1) * 100 : null, cagr3y: n3 > 0 ? (Math.pow(latest / n3, 1 / 3) - 1) * 100 : null, cagr5y: n5 > 0 ? (Math.pow(latest / n5, 1 / 5) - 1) * 100 : null, _history: h.slice(0, 30) }; } catch { return null; } };
  const batch = async (arr, size) => { const res = []; for (let i = 0; i < arr.length; i += size) { const chunk = await Promise.all(arr.slice(i, i + size).map(fetchFull)); res.push(...chunk.filter(Boolean)); if (chunk.filter(Boolean).length) { mfData = { mfs: res, etfs: ETF_LIST.map(e => ({ ...e, price: 0, change: 0, pct: 0 })), ts: Date.now() }; buildMFChips(); renderMF(); } if (i + size < arr.length) await new Promise(r => setTimeout(r, 200)); } return res; };
  try { const seen = new Set(); const unique = MF_SCHEMES.filter(s => { const k = s.code + '|' + s.label; if (seen.has(k)) return false; seen.add(k); return true; }); const mfs = await batch(unique, 3); mfData = { mfs, etfs: ETF_LIST.map(e => ({ ...e, price: 0, change: 0, pct: 0, _fetched: false })), ts: Date.now() }; buildMFChips(); renderMF(); fetchETFPrices(); const upd = document.getElementById('mf-last-upd'); if (upd) { const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }); upd.textContent = 'NAV · ' + now + ' IST'; } } catch (e) { document.getElementById('mf-content').innerHTML = '<div style="color:#ff4444;padding:20px">Error: ' + e.message + '</div>'; }
}

async function fetchETFPrices() {
  if (!mfData) return;
  const promises = mfData.etfs.map(async (e) => { try { const r = await fetch('/api/mfapi/' + e.code); if (!r.ok) return; const d = await r.json(); const h = d?.data || []; if (!h.length) return; const price = parseFloat(h[0]?.nav || 0); const prev = parseFloat(h[1]?.nav || price); e.price = price; e.change = price - prev; e.pct = prev > 0 ? ((price - prev) / prev) * 100 : 0; e.date = h[0]?.date || ''; e._fetched = true; } catch { } });
  for (let i = 0; i < promises.length; i += 3) { await Promise.all(promises.slice(i, i + 3)); await new Promise(r => setTimeout(r, 200)); }
  if (mfTab === 'etf') renderMF();
}

function forceMF() { mfData = null; mfAmcFilter.clear(); fetchMF(); }
function switchMFTab(tab) { mfTab = tab; mfExpanded = ''; mfLiveSearchMode = false; document.getElementById('mftab-mf').classList.toggle('sc-vbtn-on', tab === 'mf'); document.getElementById('mftab-etf').classList.toggle('sc-vbtn-on', tab === 'etf'); renderMF(); }
function setMFView(v) { mfView = v; document.getElementById('mf-vcard')?.classList.toggle('sc-vbtn-on', v === 'card'); document.getElementById('mf-vlist')?.classList.toggle('sc-vbtn-on', v === 'list'); renderMF(); }
function toggleMFAmc(amc) { if (mfAmcFilter.has(amc)) mfAmcFilter.delete(amc); else mfAmcFilter.add(amc); document.querySelectorAll('.sc-chip').forEach(c => { if (c.dataset.amc === amc) c.classList.toggle('sc-chip-on', mfAmcFilter.has(amc)); }); renderMF(); }
function buildMFChips() { const wrap = document.getElementById('mf-amc-chips'); if (!wrap) return; wrap.innerHTML = ALL_AMCS.map(a => '<span class="sc-chip' + (mfAmcFilter.has(a) ? ' sc-chip-on' : '') + '" data-amc="' + a + '" onclick="toggleMFAmc(\'' + a + '\')">' + a + '</span>').join(''); }
function onMFSearch(val) { clearTimeout(mfSearchTimeout); const q = val.trim(); if (!q) { mfLiveSearchMode = false; renderMF(); return; } renderMF(); mfSearchTimeout = setTimeout(() => { if (q.length >= 3) mfApiSearch(q); }, 700); }

async function mfApiSearch(q) {
  const el = document.getElementById('mf-content'); const currentQ = (document.getElementById('mf-q')?.value?.trim() || ''); if (currentQ !== q) return;
  el.innerHTML = '<div style="color:#8B7FD4;text-align:center;padding:16px;font-size:11px;letter-spacing:.6px">SEARCHING MFAPI FOR "' + q.toUpperCase() + '"...</div>';
  try {
    const r = await fetch('/api/mfapi/search?q=' + encodeURIComponent(q)); const results = await r.json();
    if (!results?.length) { el.innerHTML = '<div style="color:#333;padding:20px;text-align:center">No schemes found</div>'; return; }
    const top = results.slice(0, 16); const withNav = [];
    for (let i = 0; i < top.length; i += 4) { const chunk = await Promise.all(top.slice(i, i + 4).map(async s => { try { const nr = await fetch('/api/mfapi/' + s.schemeCode); const nd = await nr.json(); const h = nd?.data || []; const nav = parseFloat(h[0]?.nav || 0), prev = parseFloat(h[1]?.nav || nav); const chg = nav - prev, pct = prev > 0 ? (chg / prev) * 100 : 0; const g = (days) => { const target = Date.now() - days * 86400000; for (let i = h.length - 1; i >= 0; i--) { const [dd, mm, yyyy] = (h[i].date || '').split('-'); if (new Date(yyyy + '-' + mm + '-' + dd).getTime() <= target) return parseFloat(h[i].nav || 0); } return 0; }; const n1 = g(365), n3 = g(1095), n5 = g(1825); return { label: s.schemeName, amc: s.fundHouse || '', cat: s.schemeType || '', nav, date: h[0]?.date || '', change: chg, pct, ret1y: n1 > 0 ? ((nav - n1) / n1) * 100 : null, cagr3y: n3 > 0 ? (Math.pow(nav / n3, 1 / 3) - 1) * 100 : null, cagr5y: n5 > 0 ? (Math.pow(nav / n5, 1 / 5) - 1) * 100 : null, isFoF: (s.schemeName || '').toLowerCase().includes('fof'), _history: h.slice(0, 30) }; } catch { return null; } })); withNav.push(...chunk.filter(Boolean)); await new Promise(r => setTimeout(r, 30)); }
    if ((document.getElementById('mf-q')?.value?.trim() || '') !== q) return;
    mfLiveSearchMode = true; renderMFCards(el, withNav, 'SEARCH: "' + q.toUpperCase() + '" — ' + withNav.length + ' FUNDS');
  } catch (e) { el.innerHTML = '<div style="color:#ff4444;padding:20px">Search error: ' + e.message + '</div>'; }
}

function showMFSkeleton() {
  const el = document.getElementById('mf-content'); if (!el) return;
  const card = (i) => '<div class="mf-tile mf-enter" style="animation-delay:' + i * 40 + 'ms"><div class="mf-skel" style="height:11px;width:70%;margin-bottom:8px"></div><div class="mf-skel" style="height:9px;width:38%;margin-bottom:12px"></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px"><div class="mf-skel" style="height:24px;border-radius:4px"></div><div class="mf-skel" style="height:24px;border-radius:4px"></div><div class="mf-skel" style="height:24px;border-radius:4px"></div></div></div>';
  el.innerHTML = '<div style="color:#3a3a5a;font-size:10px;letter-spacing:.8px;margin-bottom:10px">FETCHING NAV DATA...</div><div class="mf-grid">' + Array.from({ length: 8 }, (_, i) => card(i)).join('') + '</div>';
}

function retColor(v) { if (v == null) return '#2a2a4a'; return v >= 20 ? '#00cc66' : v >= 10 ? '#55bb77' : v >= 0 ? '#777' : '#ff4444'; }
function retBar(label, val, maxPct) {
  if (val == null) return '<div class="mf-ret-bar-wrap"><span class="mf-ret-label">' + label + '</span><div class="mf-ret-track"><div class="mf-ret-fill" style="width:0%;background:#1a1a2e"></div></div><span class="mf-ret-val" style="color:#2a2a4a">—</span></div>';
  const w = Math.min(100, Math.max(0, (val / maxPct) * 100)); const col = retColor(val); const sign = val >= 0 ? '+' : '';
  return '<div class="mf-ret-bar-wrap"><span class="mf-ret-label">' + label + '</span><div class="mf-ret-track"><div class="mf-ret-fill" style="width:' + w + '%;background:' + col + '"></div></div><span class="mf-ret-val" style="color:' + col + '">' + sign + val.toFixed(1) + '%</span></div>';
}
function miniSparkSVG(history) { if (!history || history.length < 2) return ''; const navs = history.map(h => parseFloat(h.nav || 0)).filter(v => v > 0).reverse(); if (navs.length < 2) return ''; const min = Math.min(...navs), max = Math.max(...navs), rng = max - min || 1; const W = 200, H = 28; const pts = navs.map((v, i) => ((i / (navs.length - 1)) * W) + ',' + (H - ((v - min) / rng) * (H - 4) - 2)).join(' '); const col = navs[navs.length - 1] >= navs[0] ? '#00cc66' : '#ff4444'; return '<svg class="mf-sparkline" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="1.5" stroke-linejoin="round" opacity=".8"/></svg>'; }
function fmtAUM(v) { return v >= 1000 ? '₹' + (v / 1000).toFixed(1) + 'K Cr' : '₹' + v + ' Cr'; }

function renderMFCardItem(m, i, kind) {
  const cls1d = m.pct > 0 ? '#00cc66' : m.pct < 0 ? '#ff4444' : '#666'; const sign1d = m.pct >= 0 ? '+' : '';
  const isFoF = m.isFoF || (m.cat || '').toLowerCase().includes('fof');
  const navVal = kind === 'ETF' ? (m.price || m.nav || 0) : (m.nav || 0);
  const exId = kind + ':' + m.label; const open = mfExpanded === exId;
  const fofTag = isFoF ? '<span class="mf-fof-tag">FoF</span>' : '';
  return '<div class="mf-tile mf-enter' + (open ? ' mf-open' : '') + (isFoF ? ' mf-fof' : '') + '" style="animation-delay:' + Math.min(300, i * 14) + 'ms" onclick="toggleMFExpand(\'' + exId.replace(/'/g, "\\'") + '\')"><div class="mf-h"><div class="mf-name">' + m.label + fofTag + '</div><div class="mf-badge">' + (m.cat || m.type || '') + '</div></div><div class="mf-meta">' + (m.amc || '') + (m.date ? ' · ' + m.date : '') + '</div><div class="mf-kpis"><div class="mf-kpi"><span>' + (kind === 'ETF' ? 'PRICE' : 'NAV') + '</span><b>₹' + (navVal ? navVal.toFixed(2) : '--') + '</b></div><div class="mf-kpi center"><span>1D</span><b style="color:' + cls1d + '">' + sign1d + m.pct.toFixed(2) + '%</b></div><div class="mf-kpi right"><span>1Y RET</span><b style="color:' + retColor(m.ret1y) + '">' + (m.ret1y != null ? (m.ret1y >= 0 ? '+' : '') + m.ret1y.toFixed(1) + '%' : '—') + '</b></div></div><div class="mf-ret-row">' + retBar('1Y', m.ret1y, 80) + retBar('3Y', m.cagr3y, 35) + retBar('5Y', m.cagr5y, 25) + '</div>' + (open ? '<div class="mf-extra"><div><span>AUM</span> <b>' + (m.aum ? fmtAUM(m.aum) : '—') + '</b></div><div><span>Exp. Ratio</span> <b>' + (m.er != null ? m.er.toFixed(2) + '%' : '—') + '</b></div><div><span>3Y CAGR</span> <b style="color:' + retColor(m.cagr3y) + '">' + (m.cagr3y != null ? (m.cagr3y >= 0 ? '+' : '') + m.cagr3y.toFixed(2) + '%' : '—') + '</b></div><div><span>5Y CAGR</span> <b style="color:' + retColor(m.cagr5y) + '">' + (m.cagr5y != null ? (m.cagr5y >= 0 ? '+' : '') + m.cagr5y.toFixed(2) + '%' : '—') + '</b></div>' + (kind === 'ETF' ? '<div class="mf-ex-full"><span>NSE Symbol</span> <b>' + (m.nse || '—') + '</b></div>' : '') + '<div class="mf-ex-full">' + miniSparkSVG(m._history) + '</div></div>' : '') + '</div>';
}

function renderMFCards(el, items, headerTxt) {
  if (!items.length) { el.innerHTML = '<div style="color:#333;padding:20px;text-align:center">No matches</div>'; return; }
  const kind = mfTab === 'etf' ? 'ETF' : 'MF'; const cntEl = document.getElementById('mf-count'); if (cntEl) { cntEl.textContent = headerTxt || items.length + ' FUNDS'; cntEl.style.color = '#8B7FD4'; setTimeout(() => { cntEl.style.color = ''; }, 600); }
  if (mfView === 'list') {
    let html = '<div class="mf-list-wrap"><div class="mf-list-hdr"><span>NAME</span><span style="text-align:right">NAV</span><span style="text-align:right">1D</span><span style="text-align:right">1Y</span><span style="text-align:right">3Y CAGR</span><span style="text-align:right">5Y CAGR</span></div>';
    items.forEach((m, i) => { const cls1d = m.pct > 0 ? 'up' : m.pct < 0 ? 'dn' : ''; const sign = m.pct >= 0 ? '+' : ''; const navVal = kind === 'ETF' ? (m.price || m.nav || 0) : (m.nav || 0); const isFoF = m.isFoF || (m.cat || '').toLowerCase().includes('fof'); const fofTag = isFoF ? '<span class="mf-fof-tag">FoF</span>' : ''; html += '<div class="mf-list-row mf-enter" style="animation-delay:' + Math.min(200, i * 8) + 'ms"><div><div class="mf-list-name">' + m.label + fofTag + '</div><div class="mf-list-sub">' + (m.amc || '') + ' · ' + (m.cat || m.type || '') + '</div></div><div class="mf-list-num">₹' + (navVal ? navVal.toFixed(2) : '--') + '</div><div class="mf-list-num ' + cls1d + '">' + sign + m.pct.toFixed(2) + '%</div><div class="mf-list-num" style="color:' + retColor(m.ret1y) + '">' + (m.ret1y != null ? (m.ret1y >= 0 ? '+' : '') + m.ret1y.toFixed(1) + '%' : '—') + '</div><div class="mf-list-num" style="color:' + retColor(m.cagr3y) + '">' + (m.cagr3y != null ? (m.cagr3y >= 0 ? '+' : '') + m.cagr3y.toFixed(1) + '%' : '—') + '</div><div class="mf-list-num" style="color:' + retColor(m.cagr5y) + '">' + (m.cagr5y != null ? (m.cagr5y >= 0 ? '+' : '') + m.cagr5y.toFixed(1) + '%' : '—') + '</div></div>'; });
    html += '</div>'; el.innerHTML = html;
  } else { let html = '<div class="mf-grid">'; items.forEach((m, i) => { html += renderMFCardItem(m, i, kind); }); html += '</div>'; el.innerHTML = html; }
  requestAnimationFrame(() => { document.querySelectorAll('.mf-ret-fill').forEach(bar => { const w = bar.style.width; bar.style.width = '0'; setTimeout(() => { bar.style.width = w; }, 80); }); });
  attachMFTooltips(el, kind);
}

function applyMFFilters(items) {
  const q = (document.getElementById('mf-q')?.value || '').trim().toLowerCase(); const catF = document.getElementById('mf-cat')?.value || ''; const sortBy = document.getElementById('mf-sort')?.value || 'amc'; let out = [...items];
  if (q) out = out.filter(m => (m.label || '').toLowerCase().includes(q) || (m.amc || '').toLowerCase().includes(q) || (m.cat || m.type || '').toLowerCase().includes(q));
  if (catF) out = out.filter(m => (m.cat || m.type || '').toLowerCase().includes(catF.toLowerCase()));
  if (mfAmcFilter.size) out = out.filter(m => mfAmcFilter.has(m.amc));
  const sorters = { amc: (a, b) => (a.amc || '').localeCompare(b.amc || '') || (a.label || '').localeCompare(b.label || ''), label: (a, b) => (a.label || '').localeCompare(b.label || ''), nav: (a, b) => (b.nav || b.price || 0) - (a.nav || a.price || 0), ret1y: (a, b) => (b.ret1y ?? -999) - (a.ret1y ?? -999), ret3y: (a, b) => (b.cagr3y ?? -999) - (a.cagr3y ?? -999), ret5y: (a, b) => (b.cagr5y ?? -999) - (a.cagr5y ?? -999), aum: (a, b) => (b.aum || 0) - (a.aum || 0), er: (a, b) => (a.er || 0) - (b.er || 0) };
  out.sort(sorters[sortBy] || sorters.amc); return out;
}

function renderMF() { const el = document.getElementById('mf-content'); if (!el || !mfData) return; if (mfLiveSearchMode) return; const pool = mfTab === 'etf' ? (mfData.etfs || []) : (mfData.mfs || []).filter(m => m?.nav); const items = applyMFFilters(pool); renderMFCards(el, items, items.length + (mfTab === 'etf' ? ' ETFs' : ' FUNDS')); }
function attachMFTooltips(el, kind) { el.onpointermove = (ev) => { const tile = ev.target.closest?.('.mf-tile,.mf-list-row'); if (!tile) return; const label = tile.dataset.label || '', amc = tile.dataset.amc || '', type = tile.dataset.type || ''; const pct = parseFloat(tile.dataset.pct || '0') || 0, price = parseFloat(tile.dataset.price || '0') || 0; const sign = pct >= 0 ? '+' : ''; showTooltip('<div class="dw-tt-h"><div><div class="dw-tt-sym">' + label + '</div><div class="dw-tt-sec">' + kind + ' · ' + type + (amc ? ' · ' + amc : '') + '</div></div><div style="text-align:right"><div class="dw-tt-sym" style="color:' + (pct >= 0 ? '#00cc66' : pct < 0 ? '#ff4444' : '#666') + '">' + sign + pct.toFixed(2) + '%</div></div></div><div class="dw-tt-row"><span>' + (kind === 'MF' ? 'NAV' : 'Price') + '</span><b>₹' + (price ? price.toFixed(2) : '--') + '</b></div>', ev.clientX, ev.clientY); }; el.onpointerleave = () => hideTooltip(); }
function toggleMFExpand(id) { mfExpanded = (mfExpanded === id) ? '' : id; renderMF(); }

// ── COMMODITIES ──
const MCX_SPARK = {};
function getMcxSpark(key, price, pct) { if (!MCX_SPARK[key]) { const pts = []; let v = price * (1 - pct / 100); for (let i = 0; i < 20; i++) { v += (price - v) * .12 + (Math.random() - .5) * price * .004; pts.push(v); } pts.push(price); MCX_SPARK[key] = pts; } return MCX_SPARK[key]; }
function drawMcxSpark(canvas, pts, up) { if (!canvas || !pts || pts.length < 2) return; canvas.width = canvas.parentElement ? canvas.parentElement.clientWidth - 28 : 160; canvas.height = 36; const ctx = canvas.getContext('2d'); const w = canvas.width, h = canvas.height; ctx.clearRect(0, 0, w, h); const mn = Math.min(...pts), mx = Math.max(...pts), rng = (mx - mn) || 1; const xs = pts.map((_, i) => (i / (pts.length - 1)) * w); const ys = pts.map(v => h - 4 - ((v - mn) / rng) * (h - 8)); const col = up ? '#00cc66' : '#ff4444'; const grad = ctx.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, up ? 'rgba(0,204,102,.22)' : 'rgba(255,68,68,.22)'); grad.addColorStop(1, 'rgba(0,0,0,0)'); ctx.beginPath(); xs.forEach((x, i) => i === 0 ? ctx.moveTo(x, ys[i]) : ctx.lineTo(x, ys[i])); ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke(); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = grad; ctx.fill(); ctx.beginPath(); ctx.arc(xs[xs.length - 1], ys[ys.length - 1], 2.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }

async function fetchCommodities() {
  const el = document.getElementById('commodities-content'); if (!el) return;
  if (commoditiesData) { renderCommodities(); return; }
  el.innerHTML = `<div style="color:#666;text-align:center;padding:40px;font-size:14px">Loading commodities...</div>`;
  try {
    const res = await fetch('/api/global'); const d = await res.json();
    const usdInrRaw = document.getElementById('m-usdinr')?.textContent || ''; const usdInr = parseFloat(usdInrRaw) || 84;
    commoditiesData = [
      { key: 'GOLD', label: 'GOLD', unit: 'USD/oz', section: 'PRECIOUS METALS', indLabel: 'MCX Gold', indUnit: '₹/10g', data: d.GOLD, convFn: p => (p * usdInr / 31.1035 * 10), mcxNote: 'Multi Commodity Exchange' },
      { key: 'SILVER', label: 'SILVER', unit: 'USD/oz', section: 'PRECIOUS METALS', indLabel: 'MCX Silver', indUnit: '₹/kg', data: d.SILVER, convFn: p => (p * usdInr / 31.1035 * 1000), mcxNote: 'MCX Silver Mini also available' },
      { key: 'CRUDE', label: 'CRUDE OIL WTI', unit: 'USD/bbl', section: 'ENERGY', indLabel: 'MCX Crude', indUnit: '₹/bbl', data: d.CRUDE, convFn: p => (p * usdInr), mcxNote: 'MCX Crude (NYMEX contract)' },
      { key: 'NATGAS', label: 'NATURAL GAS', unit: 'USD/MMBtu', section: 'ENERGY', indLabel: 'MCX Nat Gas', indUnit: '₹/MMBtu', data: d.NATGAS, convFn: p => (p * usdInr), mcxNote: 'MCX Natural Gas' },
      { key: 'COPPER', label: 'COPPER', unit: 'USD/lb', section: 'BASE METALS', indLabel: 'MCX Copper', indUnit: '₹/kg', data: d.COPPER, convFn: p => (p * 2.20462 * usdInr / 1000 * 1000), mcxNote: 'MCX Copper (per kg)' },
      { key: 'USDINR', label: 'USD / INR', unit: '₹ per $', section: 'FX & MACRO', indLabel: '', indUnit: '', data: { price: usdInr, percent_change: 0, change: 0 }, convFn: null, mcxNote: 'RBI reference rate' },
      { key: 'DXY', label: 'DOLLAR INDEX', unit: 'Index', section: 'FX & MACRO', indLabel: '', indUnit: '', data: d.DXY, convFn: null, mcxNote: 'DXY basket index' },
    ];
    renderCommodities();
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }); const upd = document.getElementById('mcx-last-upd'); if (upd) upd.textContent = 'Updated ' + now + ' IST';
  } catch (e) { el.innerHTML = `<div style="color:#ff4444;padding:20px">Error: ${e.message}</div>`; }
}

function forceCommodities() { commoditiesData = null; fetchCommodities(); }

function renderCommodities() {
  const el = document.getElementById('commodities-content'); if (!el || !commoditiesData) return;
  const sectionOrder = ['PRECIOUS METALS', 'ENERGY', 'BASE METALS', 'FX & MACRO']; const sections = {};
  commoditiesData.forEach(c => { const sec = c.section || 'OTHER'; if (!sections[sec]) sections[sec] = []; sections[sec].push(c); });
  let html = '';
  sectionOrder.forEach(sec => {
    const items = sections[sec]; if (!items || !items.length) return;
    html += `<div class="mcx-section-head">${sec}</div><div class="mcx-grid">`;
    items.forEach((c, ci) => {
      const p = parseFloat(c.data?.price || 0), ch = parseFloat(c.data?.change || 0), pct = parseFloat(c.data?.percent_change || 0);
      const sign = ch >= 0 ? '+' : ''; const cls = pct > 0 ? 'up' : pct < 0 ? 'dn' : 'flat'; const arrow = pct > 0 ? ' ▲' : pct < 0 ? ' ▼' : '';
      const hasMcx = c.convFn && p > 0; let primaryPrice, secondaryHtml = '';
      if (hasMcx) { const ip = c.convFn(p); primaryPrice = ip >= 10000 ? '₹' + ip.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : ip >= 100 ? '₹' + ip.toFixed(2) : '₹' + ip.toFixed(4); const usdStr = p >= 10000 ? p.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : p >= 100 ? p.toFixed(2) : p > 0 ? p.toFixed(4) : '--'; secondaryHtml = `<div class="mcx-ind-row"><span>International <span style="color:#554d32;font-size:9px">${c.unit}</span></span><span class="mcx-ind-val">${usdStr}</span></div>`; }
      else { const priceStr = p >= 10000 ? p.toLocaleString('en-IN', { maximumFractionDigits: 1 }) : p >= 100 ? p.toFixed(2) : p > 0 ? p.toFixed(4) : '--'; primaryPrice = priceStr; }
      html += `<div class="mcx-card" id="mcx-card-${c.key}" style="animation-delay:${ci * 55}ms"><div class="mcx-label-row"><span class="mcx-label">${c.label}</span><span class="mcx-unit-tag">${hasMcx ? c.indUnit : c.unit}</span></div><div class="mcx-price" id="mcx-price-${c.key}">${primaryPrice}</div><div class="mcx-change ${cls}" id="mcx-change-${c.key}">${sign}${Math.abs(ch).toFixed(ch >= 100 ? 0 : 2)} (${sign}${pct.toFixed(2)}%)${arrow}</div><div class="mcx-spark-wrap"><canvas class="mcx-spark-canvas" id="mcx-spark-${c.key}"></canvas></div>${secondaryHtml}${c.mcxNote ? `<div style="font-size:9px;color:#3a3226;margin-top:6px">${c.mcxNote}</div>` : ''}</div>`;
    }); html += '</div>';
  });
  el.innerHTML = html;
  animateCollection('#commodities-content .mcx-card', { y: 16, stagger: 0.04, duration: 0.36 });
  requestAnimationFrame(() => { commoditiesData.forEach(c => { const p = parseFloat(c.data?.price || 0); const pct = parseFloat(c.data?.percent_change || 0); const canvas = document.getElementById(`mcx-spark-${c.key}`); if (canvas && p > 0) { const pts = getMcxSpark(c.key, p, pct); setTimeout(() => drawMcxSpark(canvas, pts, pct >= 0), 80); } }); });
}

// ── LOCK-IN ──
async function fetchLockin() {
  if (lockinData) { renderLockin(); return; }
  try { const res = await fetch('/api/lockin'); lockinData = await res.json(); renderLockin(); }
  catch { const el = document.getElementById('lockin-content'); if (el) el.innerHTML = '<div style="color:#ff6666;padding:14px">Lock-in feed unavailable right now.</div>'; }
}

function renderLockin() {
  const el = document.getElementById('lockin-content'); if (!el) return;
  const events = lockinData?.events || []; if (!events.length) { el.innerHTML = '<div style="color:#666;padding:14px">No lock-in/unlock events currently found.</div>'; return; }
  const grouped = {}; events.forEach(x => { const d = x.date ? new Date(x.date) : null; const k = d && !isNaN(d) ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Undated'; if (!grouped[k]) grouped[k] = []; grouped[k].push(x); });
  let html = '';
  Object.entries(grouped).forEach(([date, list]) => {
    html += `<div class="lockin-group"><div class="lockin-date">${date.toUpperCase()}</div>`;
    list.forEach(item => { const days = Number(item.daysLeft); const countdown = Number.isFinite(days) ? (days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'today' : `${days}d left`) : '--'; const statusCls = item.status === 'ENDED' ? 'ended' : item.status === 'SOON' ? 'soon' : 'upcoming'; html += `<div class="lockin-card"><div><div class="lockin-name">${item.isBigPlayer ? '★ ' : ''}${item.company}</div><div class="lockin-meta">${item.event}${item.source ? ' · ' + item.source : ''}${item.url ? ` · <a href="${item.url}" target="_blank" style="color:#7aa4c3">source</a>` : ''}</div><div class="lockin-meta">Countdown: <span class="lockin-count ${statusCls}">${countdown}</span></div></div><div class="lockin-qty">${item.qty}</div><div class="lockin-impact">${item.impact}</div></div>`; });
    html += `</div>`;
  });
  el.innerHTML = html;
}

// ── EARNINGS CALENDAR ──
const EARNINGS = [
  { date: '07 Apr', company: 'TCS', sym: 'TCS', est: 'Rev $7.1B', period: 'Q4 FY26', sector: 'IT', nse: 'TCS', ir: 'https://investors.tcs.com' },
  { date: '10 Apr', company: 'Infosys', sym: 'INFY', est: 'Rev $4.8B', period: 'Q4 FY26', sector: 'IT', nse: 'INFY', ir: 'https://www.infosys.com/investors.html' },
  { date: '14 Apr', company: 'HDFC Bank', sym: 'HDFCBANK', est: 'NII ₹31,400Cr', period: 'Q4 FY26', sector: 'BANK', nse: 'HDFCBANK', ir: 'https://www.hdfcbank.com' },
  { date: '15 Apr', company: 'ICICI Bank', sym: 'ICICIBANK', est: 'NII ₹21,600Cr', period: 'Q4 FY26', sector: 'BANK', nse: 'ICICIBANK', ir: 'https://www.icicibank.com/investor-relations' },
  { date: '19 Apr', company: 'Reliance Industries', sym: 'RELIANCE', est: 'EBITDA ₹47,000Cr', period: 'Q4 FY26', sector: 'ENERGY', nse: 'RELIANCE', ir: 'https://www.ril.com/investor-relations' },
  { date: '25 Apr', company: 'SBI', sym: 'SBIN', est: 'NII ₹42,000Cr', period: 'Q4 FY26', sector: 'BANK', nse: 'SBIN', ir: 'https://sbi.co.in/web/investor-relations' },
  { date: '28 Apr', company: 'Tata Motors', sym: 'TATAMOTORS', est: 'Rev ₹1,22,000Cr', period: 'Q4 FY26', sector: 'AUTO', nse: 'TATAMOTORS', ir: 'https://www.tatamotors.com/investors/' },
  { date: '05 May', company: 'Sun Pharma', sym: 'SUNPHARMA', est: 'Rev ₹14,200Cr', period: 'Q4 FY26', sector: 'PHARMA', nse: 'SUNPHARMA', ir: 'https://www.sunpharma.com/investors' },
];
const SECTOR_COLORS = { IT: '#185FA5', BANK: '#0F6E56', AUTO: '#993C1D', FMCG: '#3B6D11', PHARMA: '#534AB7', FINANCE: '#854F0B', ENERGY: '#A32D2D', INFRA: '#5F5E5A', CONGLOM: '#72243E' };

function renderEarnings() {
  const el = document.getElementById('earnings-content'); if (!el) return;
  const grouped = {}; EARNINGS.forEach(e => { if (!grouped[e.date]) grouped[e.date] = []; grouped[e.date].push(e); });
  const today = new Date(); let html = '';
  Object.entries(grouped).forEach(([date, items]) => {
    const d = new Date(date + ' 2026'); const isPast = d < today; const isToday = d.toDateString() === today.toDateString(); const isNext7 = (d - today) < 7 * 86400000 && d >= today;
    html += `<div style="margin-bottom:18px"><div style="font-size:13px;font-weight:bold;letter-spacing:1px;margin-bottom:8px;color:${isToday ? '#ff6600' : isPast ? '#333' : '#888'};display:flex;align-items:center;gap:8px">${date.toUpperCase()}${isToday ? '<span style="background:#1a0a00;color:#ff6600;border:1px solid #ff6600;font-size:10px;padding:1px 6px;border-radius:2px">TODAY</span>' : ''}${isNext7 && !isToday ? '<span style="background:#1a1000;color:#ff9900;border:1px solid #2a1800;font-size:10px;padding:1px 6px;border-radius:2px">UPCOMING</span>' : ''}</div>`;
    items.forEach(e => { const sc = SECTOR_COLORS[e.sector] || '#444'; html += `<div style="background:#0a0a18;border:1px solid #1a1a2e;border-left:3px solid ${sc};border-radius:3px;padding:10px 12px;margin-bottom:7px;opacity:${isPast ? 0.45 : 1}"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="color:#e8dfc0;font-size:14px;font-weight:bold;cursor:pointer" onclick="document.getElementById('rp-ticker').value='${e.sym}';applyTicker()">${e.company} ↗</span><span style="background:#0d0d18;color:${sc};font-size:11px;padding:2px 7px;border-radius:2px;border:1px solid ${sc}40">${e.sector}</span></div><div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#555;font-size:12px">${e.sym} · ${e.period}</span><span style="color:#888;font-size:12px;font-weight:bold">Est: ${e.est}</span></div><div style="display:flex;gap:6px;flex-wrap:wrap"><a href="https://www.nseindia.com/get-quotes/equity?symbol=${e.nse}" target="_blank" style="color:#ff6600;font-size:11px;padding:2px 8px;border:1px solid #ff6600;border-radius:2px;text-decoration:none;background:#1a0a00">NSE</a><a href="${e.ir}" target="_blank" style="color:#00cc66;font-size:11px;padding:2px 8px;border:1px solid #00cc66;border-radius:2px;text-decoration:none;background:#001a0a">Investor Relations</a></div></div>`; });
    html += `</div>`;
  });
  el.innerHTML = html;
}

let fiiDiiData = null;
function pickLatestFlowEntry(data, side) {
  const flatValue = Number(data?.[`${side}_net`]);
  if (Number.isFinite(flatValue)) return { net: flatValue, date: data?.date || '' };
  const todayValue = Number(data?.today?.[`${side}_net`]);
  if (Number.isFinite(todayValue)) return { net: todayValue, date: data?.today?.date || '' };
  const history = Array.isArray(data?.[`${side}_history`]) ? data[`${side}_history`] : Array.isArray(data?.[side]) ? data[side] : [];
  const latest = history.find(item => Number.isFinite(Number(item?.net)));
  if (!latest) return { net: null, date: data?.date || data?.today?.date || '' };
  return { net: Number(latest.net), date: latest.date || data?.date || data?.today?.date || '' };
}
function processFiiDii(data) {
  try {
    if (!data) return; fiiDiiData = data;
    const fiiLatest = pickLatestFlowEntry(fiiDiiData, 'fii'); const diiLatest = pickLatestFlowEntry(fiiDiiData, 'dii');
    const today = { fii_net: fiiLatest.net, dii_net: diiLatest.net, date: fiiLatest.date || diiLatest.date || fiiDiiData?.date || fiiDiiData?.today?.date || '' }; const fiiEl = document.getElementById('m-fii'); const diiEl = document.getElementById('m-dii');
    if (fiiEl) {
      if (Number.isFinite(today.fii_net)) { const v = today.fii_net; const sign = v >= 0 ? '+' : ''; fiiEl.textContent = sign + '₹' + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' Cr'; fiiEl.className = 'mv ' + (v >= 0 ? 'up' : 'dn'); }
      else { fiiEl.textContent = 'Awaiting NSE EOD'; fiiEl.className = 'mv'; }
    }
    if (diiEl) {
      if (Number.isFinite(today.dii_net)) { const v = today.dii_net; const sign = v >= 0 ? '+' : ''; diiEl.textContent = sign + '₹' + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' Cr'; diiEl.className = 'mv ' + (v >= 0 ? 'up' : 'dn'); }
      else { diiEl.textContent = 'Awaiting NSE EOD'; diiEl.className = 'mv'; }
    }
    renderFiiDiiFlowBar(today);
  } catch (e) { console.warn('FII/DII fetch failed:', e.message); }
}

function renderFiiDiiFlowBar(today) {
  let bar = document.getElementById('fii-dii-flow-bar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'fii-dii-flow-bar'; bar.style.cssText = 'padding:8px 12px 10px;border-bottom:1px solid #0d0d18;'; const macroList = document.getElementById('macro-list'); if (macroList?.nextSibling) macroList.parentNode.insertBefore(bar, macroList.nextSibling); else if (macroList?.parentNode) macroList.parentNode.appendChild(bar); }
  const fii = today?.fii_net ?? 0; const dii = today?.dii_net ?? 0; const total = Math.abs(fii) + Math.abs(dii) || 1; const fiiPct = (Math.abs(fii) / total * 100).toFixed(1); const diiPct = (Math.abs(dii) / total * 100).toFixed(1); const fiiSign = fii >= 0 ? '+' : '-'; const diiSign = dii >= 0 ? '+' : '-'; const fiiCls = fii >= 0 ? '#00cc66' : '#ff4444'; const diiCls = dii >= 0 ? '#00cc66' : '#ff4444'; const netFlow = fii + dii; const netSign = netFlow >= 0 ? '+' : '';
  bar.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:9px;color:#444;letter-spacing:.5px;margin-bottom:4px"><span style="color:#554">FII <span style="color:${fiiCls}">${fiiSign}₹${Math.abs(fii).toLocaleString('en-IN', { maximumFractionDigits: 0 })}Cr</span></span><span style="color:#555;font-size:8px">NET ${netSign}₹${Math.abs(netFlow).toLocaleString('en-IN', { maximumFractionDigits: 0 })}Cr</span><span style="color:#554">DII <span style="color:${diiCls}">${diiSign}₹${Math.abs(dii).toLocaleString('en-IN', { maximumFractionDigits: 0 })}Cr</span></span></div><div class="fii-flow-bar"><div class="fii-flow-sell" id="fii-flow-sell" style="width:0%"></div><div style="flex:1;min-width:2px;background:#0d0d18"></div><div class="fii-flow-buy" id="fii-flow-buy" style="width:0%"></div></div>`;
  requestAnimationFrame(() => { setTimeout(() => { const sellEl = document.getElementById('fii-flow-sell'); const buyEl = document.getElementById('fii-flow-buy'); if (sellEl) sellEl.style.width = (fii < 0 ? fiiPct : '0') + '%'; if (buyEl) buyEl.style.width = (dii > 0 ? diiPct : '0') + '%'; }, 200); });
}

// ── BRIDGE INTEGRATION ──
const WORLDMONITOR_STANDALONE_REMOTE_URL = 'https://finance.worldmonitor.app/?variant=finance&preset=dalal';
const WORLDMONITOR_STANDALONE_LOCAL_URL = 'http://127.0.0.1:3200/?variant=finance&preset=dalal';
const BRIDGE_PRESETS = {
  macro: { route: 'macro', title: 'Macro pressure, breadth, and risk flow.', desc: 'Rates, dollar, and liquidity are driving the setup.', overlay: 'Watching macro pressure, dollar stress, and risk appetite.', mode: 'Macro Watch', themeClass: 'bridge-macro', state: {} },
  energy: { route: 'energy', title: 'Energy shock is the first domino.', desc: 'Track crude, shipping, and inflation pressure before they bleed into India margins.', overlay: 'Watching oil, routes, freight stress, and inflation pressure.', mode: 'Energy Shock', themeClass: 'bridge-energy', state: {} },
  china: { route: 'china', title: 'Asia and metals need a different lens.', desc: 'When China demand or Asia-wide risk starts moving metals and exporters.', overlay: 'Watching Asia growth, metals demand, and export-sensitive risk.', mode: 'China Pulse', themeClass: 'bridge-china', state: {} },
};
let bridgeGraphSeries = []; let bridgeGraphMode = 'macro'; let bridgeGraphTimer = null;

function getBridgeStory() { if (Array.isArray(currentStories) && currentStories.length) { if (activeIdx >= 0 && currentStories[activeIdx]) return currentStories[activeIdx]; return currentStories[0]; } return null; }
function parseBridgeNumber(value) { const cleaned = String(value || '').replace(/[^0-9.\-]/g, ''); const parsed = parseFloat(cleaned); return Number.isFinite(parsed) ? parsed : null; }
function getWorldMonitorStandaloneUrl() { return /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname) ? WORLDMONITOR_STANDALONE_LOCAL_URL : WORLDMONITOR_STANDALONE_REMOTE_URL; }
window.getWorldMonitorStandaloneUrl = getWorldMonitorStandaloneUrl;
function inferFinanceBridgePreset(routeOverride) {
  const forcedRoute = routeOverride || manualPulseRoute; if (forcedRoute && BRIDGE_PRESETS[forcedRoute]) return BRIDGE_PRESETS[forcedRoute];
  const story = getBridgeStory(); const bag = [currentCat, currentRP, currentTicker, story?.headline || '', story?.body || '', ...(story?.tags || [])].join(' ').toLowerCase();
  if (/crude|oil|hormuz|iran|israel|shipping|strait|sanction|airline|paint|energy/.test(bag)) return BRIDGE_PRESETS.energy;
  if (/china|metal|steel|copper|asia|export|hang seng|nikkei|yuan|commodity/.test(bag)) return BRIDGE_PRESETS.china;
  return BRIDGE_PRESETS.macro;
}
function setDalalPulseMode(route) { manualPulseRoute = BRIDGE_PRESETS[route] ? route : null; refreshFinanceBridge(); }
window.setDalalPulseMode = setDalalPulseMode;
function openWorldMonitorStandalone() { window.open(getWorldMonitorStandaloneUrl(), '_blank', 'noopener'); }
window.openWorldMonitorStandalone = openWorldMonitorStandalone;
function showWorldMonitorFinance() { openWorldMonitorStandalone(); }
window.showWorldMonitorFinance = showWorldMonitorFinance;
function updateFinanceBridgeCards(activeRoute) { document.querySelectorAll('[data-bridge-route]').forEach(card => { card.classList.toggle('is-active', card.dataset.bridgeRoute === activeRoute); }); }

function drawFinanceBridgeGraph() {
  const canvas = document.getElementById('wm-bridge-graph'); if (!canvas) return;
  const parent = canvas.parentElement; const width = Math.max(240, parent.clientWidth - 28); const height = 84; const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr; canvas.height = height * dpr; canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d'); if (!ctx) return; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  if (!bridgeGraphSeries.length) { bridgeGraphSeries = Array.from({ length: 42 }, (_, i) => 100 + Math.sin(i / 5) * 4 + (Math.random() - .5) * 3); }
  const min = Math.min(...bridgeGraphSeries) - 4; const max = Math.max(...bridgeGraphSeries) + 4; const range = Math.max(8, max - min);
  const lineColor = bridgeGraphMode === 'energy' ? '#ff8a38' : bridgeGraphMode === 'china' ? '#5ec9ff' : '#8e84ff';
  const fillColor = bridgeGraphMode === 'energy' ? '255,102,0' : bridgeGraphMode === 'china' ? '105,200,255' : '142,132,255';
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; for (let i = 1; i <= 3; i++) { const y = (height / 4) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  ctx.beginPath(); bridgeGraphSeries.forEach((value, index) => { const x = (index / (bridgeGraphSeries.length - 1)) * width; const y = height - ((value - min) / range) * (height - 12) - 6; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  const gradient = ctx.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, `rgba(${fillColor},0.28)`); gradient.addColorStop(1, `rgba(${fillColor},0)`);
  ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath(); bridgeGraphSeries.forEach((value, index) => { const x = (index / (bridgeGraphSeries.length - 1)) * width; const y = height - ((value - min) / range) * (height - 12) - 6; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.shadowBlur = 14; ctx.shadowColor = lineColor; ctx.stroke(); ctx.shadowBlur = 0;
  const lastY = height - ((bridgeGraphSeries[bridgeGraphSeries.length - 1] - min) / range) * (height - 12) - 6;
  ctx.beginPath(); ctx.arc(width, lastY, 3, 0, Math.PI * 2); ctx.fillStyle = '#fff3da'; ctx.fill();
}

function tickFinanceBridgeGraph() {
  const preset = inferFinanceBridgePreset(); bridgeGraphMode = preset.route;
  const drift = preset.route === 'energy' ? .35 : preset.route === 'china' ? -.05 : .12;
  const last = bridgeGraphSeries.length ? bridgeGraphSeries[bridgeGraphSeries.length - 1] : 100;
  const next = last + drift + (Math.random() - .5) * (preset.route === 'energy' ? 2.2 : 1.5);
  bridgeGraphSeries.push(next); if (bridgeGraphSeries.length > 42) bridgeGraphSeries.shift(); drawFinanceBridgeGraph();
}

function initFinanceBridgeGraph() { if (bridgeGraphTimer) return; drawFinanceBridgeGraph(); bridgeGraphTimer = setInterval(tickFinanceBridgeGraph, 1200); window.addEventListener('resize', drawFinanceBridgeGraph); }
function initFinanceBridgeMotion() { if (typeof gsap === 'undefined') return; gsap.from('#wm-top-launch', { opacity: 0, y: -10, duration: .45, delay: .2, ease: 'power2.out' }); gsap.from('#wm-bridge .wm-bridge-copy > *', { opacity: 0, y: 16, duration: .6, stagger: .06, ease: 'power2.out', delay: .18 }); gsap.from('#wm-bridge .wm-bridge-hero', { opacity: 0, x: 24, duration: .7, ease: 'power3.out', delay: .25 }); gsap.to('#wm-bridge-figure', { y: -6, duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut' }); }

function animateCollection(selector, options = {}) {
  if (typeof gsap === 'undefined') return;
  const nodes = Array.from(document.querySelectorAll(selector)); if (!nodes.length) return;
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; if (prefersReduced) return;
  let { x = 0, y = 12, scale = .985, duration = .3, stagger = .03, delay = 0 } = options;
  if (window.innerWidth <= 980) { y = Math.min(Math.abs(y), 6); scale = .995; duration = Math.min(duration, .2); stagger = Math.min(stagger, .015); }
  if (nodes.length > 20) { duration = Math.min(duration, .22); stagger = Math.min(stagger, .012); }
  gsap.killTweensOf(nodes); gsap.fromTo(nodes, { autoAlpha: 0, x, y, scale }, { autoAlpha: 1, x: 0, y: 0, scale: 1, duration, stagger, delay, ease: 'power2.out', overwrite: true });
}

function refreshFinanceBridge() {
  const root = document.getElementById('wm-bridge'); if (!root) return;
  const preset = inferFinanceBridgePreset();
  root.classList.remove('bridge-macro', 'bridge-energy', 'bridge-china'); root.classList.add(preset.themeClass);
  const story = getBridgeStory();
  const titleEl = document.getElementById('wm-bridge-title'); const descEl = document.getElementById('wm-bridge-desc'); const modeEl = document.getElementById('wm-bridge-mode');
  if (titleEl) titleEl.textContent = preset.title;
  if (descEl) { const extra = story?.headline ? ` Active trigger: ${story.headline.slice(0, 110)}${story.headline.length > 110 ? '…' : ''}` : ''; descEl.textContent = preset.desc + extra; }
  if (modeEl) modeEl.textContent = preset.mode;
  const niftyEl = document.getElementById('wm-bridge-nifty'); if (niftyEl) niftyEl.textContent = document.getElementById('s-nifty')?.textContent || '--';
  const usdEl = document.getElementById('wm-bridge-usdinr');
  if (usdEl) { const usdInr = parseBridgeNumber(document.getElementById('m-usdinr')?.textContent); usdEl.textContent = Number.isFinite(usdInr) ? usdInr.toFixed(2) : '--'; }
  const topLaunch = document.getElementById('wm-top-launch'); if (topLaunch) { topLaunch.textContent = 'REFRESH NOW'; topLaunch.classList.remove('is-live'); }
  updateFinanceBridgeCards(preset.route); bridgeGraphMode = preset.route; drawFinanceBridgeGraph();
}
window.refreshFinanceBridge = refreshFinanceBridge;

// ── FOCUS MODE ──
// FIX: Default is FALSE — terminal opens normally, user can enable focus mode manually
let dalalFocusMode = JSON.parse(localStorage.getItem('dw-focus-mode') || 'false');

// Clear any stale 'true' value that caused it to always open in focus mode
if (dalalFocusMode === true) {
  // Only keep focus mode if user explicitly set it THIS session — reset on fresh load
  // Comment out the next line if you WANT focus mode to persist across sessions
  dalalFocusMode = false;
  localStorage.setItem('dw-focus-mode', 'false');
}

function applyDalalFocusMode() {
  document.body.classList.toggle('dalal-focus-mode', dalalFocusMode);
  document.getElementById('bb')?.classList.toggle('dalal-focus-mode', dalalFocusMode);
  const btn = document.getElementById('dw-focus-toggle');
  if (btn) { btn.textContent = dalalFocusMode ? 'EXIT FOCUS' : 'TERMINAL FOCUS'; btn.classList.toggle('is-active', dalalFocusMode); btn.setAttribute('aria-pressed', dalalFocusMode ? 'true' : 'false'); }
  const escHint = document.getElementById('focus-esc-hint');
  if (escHint) { escHint.classList.toggle('is-visible', dalalFocusMode); escHint.setAttribute('aria-hidden', dalalFocusMode ? 'false' : 'true'); }
}

function toggleDalalFocusMode(force) {
  dalalFocusMode = typeof force === 'boolean' ? force : !dalalFocusMode;
  localStorage.setItem('dw-focus-mode', JSON.stringify(dalalFocusMode));
  applyDalalFocusMode();
  if (!dalalFocusMode && !bridgeGraphTimer) { initFinanceBridgeGraph(); initFinanceBridgeMotion(); refreshFinanceBridge(); }
}
window.toggleDalalFocusMode = toggleDalalFocusMode;

// ── LAYOUT SAVE/RESTORE ──
function saveLayout() { localStorage.setItem('dw-layout', JSON.stringify({ cat: currentCat, rp: currentRP, ticker: currentTicker })); }
function restoreLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem('dw-layout') || '{}');
    const cat = saved.cat || 'market';
    let rp = saved.rp || 'detail';
    if (rp === 'charts' || rp === 'wm' || rp === 'earnings') rp = 'detail';
    const ticker = saved.ticker || 'NIFTY';
    loadCategory(cat, { fetchNews: false }); switchRP(rp, { fetchAdviceOnOpen: false });
    if (ticker !== 'NIFTY') currentTicker = ticker;
  } catch (e) { loadCategory('market', { fetchNews: false }); }
}

// ── KEYBOARD SHORTCUTS ──
const KEY_HELP = [['R', 'Refresh news'], ['M', 'Market news'], ['B', 'Banks news'], ['S', 'Sectors news'], ['A', 'mAcro news'], ['T', 'sTocks news'], ['G', 'Global news'], ['1', 'Story panel'], ['2', 'Advice panel'], ['3', 'Global markets'], ['4', 'Heatmap'], ['5', 'MF / ETF'], ['6', 'Commodities'], ['7', 'Lock-in'], ['8', 'Sentiment / F&G'], ['/', 'Focus search'], ['Esc', 'Clear / close'], ['↑↓', 'Navigate headlines'], ['?', 'Toggle shortcut help']];
let helpVisible = false;
function toggleHelp() {
  helpVisible = !helpVisible; let el = document.getElementById('kb-help');
  if (!el) { el = document.createElement('div'); el.id = 'kb-help'; el.style.cssText = 'position:fixed;bottom:40px;right:20px;background:#0a0a18;border:1px solid #ff6600;border-radius:6px;padding:14px 18px;font-family:Courier New,monospace;font-size:13px;z-index:9999;min-width:220px;box-shadow:0 4px 20px rgba(0,0,0,0.8)'; document.body.appendChild(el); }
  if (!helpVisible) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `<div style="color:#ff6600;font-weight:bold;margin-bottom:10px;letter-spacing:1px">KEYBOARD SHORTCUTS</div>` + KEY_HELP.map(([k, v]) => `<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:5px"><span style="color:#e8dfc0;background:#1a1a2e;padding:1px 7px;border-radius:3px;min-width:30px;text-align:center">${k}</span><span style="color:#888">${v}</span></div>`).join('') + `<div style="color:#444;font-size:11px;margin-top:10px">Press ? to close</div>`;
}

document.addEventListener('keydown', e => {
  const tag = e.target.tagName; const inInput = tag === 'INPUT' || tag === 'TEXTAREA';
  if (e.key === 'Escape') { if (helpVisible) { toggleHelp(); return; } if (dalalFocusMode) { toggleDalalFocusMode(false); return; } const q = document.getElementById('q-input'); if (q && q.value) { q.value = ''; loadCategory(currentCat); return; } if (activeIdx >= 0) { clearDetail(); return; } const dd = document.getElementById('ticker-dropdown'); if (dd && dd.style.display !== 'none') { dd.style.display = 'none'; return; } return; }
  if (e.key === '?' && !inInput) { toggleHelp(); return; }
  if (inInput) return;
  const catMap = { m: 'market', b: 'banks', s: 'sectors', a: 'macro', t: 'stocks', g: 'global' };
  if (catMap[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) { loadCategory(catMap[e.key.toLowerCase()]); return; }
  if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) { refreshNews(); return; }
  // Updated panel shortcuts — 8 = Fear & Greed
  const rpMap = { '1': 'detail', '2': 'advice', '3': 'global', '4': 'heatmap', '5': 'mf', '6': 'commodities', '7': 'lockin', '8': 'feargreed' };
  if (rpMap[e.key]) { switchRP(rpMap[e.key]); return; }
  if (e.key === '/') { e.preventDefault(); document.getElementById('q-input')?.focus(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const len = currentStories.length; if (!len) return; if (e.key === 'ArrowDown') activeIdx = Math.min(activeIdx + 1, len - 1); else activeIdx = Math.max(activeIdx - 1, 0); showDetail(activeIdx); const items = document.querySelectorAll('.nl'); if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: 'nearest' }); return; }
});

function applyBridgeLaunchState() {
  const params = new URLSearchParams(window.location.search); if (!params.toString()) return;
  const nextCat = (params.get('cat') || '').trim().toLowerCase(); const nextRP = (params.get('rp') || '').trim().toLowerCase(); const nextPulse = (params.get('pulse') || '').trim().toLowerCase(); const focusMode = params.get('focus');
  const validCats = new Set(['market', 'banks', 'sectors', 'macro', 'stocks', 'global']); const validRPs = new Set(['detail', 'advice', 'global', 'heatmap', 'mf', 'commodities', 'lockin', 'feargreed']);
  if (validCats.has(nextCat)) loadCategory(nextCat, { fetchNews: false });
  if (validRPs.has(nextRP)) switchRP(nextRP, { fetchAdviceOnOpen: false });
  if (BRIDGE_PRESETS[nextPulse]) setDalalPulseMode(nextPulse);
  // FIX: Don't auto-enable focus mode from URL params
  // if(focusMode==='terminal'&&!dalalFocusMode){ dalalFocusMode=true; localStorage.setItem('dw-focus-mode',JSON.stringify(dalalFocusMode)); }
  if (params.get('bridge') || nextCat || nextRP || nextPulse) { const cleanUrl = window.location.pathname + window.location.hash; window.history.replaceState({}, '', cleanUrl); }
}

// ── INIT ──
let bootSplashDismissed = false;
function dismissBootSplash() {
  if (bootSplashDismissed) return;
  bootSplashDismissed = true;
  const splash = document.getElementById('boot-splash');
  if (!splash) return;
  splash.style.transition = 'opacity .16s ease';
  splash.style.opacity = '0';
  splash.style.pointerEvents = 'none';
  setTimeout(() => splash.remove(), 180);
}

restoreLayout();
setTimeout(dismissBootSplash, 300);
applyBridgeLaunchState();
applyDalalFocusMode();
if (!dalalFocusMode) { initFinanceBridgeGraph(); initFinanceBridgeMotion(); }

renderMiniMacroCharts();
renderEarnings();

let indicesFastFetching = false; let dashboardSlowFetching = false; let dashFetching = false; let refreshCountdown = 10;
const DASHBOARD_HEALTH_KEYS = ['NIFTY:NSE', 'SENSEX:BSE', 'BANKNIFTY:NSE', 'USD/INR:Forex', 'WTI:Commodity'];

function getDashboardHealth(quotes = {}) {
  const keys = DASHBOARD_HEALTH_KEYS.filter((key) => quotes[key]);
  if (!keys.length) return { fullFallback: false, partialFallback: false, staleCount: 0, total: 0 };
  const staleCount = keys.filter((key) => quotes[key]?.stale).length;
  return {
    fullFallback: staleCount === keys.length,
    partialFallback: staleCount > 0 && staleCount < keys.length,
    staleCount,
    total: keys.length
  };
}

function applyDashboardHealthLabel(quotes = {}) {
  const lu = document.getElementById('last-updated');
  if (!lu) return;
  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  const health = getDashboardHealth(quotes);
  const label = health.fullFallback ? 'FALLBACK ' : health.partialFallback ? 'PARTIAL ' : 'UPDATED ';
  lu.textContent = label + now + ' IST';
  lu.style.color = health.fullFallback ? '#ff9900' : health.partialFallback ? '#d7b36b' : '#7fd5ff';
}

function scheduleDashboardSlowLoad(delay = 180) {
  if (slowBootScheduled || dashboardSlowFetching) return;
  slowBootScheduled = true;
  setTimeout(() => {
    slowBootScheduled = false;
    fetchDashboardSlowData();
  }, delay);
}

async function fetchIndicesFastData() {
  if (indicesFastFetching) return; indicesFastFetching = true;
  if (indicesFastController) {
    try { indicesFastController.abort(); } catch {}
  }
  const controller = new AbortController();
  indicesFastController = controller;
  try {
    const res = await fetch('/api/indices-fast', { signal: controller.signal }); if (!res.ok) throw new Error('HTTP ' + res.status);
    const fast = await res.json();
    dismissBootSplash();
    const quotes = fast?.indices || {};
    sectionLoadState.indices = 'ready';
    dashStore = {
      ...(dashStore || {}),
      quotes: { ...(dashStore?.quotes || {}), ...quotes },
      fastTs: fast?.ts || new Date().toISOString()
    };
    processLivePrices(quotes);
    // FIX: Don't pass dashStore.global to processGlobal — it has lowercase keys
    // processGlobal is only called from fetchGlobal() which uses /api/global directly
    renderApp();
    applyDashboardHealthLabel(dashStore.quotes || {});
    if (!dalalFocusMode) refreshFinanceBridge();
    scheduleDashboardSlowLoad();
  } catch (e) {
    if (e.name === 'AbortError') return;
    dismissBootSplash();
    sectionLoadState.indices = 'error';
    console.error('Fast indices error:', e);
    const lu = document.getElementById('last-updated'); if (lu) { lu.textContent = 'ERROR'; lu.style.color = '#ff4444'; }
  } finally {
    if (indicesFastController === controller) indicesFastController = null;
    indicesFastFetching = false; refreshCountdown = 10; const sr = document.getElementById('sb-refresh'); if (sr) { sr.textContent = 'REFRESH IN 10s'; sr.style.color = '#444'; }
  }
}

async function fetchDashboardSlowData() {
  if (dashboardSlowFetching) return;
  dashboardSlowFetching = true;
  if (dashboardSlowController) {
    try { dashboardSlowController.abort(); } catch {}
  }
  const controller = new AbortController();
  dashboardSlowController = controller;
  try {
    const res = await fetch('/api/dashboard-slow', { signal: controller.signal }); if (!res.ok) throw new Error('HTTP ' + res.status);
    const slow = await res.json();
    sectionLoadState.slow = 'ready';
    dashStore = {
      ...(dashStore || {}),
      fiiDii: slow?.fiiDii || dashStore?.fiiDii || null,
      sentiment: slow?.sentiment || dashStore?.sentiment || null,
      global: {
        ...(dashStore?.global || {}),
        indiaVix: slow?.vix?.spot || dashStore?.global?.indiaVix || null,
        dxy: slow?.macro?.dxy || dashStore?.global?.dxy || null,
        vix: slow?.macro?.vix || dashStore?.global?.vix || null
      },
      ticker: {
        ...(dashStore?.ticker || {}),
        usdinr: slow?.macro?.usdinr || dashStore?.ticker?.usdinr || null,
        gold: slow?.macro?.gold || dashStore?.ticker?.gold || null,
        crude: slow?.macro?.crude || dashStore?.ticker?.crude || null,
        gsec: slow?.macro?.gsec || dashStore?.ticker?.gsec || null
      },
      series: {
        ...(dashStore?.series || {}),
        indiaVix: Array.isArray(slow?.vix?.series) ? slow.vix.series : (dashStore?.series?.indiaVix || []),
        vixDaily: Array.isArray(slow?.vix?.series) ? slow.vix.series : (dashStore?.series?.vixDaily || []),
        gsecDaily: Array.isArray(slow?.macro?.gsecDaily) ? slow.macro.gsecDaily : (dashStore?.series?.gsecDaily || [])
      },
      slowTs: slow?.ts || new Date().toISOString()
    };
    const macroQuotes = {};
    if (slow?.macro?.usdinr) macroQuotes['USD/INR:Forex'] = slow.macro.usdinr;
    if (slow?.macro?.gold) macroQuotes['XAU/USD:Forex'] = slow.macro.gold;
    if (slow?.macro?.crude) macroQuotes['WTI:Commodity'] = slow.macro.crude;
    if (slow?.macro?.gsec) macroQuotes['IN10Y:Bond'] = slow.macro.gsec;
    if (Object.keys(macroQuotes).length) {
      dashStore.quotes = { ...(dashStore?.quotes || {}), ...macroQuotes };
      processLivePrices(macroQuotes);
    }
    processFiiDii(slow?.fiiDii || null);
    processMiniVix({
      vix: slow?.vix?.series,
      gsec: slow?.macro?.gsecDaily,
      spot: { vix: slow?.vix?.spot?.price, gsec: slow?.macro?.gsec?.price },
      meta: { vix: slow?.vix?.status, gsec: { tag: 'DELAYED 15M', source: 'Yahoo Finance India 10Y' } }
    });
    renderApp();
    if (!dalalFocusMode) refreshFinanceBridge();
    if (currentRP === 'global' && !globalData) fetchGlobal();
  } catch (e) {
    if (e.name === 'AbortError') return;
    sectionLoadState.slow = 'error';
    console.error('Slow dashboard error:', e);
  } finally {
    if (dashboardSlowController === controller) dashboardSlowController = null;
    dashboardSlowFetching = false;
  }
}

function manualRefresh() { refreshCountdown = 10; const el = document.getElementById('sb-refresh'); el.innerHTML = '<span class="spin" style="display:inline-block;margin-right:4px">↻</span>REFRESHING...'; el.style.color = '#ff6600'; fetchDashboardData(); }

function fetchDashboardData() { return fetchIndicesFastData(); }

manualRefresh = function () {
  refreshCountdown = 10;
  const el = document.getElementById('sb-refresh');
  if (el) {
    el.innerHTML = '<span class="spin" style="display:inline-block;margin-right:4px">↻</span>REFRESHING...';
    el.style.color = '#ff6600';
  }
  fetchIndicesFastData();
  scheduleDashboardSlowLoad(120);
}

setHeadlinesEmptyState('Choose a category', 'News loads on demand. Open a category or search when needed.');
renderApp();
renderHeadlines(true);
fetchIndicesFastData();
requestAnimationFrame(() => setTimeout(() => {
  isStartupBoot = false;
}, 0));
setInterval(() => {
  refreshCountdown--;
  const el = document.getElementById('sb-refresh');
  if (refreshCountdown <= 0) { refreshCountdown = 10; el.innerHTML = '<span class="spin" style="display:inline-block;margin-right:4px">↻</span>REFRESHING...'; el.style.color = '#ff6600'; fetchDashboardData(); }
  else { el.innerHTML = `<span style="display:inline-block;margin-right:4px">↻</span>REFRESH IN ${refreshCountdown}s`; el.style.color = refreshCountdown <= 3 ? '#ff9900' : '#444'; }
}, 1000);
setInterval(() => { fetchDashboardSlowData(); }, 60000);
