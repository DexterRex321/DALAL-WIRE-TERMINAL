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
window.fetch = async function (...args) {
  const url = args[0];
  const isApi = typeof url === 'string' && url.includes('/api/') && !url.includes('/api/auth/session');
  
  if (isApi) {
    const token = await getDalalToken();
    const options = args[1] || {};
    options.headers = { ...(options.headers || {}), 'x-dalal-token': token };
    args[1] = options;
  }
  
  let result = await originalFetch.apply(window, args);
  
  if (isApi && result.status === 401) {
    dToken = null;
    const newToken = await getDalalToken();
    const options = args[1] || {};
    options.headers = { ...(options.headers || {}), 'x-dalal-token': newToken };
    args[1] = options;
    result = await originalFetch.apply(window, args);
  }
  
  return result;
};

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Request timed out. Try refresh.');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

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
  applyMacroContextBadges();
}

function applyMacroContextBadges() {
  if (!macroContext?.cards) return;
  document.querySelectorAll('#macro-list .macro-row').forEach((row, i) => {
    const item = sidebarMacro[i];
    const card = item ? macroContext.cards[item.key] : null;
    if (!card) return;
    let badge = row.querySelector('.macro-implication-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'macro-implication-badge';
      row.appendChild(badge);
    }
    badge.textContent = card.badge;
    badge.title = card.implication;
    badge.className = 'macro-implication-badge ' + (card.signal === 'tailwind' ? 'is-tailwind' : card.signal === 'headwind' ? 'is-headwind' : 'is-neutral');
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
      { sym: 'LT:NSE', label: 'L&T', weight: 3.7, sector: 'Industrials', pe: 34.8, industryPe: 28.4, debtToEquity: 1.21 },
      { sym: 'AXISBANK:NSE', label: 'Axis Bank', weight: 3.2, sector: 'Financials', pe: 14.1, industryPe: 16.9, debtToEquity: 7.4 },
      { sym: 'KOTAKBANK:NSE', label: 'Kotak Bank', weight: 2.9, sector: 'Financials', pe: 20.7, industryPe: 16.9, debtToEquity: 5.9 },
      { sym: 'ITC:NSE', label: 'ITC', weight: 4.1, sector: 'FMCG', pe: 26.3, industryPe: 32.1, debtToEquity: 0 },
      { sym: 'HINDUNILVR:NSE', label: 'HUL', weight: 2.8, sector: 'FMCG', pe: 54.2, industryPe: 32.1, debtToEquity: 0.03 },
      { sym: 'BAJFINANCE:NSE', label: 'Bajaj Finance', weight: 2.4, sector: 'Financials', pe: 28.4, industryPe: 22.1, debtToEquity: 3.8 },
      { sym: 'MARUTI:NSE', label: 'Maruti', weight: 1.6, sector: 'Auto', pe: 28.2, industryPe: 24.1, debtToEquity: 0.01 },
      { sym: 'SUNPHARMA:NSE', label: 'Sun Pharma', weight: 1.4, sector: 'Pharma', pe: 32.1, industryPe: 28.4, debtToEquity: 0.02 },
      { sym: 'ASIANPAINT:NSE', label: 'Asian Paints', weight: 1.6, sector: 'Consumer', pe: 64.2, industryPe: 42.1, debtToEquity: 0.12 },
      { sym: 'TITAN:NSE', label: 'Titan', weight: 1.4, sector: 'Consumer', pe: 82.1, industryPe: 42.1, debtToEquity: 0.28 },
      { sym: 'ADANIENT:NSE', label: 'Adani Ent', weight: 1.2, sector: 'Agglomerate', pe: 98.4, industryPe: 42.1, debtToEquity: 0.84 },
      { sym: 'TATAMOTORS:NSE', label: 'Tata Motors', weight: 1.1, sector: 'Auto', pe: 11.2, industryPe: 24.1, debtToEquity: 1.12 },
      { sym: 'TATASTEEL:NSE', label: 'Tata Steel', weight: 1.1, sector: 'Metals', pe: 14.8, industryPe: 12.1, debtToEquity: 0.94 }
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
      { sym: 'SBIN:NSE', label: 'SBI', weight: 3.2, sector: 'Financials', pe: 10.4, industryPe: 16.9, debtToEquity: 12.6 },
      { sym: 'LT:NSE', label: 'L&T', weight: 4.2, sector: 'Industrials', pe: 34.8, industryPe: 28.4, debtToEquity: 1.21 },
      { sym: 'ITC:NSE', label: 'ITC', weight: 4.8, sector: 'FMCG', pe: 26.3, industryPe: 32.1, debtToEquity: 0 },
      { sym: 'AXISBANK:NSE', label: 'Axis Bank', weight: 3.8, sector: 'Financials', pe: 14.1, industryPe: 16.9, debtToEquity: 7.4 },
      { sym: 'KOTAKBANK:NSE', label: 'Kotak Bank', weight: 3.4, sector: 'Financials', pe: 20.7, industryPe: 16.9, debtToEquity: 5.9 }
    ]
  },
  'BANKNIFTY:NSE': {
    label: 'Bank Nifty',
    code: 'LEVEL 1 · INDICES',
    note: 'Concentrated banking benchmark. Track weights before reading sector momentum.',
    constituents: [
      { sym: 'HDFCBANK:NSE', label: 'HDFC Bank', weight: 29.1, sector: 'Private Bank', pe: 18.4, industryPe: 16.9, debtToEquity: 6.8 },
      { sym: 'ICICIBANK:NSE', label: 'ICICI Bank', weight: 24.2, sector: 'Private Bank', pe: 17.8, industryPe: 16.9, debtToEquity: 7.1 },
      { sym: 'SBIN:NSE', label: 'SBI', weight: 11.2, sector: 'PSU Bank', pe: 10.4, industryPe: 16.9, debtToEquity: 12.6 },
      { sym: 'KOTAKBANK:NSE', label: 'Kotak Bank', weight: 8.2, sector: 'Private Bank', pe: 20.7, industryPe: 16.9, debtToEquity: 5.9 },
      { sym: 'AXISBANK:NSE', label: 'Axis Bank', weight: 7.9, sector: 'Private Bank', pe: 14.1, industryPe: 16.9, debtToEquity: 7.4 },
      { sym: 'INDUSINDBK:NSE', label: 'IndusInd Bank', weight: 4.1, sector: 'Private Bank', pe: 11.2, industryPe: 16.9, debtToEquity: 8.8 },
      { sym: 'AUFIL:NSE', label: 'AU Small Fin', weight: 1.8, sector: 'SFB', pe: 32.4, industryPe: 16.9, debtToEquity: 6.2 },
      { sym: 'IDFCFIRSTB:NSE', label: 'IDFC First', weight: 1.6, sector: 'Private Bank', pe: 18.2, industryPe: 16.9, debtToEquity: 7.4 },
      { sym: 'FEDERALBNK:NSE', label: 'Federal Bank', weight: 2.1, sector: 'Private Bank', pe: 9.8, industryPe: 16.9, debtToEquity: 8.1 },
      { sym: 'PNB:NSE', label: 'PNB', weight: 1.4, sector: 'PSU Bank', pe: 14.2, industryPe: 16.9, debtToEquity: 14.2 },
      { sym: 'BANKBARODA:NSE', label: 'Bank of Baroda', weight: 1.8, sector: 'PSU Bank', pe: 7.1, industryPe: 16.9, debtToEquity: 13.8 },
      { sym: 'BANDHANBNK:NSE', label: 'Bandhan Bank', weight: 1.1, sector: 'Private Bank', pe: 12.4, industryPe: 16.9, debtToEquity: 5.1 }
    ]
  }
};

const STOCK_STATIC_DATA = Object.values(INDEX_VIEW_CONFIG).flatMap(index => index.constituents).reduce((acc, stock) => {
  if (!acc[stock.sym]) acc[stock.sym] = { ...stock };
  return acc;
}, {});

let macroContext = null;

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
let compareState = { a: 'FII', b: 'NIFTY', data: null, fetching: false };
let compareInitialized = false;
let sopState = { sliders: { horizon: 50, signal: 50, risk: 50 }, data: null, lastFetch: 0, profile: null };
let sopDeltaState = { history: null, snapshot: null, deltas: null, lastFetch: 0 };
let fastRefreshTimer = null;
let slowRefreshTimer = null;
let countdownTimer = null;
let compareResizeObserver = null;
let compareLastWidth = 0;
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
// FIX: isStartupBoot starts true, only init() sets it false
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
  renderPulse();
  if (currentRP === 'sop' && !sopState.data) renderSopLoadingSkeleton();
  renderExplorerModal();
}

function renderPulse() {
  const root = getExplorerRoot(); if (!root) return;
  let html = `
    <div class="pulse-container">
      <div class="pulse-header">
        <div class="pulse-title">MARKET PULSE</div>
        <div class="pulse-subtitle">Live intra-day snapshot and trend analysis</div>
      </div>
      <div class="pulse-grid">
        <div class="pulse-card">
          <div class="pulse-card-label">INTRA-DAY BIAS</div>
          <div id="pulse-bias" class="pulse-card-value">NEUTRAL</div>
        </div>
        <div class="pulse-card">
          <div class="pulse-card-label">VOLATILITY (VIX)</div>
          <div id="pulse-vix" class="pulse-card-value">--</div>
        </div>
        <div class="pulse-card">
          <div class="pulse-card-label">ADV/DEC RATIO</div>
          <div id="pulse-breadth" class="pulse-card-value">--</div>
        </div>
      </div>
      <div class="pulse-section-title">GLOBAL CONTEXT</div>
      <div id="pulse-global-list" class="pulse-mini-list">
        <div class="pulse-loading">Loading global feeds...</div>
      </div>
      <div class="pulse-footer">
        Select a news story for deep-dive analysis or use the tabs above for specialized data modules.
      </div>
    </div>
  `;
  root.innerHTML = html;
  hydratePulseData();
}

async function hydratePulseData() {
  const vixEl = document.getElementById('pulse-vix');
  const globalList = document.getElementById('pulse-global-list');
  if (vixEl) {
    const v = document.getElementById('mini-vix-val')?.textContent || '--';
    vixEl.textContent = v;
  }
  if (globalList) {
    if (!globalData) {
      if (!globalFetching) fetchGlobal();
      globalList.innerHTML = '<div class="pulse-loading">Fetching global feeds...</div>';
      return;
    }
    const items = ['DXY', 'US10Y', 'GOLD', 'CRUDE', 'SP500'];
    let gHtml = '';
    items.forEach(k => {
      const d = globalData[k];
      if (d) {
        const pct = d.percent_change || 0;
        const cls = pct > 0 ? 'up' : pct < 0 ? 'dn' : '';
        const sign = pct >= 0 ? '+' : '';
        gHtml += `<div class="pulse-mini-item"><span>${k}</span><b class="${cls}">${(d.price||0).toFixed(2)} (${sign}${pct.toFixed(2)}%)</b></div>`;
      }
    });
    globalList.innerHTML = gHtml || '<div class="pulse-empty">No global data available</div>';
  }
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
  return `<section class="state-modal-card state-modal-card-index" onclick="event.stopPropagation()">
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
      <div class="state-panel-copy">${modalLoadState.constituentsReady ? 'Click any row to open stock detail.' : 'Loading constituent structure…'}</div>
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
    ? `<div class="state-stock-grid">${Array.from({ length: 4 }, () => `<div class="state-metric state-metric-skeleton"><span class="section-skeleton-line section-skeleton-line-short"></span><span class="section-skeleton-line"></span></div>`).join('')}</div>`
    : `<div class="state-stock-grid">
        <div class="state-metric"><span>Price</span><strong>${price}</strong></div>
        <div class="state-metric"><span>Change %</span><strong class="${change.cls}">${change.txt}</strong></div>
        <div class="state-metric"><span>Volume</span><strong>${volume}</strong></div>
        <div class="state-metric"><span>Market Cap</span><strong>${marketCap}</strong></div>
      </div>`;
  return `<section class="state-modal-card state-modal-card-stock" onclick="event.stopPropagation()">
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
function openIndexDetail(indexKey) { if (!INDEX_VIEW_CONFIG[indexKey]) return; activeIdx = -1; switchRP('detail'); modalLoadState.constituentsReady = false; setState({ view: 'indexDetail', selectedIndex: indexKey, selectedStock: null }); queueConstituentModalHydration(indexKey); }
function openStockDetail(symbol) { if (!findStockMeta(symbol)) return; activeIdx = -1; switchRP('detail'); setState({ view: 'stockDetail', selectedStock: symbol }); fetchStockDetail(symbol); }
function goToIndexDetail() { if (appState.selectedIndex && INDEX_VIEW_CONFIG[appState.selectedIndex]) { activeIdx = -1; modalLoadState.constituentsReady = false; setState({ view: 'indexDetail', selectedStock: null }); queueConstituentModalHydration(appState.selectedIndex); return; } goToIndicesView(); }
window.goToIndicesView = goToIndicesView;
window.openIndexDetail = openIndexDetail;
window.openStockDetail = openStockDetail;
window.goToIndexDetail = goToIndexDetail;
window.closeModal = closeModal;
window.handleModalBackdropClick = handleModalBackdropClick;

// ── GLOBAL DATA STORE ──
let globalData = null;
let globalFetching = false;
let updateArrowVisibility = null;

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

// ── RIGHT PANEL — FIXED switchRP ──────────────────────────────
function switchRP(tab, options = {}) {
  const fetchAdviceOnOpen = options.fetchAdviceOnOpen ?? !isStartupBoot;
  currentRP = tab;

  // FIX: Update tab active state using data-rp attribute
  document.querySelectorAll('.rp-tab').forEach(t => {
    const rp = t.dataset.rp || '';
    t.classList.toggle('active-rp-tab', rp === tab);
  });
  const activeTab = document.querySelector('.rp-tab.active-rp-tab');
  if (activeTab) {
    activeTab.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });
  }
  setTimeout(() => {
    if (updateArrowVisibility) updateArrowVisibility();
  }, 400);

  // Update visible right-panel module.
  const panels = ['rp-story', 'rp-advice', 'rp-global', 'rp-heatmap', 'rp-mf', 'rp-commodities', 'rp-lockin', 'rp-feargreed', 'rp-sop', 'rp-compare', 'rp-events'];
  panels.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Map public tab keys to panel ids.
  const panelMap = {
    detail: 'rp-story',
    advice: 'rp-advice',
    global: 'rp-global',
    heatmap: 'rp-heatmap',
    mf: 'rp-mf',
    commodities: 'rp-commodities',
    lockin: 'rp-lockin',
    feargreed: 'rp-feargreed',
    sop: 'rp-sop',
    compare: 'rp-compare',
    events: 'rp-events'
  };

  const activePanel = document.getElementById(panelMap[tab]);
  if (activePanel) activePanel.style.display = 'block';

  // FIX: Only hydrate pulse when story panel is active AND no story is open
  if (tab === 'detail' && activeIdx < 0) hydratePulseData();

  if (tab === 'global') fetchGlobal();
  if (tab === 'heatmap') fetchHeatmap();
  if (tab === 'mf') fetchMF();
  if (tab === 'commodities') fetchCommodities();
  if (tab === 'lockin') fetchLockin();
  if (tab === 'advice' && fetchAdviceOnOpen) updateAdviceForTicker(currentTicker);
  if (tab === 'feargreed') fetchFearGreed();
  if (tab === 'sop') {
    initSopControls();
    if (!sopState.data || Date.now() - sopState.lastFetch > 60_000) fetchSOPData();
    else renderSOP();
  }
  if (tab === 'compare') {
    restoreComparePair();
    if (!compareInitialized) initCompareSelects();
    initCompareResizeObserver();
    const aSel = document.getElementById('cmp-a'); if (aSel) aSel.value = compareState.a;
    const bSel = document.getElementById('cmp-b'); if (bSel) bSel.value = compareState.b;
    initCompareQuickPairs();
    if (!compareState.data) runCompare();
    else renderCompare(compareState.data);
  }
  if (tab === 'events') {
    if (!eventsState.data) fetchEvents();
    else renderEventsPanel();
  }

  saveLayout();
}

// ── GLOBAL FETCH ──
async function fetchGlobal() {
  if (globalFetching) return;
  globalFetching = true;
  try {
    const data = await fetch('/api/global').then(r => r.json());
    globalData = data;
    renderGlobal(globalData);
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
    const glUp = document.getElementById('gl-updated');
    if (glUp) glUp.textContent = 'Updated ' + now + ' IST';
    if (currentRP === 'detail' && activeIdx < 0) hydratePulseData();
  } catch (e) {
    const el = document.getElementById('gl-content');
    if (el) el.innerHTML = `<div style="color:#ff4444;font-size:13px;padding:20px">Error: ${e.message}</div>`;
  } finally {
    globalFetching = false;
  }
}

function forceGlobal() { globalData = null; fetchGlobal(); }

function applyTicker() {
  const v = document.getElementById('rp-ticker').value.trim().toUpperCase(); if (!v) return;
  currentTicker = v;
  document.getElementById('rp-ticker').value = '';
  const al = document.getElementById('advice-ticker-label'); if (al) al.textContent = 'LIVE SIGNAL - ' + v;
  updateAdviceForTicker(v);
  switchRP('advice');
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
    if (badge) { badge.textContent = stance; badge.className = 'status-badge ' + (cls === 'bull' ? 'status-up' : cls === 'bear' ? 'status-dn' : 'status-neutral'); badge.style.cssText = ''; }
    if (text && hasRealData) {
      const l = d?.levels || {};
      text.textContent = `${d?.message || ''} ${key} at ${Number(m.price).toFixed(2)}.`;
      const dynamic = document.getElementById('advice-dynamic-content');
      if (dynamic) {
        let html = '';
        if (l.support || l.resistance) {
          html += `<div class="adv-section" style="font-size:10px;font-weight:700;color:var(--orange);letter-spacing:1px;margin-bottom:12px;border-bottom:1px solid var(--line);padding-bottom:4px;">KEY TECHNICAL LEVELS</div>
          <div class="adv-levels-grid" style="display:grid;gap:1px;background:var(--line);border:1px solid var(--line);margin-bottom:20px;">
            <div style="background:var(--bg2);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:9px;color:var(--muted);font-weight:700;">RESISTANCE 2</span><b style="font-size:13px;color:var(--text);font-variant-numeric:tabular-nums;">${l.resistance2 || '--'}</b><span class="status-badge status-dn" style="font-size:8px;">SELL</span></div>
            <div style="background:var(--bg2);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:9px;color:var(--muted);font-weight:700;">RESISTANCE 1</span><b style="font-size:13px;color:var(--text);font-variant-numeric:tabular-nums;">${l.resistance || '--'}</b><span class="status-badge status-neutral" style="font-size:8px;">WATCH</span></div>
            <div style="background:var(--bg1);padding:12px 14px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:9px;color:var(--orange);font-weight:700;">CURRENT SPOT</span><b style="font-size:16px;color:var(--text);font-variant-numeric:tabular-nums;">${Number(m.price).toFixed(0)}</b><span class="status-badge status-neutral" style="font-size:8px;background:var(--line2);">HERE</span></div>
            <div style="background:var(--bg2);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:9px;color:var(--muted);font-weight:700;">SUPPORT 1</span><b style="font-size:13px;color:var(--text);font-variant-numeric:tabular-nums;">${l.support || '--'}</b><span class="status-badge status-up" style="font-size:8px;">BUY</span></div>
            <div style="background:var(--bg2);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:9px;color:var(--muted);font-weight:700;">SUPPORT 2</span><b style="font-size:13px;color:var(--text);font-variant-numeric:tabular-nums;">${l.support2 || '--'}</b><span class="status-badge status-up" style="font-size:8px;">STRONG</span></div>
          </div>`;
        }
        html += `<div class="adv-section" style="font-size:10px;font-weight:700;color:var(--orange);letter-spacing:1px;margin-bottom:12px;border-bottom:1px solid var(--line);padding-bottom:4px;">ANALYST CONTEXT</div>
        <div style="display:flex;flex-direction:column;gap:1px;background:var(--line);border:1px solid var(--line);">
          <div style="background:var(--bg2);padding:14px;"><div style="font-size:10px;color:var(--muted);font-weight:700;margin-bottom:6px;text-transform:uppercase;">Institutional Intelligence</div><p style="font-size:12px;color:var(--text);line-height:1.5;margin:0;">${stance === 'BULLISH' ? 'Accumulate on dips. Institutional flow indicates strong underlying demand near support zones.' : stance === 'BEARISH' ? 'Maintain cautious stance. Overhead supply likely to cap rallies. Hedge long positions.' : 'Market in price discovery. Wait for consolidation breaks before committing size.'}</p></div>
        </div>`;
        dynamic.innerHTML = html;
      }
    } else if (text) { _patchAdviceFromDOM(key); }
  } catch { _patchAdviceFromDOM(key); }
}

function _patchAdviceFromDOM(key) {
  const text = document.getElementById('adv-stance-text'); const badge = document.getElementById('adv-stance-badge');
  const priceEl = document.getElementById('s-nifty'); const price = priceEl?.textContent?.trim() || '--';
  if (badge) { badge.textContent = 'WAITING'; badge.style.background = '#101626'; badge.style.color = '#9bb2c7'; badge.style.border = '1px solid #273448'; }
  if (text) text.textContent = `Live signal pending for ${key}. Price: ${price}. Click REFRESH.`;
}

// ── FEAR & GREED ──
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
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = size * 0.072; ctx.lineCap = 'round'; ctx.stroke();
  [{ from: 0, to: .25, c: '#e4545455' }, { from: .25, to: .45, c: '#ff8a3855' }, { from: .45, to: .55, c: '#c9a84c55' }, { from: .55, to: .75, c: '#5ec98a55' }, { from: .75, to: 1, c: '#00c98a55' }].forEach(z => {
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI + z.from * Math.PI, Math.PI + z.to * Math.PI);
    ctx.strokeStyle = z.c; ctx.lineWidth = size * 0.068; ctx.lineCap = 'butt'; ctx.stroke();
  });
  ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, scoreAngle);
  ctx.strokeStyle = 'var(--text)'; ctx.lineWidth = size * 0.072; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(scoreAngle) * r * .82, cy + Math.sin(scoreAngle) * r * .82);
  ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, size * .035, 0, Math.PI * 2); ctx.fillStyle = '#e0e0e0'; ctx.fill();
}

function renderSentimentLoading() {
  const panel = document.getElementById('rp-feargreed');
  if (!panel) return;
  panel.innerHTML = `<div class="section-loading-panel"><div class="section-loading-title">Sentiment</div><div class="section-skeleton-line" style="width:46%"></div></div>`;
}

async function fetchFearGreed() {
  const panel = document.getElementById('rp-feargreed');
  if (!panel) return;
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
  const gc = global ? fngColor(global.score) : 'var(--line2)';
  const ic = india ? fngColor(india.score) : 'var(--line2)';
  const gl = global ? fngLabel(global.score) : '--';
  const il = india ? fngLabel(india.score) : '--';
  const gs = global ? Math.round(global.score) : '--';
  const is_ = india ? Math.round(india.score) : '--';
  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  panel.innerHTML = `
  <div style="padding:16px; font-family:var(--mono);">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;border-bottom:1px solid var(--line);padding-bottom:10px;">
      <div style="color:var(--orange);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Sentiment Dual-Feed</div>
      <span style="color:var(--dim);font-size:9px;text-transform:uppercase;">LIVE · ${now}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);margin-bottom:20px;border:1px solid var(--line);">
      <div style="background:var(--bg2);padding:20px 10px;text-align:center;">
        <div style="font-size:9px;color:var(--muted);margin-bottom:16px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">INDIA COMPOSITE</div>
        <div style="position:relative;width:140px;height:80px;margin:0 auto;"><canvas id="fng-gauge-india" style="width:140px;height:80px;"></canvas><div style="position:absolute;bottom:0;left:0;right:0;font-size:24px;font-weight:800;color:var(--text);">${is_}</div></div>
        <div style="font-size:10px;color:var(--muted);margin-top:8px;font-weight:700;letter-spacing:0.5px;">${il.toUpperCase()}</div>
      </div>
      <div style="background:var(--bg2);padding:20px 10px;text-align:center;">
        <div style="font-size:9px;color:var(--muted);margin-bottom:16px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">GLOBAL US (CNN)</div>
        <div style="position:relative;width:140px;height:80px;margin:0 auto;"><canvas id="fng-gauge-global" style="width:140px;height:80px;"></canvas><div style="position:absolute;bottom:0;left:0;right:0;font-size:24px;font-weight:800;color:var(--text);">${gs}</div></div>
        <div style="font-size:10px;color:var(--muted);margin-top:8px;font-weight:700;letter-spacing:0.5px;">${gl.toUpperCase()}</div>
      </div>
    </div>
    <div style="border:1px solid var(--line);background:var(--bg1);">
      <div style="font-size:10px;color:var(--muted);background:var(--bg2);padding:10px;text-transform:uppercase;border-bottom:1px solid var(--line);font-weight:700;letter-spacing:1px;">Market Drivers</div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
        ${india?.components ? Object.entries(india.components).map(([k, comp]) => {
          const val = Number(comp.value); const cls = val > 0 ? 'status-up' : val < 0 ? 'status-dn' : 'status-neutral';
          return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;"><span style="color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${comp.label}</span><div class="status-badge ${cls}" style="font-size:9px;font-weight:700;min-width:60px;text-align:right;">${val >= 0 ? '+' : ''}${val.toFixed(2)}</div></div>`;
        }).join('') : `<div style="color:var(--dim);font-size:10px;text-align:center;padding:20px;">Awaiting driver telemetry...</div>`}
      </div>
    </div>
  </div>`;
  setTimeout(() => {
    if (global) drawFngGauge('fng-gauge-global', global.score, gc);
    if (india) drawFngGauge('fng-gauge-india', india.score, ic);
  }, 50);
}

// ── HEADLINES ──
function tagHtml(s) { return s === 'bull' ? '<span class="ntag t-bull">BULL</span>' : s === 'bear' ? '<span class="ntag t-bear">BEAR</span>' : '<span class="ntag t-watch">WATCH</span>'; }

function setHeadlinesEmptyState(title, detail = '') { headlinesEmptyState = { title, detail }; }

let newsWatchlistFilter = { active: false, symbols: [] };

function toggleNewsWatchlist() {
  newsWatchlistFilter.active = !newsWatchlistFilter.active;
  const btn = document.getElementById('news-watchlist-toggle');
  if (btn) {
    if (newsWatchlistFilter.active) btn.classList.add('active');
    else btn.classList.remove('active');
  }
  renderHeadlines(true);
}

function applyNewsIntelligence(stories) {
  if (!stories) return [];
  
  const defaultSyms = new Set(DEFAULT_INDICES.map(item => item.sym));
  newsWatchlistFilter.symbols = sidebarIndices
    .filter(item => !defaultSyms.has(item.sym))
    .map(item => item.sym.split(':')[0].toLowerCase());
    
  if (newsWatchlistFilter.active) {
     const watchSet = new Set(newsWatchlistFilter.symbols);
     const group1 = [];
     const group2 = [];
     
     stories.forEach(s => {
       let isMatch = false;
       if (s.entities) {
          isMatch = s.entities.some(e => watchSet.has(e.symbol.split(':')[0].toLowerCase()));
       }
       s.watchlistMatch = isMatch;
       if (isMatch) group1.push(s);
       else group2.push(s);
     });
     
     group1.sort((a, b) => (b.enrichedScore || 0) - (a.enrichedScore || 0));
     group2.sort((a, b) => (b.enrichedScore || 0) - (a.enrichedScore || 0));
     return [...group1, ...group2];
  } else {
     stories.forEach(s => s.watchlistMatch = false);
     return [...stories].sort((a, b) => (b.enrichedScore || 0) - (a.enrichedScore || 0));
  }
}

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
  
  currentStories = applyNewsIntelligence(currentStories);
  
  countEl.textContent = currentStories.length + ' STORIES';
  currentStories.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'nl' + (i === activeIdx ? ' active' : '') + (s.watchlistMatch ? ' watchlist-match' : '');
    const timeStr = s.pubDate ? new Date(s.pubDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }) + ' IST' : '';
    const srcStr = s.source ? `<span class="nl-src">${s.source}</span>` : '';
    
    let wlBadge = s.watchlistMatch ? `<span class="nl-watchlist-badge">★ WATCHLIST</span>` : '';
    
    let entitiesHtml = '';
    if (s.entities && s.entities.some(e => e.type === 'stock')) {
      entitiesHtml = `<div class="nl-entities">` + 
        s.entities.map(e => `<span class="nl-entity-tag type-${e.type}">${e.label}</span>`).join('') + 
        `</div>`;
    }
    
    d.innerHTML = `<div class="nl-meta">${tagHtml(s.sentiment)}${wlBadge}<span class="nl-time">${timeStr}</span></div><div class="nl-hl">${s.headline}</div>${entitiesHtml}${srcStr}`;
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
  switchRP('detail');
}

function clearDetail() { activeIdx = -1; renderHeadlines(); renderApp(); }

function loadCategory(cat, options = {}) {
  const shouldFetchNews = options.fetchNews !== false;
  const forceNews = options.forceNews ?? false;
  currentCat = cat; activeIdx = -1;
  document.getElementById('hl-label').textContent = cat.toUpperCase();
  renderApp();
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active-chip', c.textContent.toLowerCase() === cat));
  document.getElementById('sb-q').textContent = cat.toUpperCase() + ' — INDIA MARKET';
  if (shouldFetchNews) fetchLiveNews(cat, !forceNews);
  saveLayout();
}

const newsCache = {};
const NEWS_CLIENT_TTL = 5 * 60 * 1000;

async function fetchLiveNews(cat, useCache = true) {
  const cached = newsCache[cat]; const isFresh = cached && (Date.now() - cached.ts) < NEWS_CLIENT_TTL;
  if (useCache && isFresh) { currentStories = Array.isArray(cached.stories) ? cached.stories : []; sectionLoadState.news = 'ready'; setHeadlinesEmptyState('No cached live stories', 'Refresh the feed or try another category.'); renderHeadlines(true); renderApp(); return; }
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
    renderHeadlines(true); renderApp();
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
    const countEl = document.getElementById('hl-count');
    if (countEl) countEl.textContent = currentStories.length ? currentStories.length + ' STORIES · LIVE RSS · ' + now : '0 STORIES · LIVE RSS';
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.warn('Live news failed:', e.message);
    sectionLoadState.news = 'error';
    currentStories = []; setHeadlinesEmptyState('Live RSS unavailable', 'The current feed could not be loaded. Try refresh or switch categories.');
    renderHeadlines(true); renderApp();
    const countEl = document.getElementById('hl-count');
    if (countEl) countEl.textContent = 'LIVE RSS UNAVAILABLE';
  } finally {
    if (newsRequestController === controller) newsRequestController = null;
  }
}

function refreshNews() { clearTimeout(refreshNewsTimer); refreshNewsTimer = setTimeout(async () => { newsCache[currentCat] = null; try { await fetch('/api/news-refresh'); } catch (e) { } fetchLiveNews(currentCat, false); }, 120); }

function showNewsLoading() {
  sectionLoadState.news = 'loading';
  const list = document.getElementById('hl-list'); list.innerHTML = ''; 
  const countEl = document.getElementById('hl-count');
  if (countEl) countEl.textContent = 'LOADING...';
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
  if (Number.isFinite(vv)) setEl('mini-vix-val', vv.toFixed(2));
  if (Number.isFinite(gv)) setEl('mini-gsec-val', gv.toFixed(3) + '%');
  drawMiniSparkline('mini-vix-chart', miniVixSeries, '#ff9900', 'rgba(255,153,0,.14)');
  drawMiniSparkline('mini-gsec-chart', miniGsecSeries, '#7fd5ff', 'rgba(127,213,255,.12)');
}

// ── MARKET BREADTH BAR ──
const COMPARE_SERIES = {
  NIFTY: { label: 'Nifty 50', yahoo: '^NSEI', type: 'index', unit: 'pts' },
  SENSEX: { label: 'Sensex', yahoo: '^BSESN', type: 'index', unit: 'pts' },
  BANKNIFTY: { label: 'Bank Nifty', yahoo: '^NSEBANK', type: 'index', unit: 'pts' },
  INDIAVIX: { label: 'India VIX', yahoo: '^INDIAVIX', type: 'volatility', unit: '' },
  USDINR: { label: 'USD/INR', yahoo: 'INR=X', type: 'fx', unit: '₹' },
  GOLD: { label: 'Gold', yahoo: 'GC=F', type: 'commodity', unit: '$' },
  CRUDE: { label: 'Crude WTI', yahoo: 'CL=F', type: 'commodity', unit: '$' },
  GSEC: { label: '10Y G-Sec', yahoo: '^IN10YT=RR', type: 'bond', unit: '%' },
  DXY: { label: 'DXY Index', yahoo: 'DX-Y.NYB', type: 'fx', unit: '' },
  SP500: { label: 'S&P 500', yahoo: '^GSPC', type: 'index', unit: 'pts' },
  NASDAQ: { label: 'Nasdaq', yahoo: '^IXIC', type: 'index', unit: 'pts' },
  FII: { label: 'FII Net Flow', yahoo: null, type: 'flow', unit: '₹Cr' },
};

const COMPARE_QUICK_PAIRS = [
  { label: 'FII vs NIFTY', a: 'FII', b: 'NIFTY' },
  { label: 'VIX vs NIFTY', a: 'INDIAVIX', b: 'NIFTY' },
  { label: 'BANK vs NIFTY', a: 'BANKNIFTY', b: 'NIFTY' },
  { label: 'CRUDE vs INR', a: 'CRUDE', b: 'USDINR' },
  { label: 'GOLD vs DXY', a: 'GOLD', b: 'DXY' },
];

function restoreComparePair() {
  try {
    const saved = JSON.parse(localStorage.getItem('dw-compare-pair') || '{}');
    if (COMPARE_SERIES[saved.a] && COMPARE_SERIES[saved.b] && saved.a !== saved.b) {
      compareState.a = saved.a;
      compareState.b = saved.b;
    }
  } catch {}
}

function preventSameCompareSeries(changedId) {
  if (compareState.a !== compareState.b) return;
  const keys = Object.keys(COMPARE_SERIES);
  const next = keys.find(key => key !== (changedId === 'cmp-a' ? compareState.b : compareState.a));
  if (changedId === 'cmp-a') compareState.a = next;
  else compareState.b = next;
  const aSel = document.getElementById('cmp-a'); if (aSel) aSel.value = compareState.a;
  const bSel = document.getElementById('cmp-b'); if (bSel) bSel.value = compareState.b;
}

function initCompareSelects() {
  const opts = Object.entries(COMPARE_SERIES).map(([key, item]) => `<option value="${key}">${item.label}</option>`).join('');
  const aSel = document.getElementById('cmp-a');
  const bSel = document.getElementById('cmp-b');
  if (!aSel || !bSel) return;
  aSel.innerHTML = opts;
  bSel.innerHTML = opts;
  aSel.value = compareState.a;
  bSel.value = compareState.b;
  aSel.addEventListener('change', () => {
    compareState.a = aSel.value;
    preventSameCompareSeries('cmp-a');
    initCompareQuickPairs();
  });
  bSel.addEventListener('change', () => {
    compareState.b = bSel.value;
    preventSameCompareSeries('cmp-b');
    initCompareQuickPairs();
  });
  compareInitialized = true;
}

function initCompareQuickPairs() {
  const root = document.getElementById('compare-quick-pairs');
  if (!root) return;
  root.innerHTML = COMPARE_QUICK_PAIRS.map(pair => {
    const active = pair.a === compareState.a && pair.b === compareState.b ? ' active' : '';
    return `<button class="compare-chip${active}" type="button" data-a="${pair.a}" data-b="${pair.b}">${pair.label}</button>`;
  }).join('');
  root.querySelectorAll('.compare-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      compareState.a = chip.dataset.a;
      compareState.b = chip.dataset.b;
      const aSel = document.getElementById('cmp-a'); if (aSel) aSel.value = compareState.a;
      const bSel = document.getElementById('cmp-b'); if (bSel) bSel.value = compareState.b;
      initCompareQuickPairs();
      runCompare();
    });
  });
}

function compareFmt(value, item) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  const prefix = item.unit === '₹' || item.unit === '$' ? item.unit : '';
  const suffix = item.unit && item.unit !== '₹' && item.unit !== '$' ? ' ' + item.unit : '';
  return prefix + n.toLocaleString('en-IN', { maximumFractionDigits: item.type === 'flow' ? 0 : 2 }) + suffix;
}

function setCompareLoading(message = 'Loading comparison...') {
  const chart = document.getElementById('compare-chart');
  if (chart) chart.innerHTML = `<div class="compare-loading">${message}</div>`;
}

function initCompareResizeObserver() {
  const panel = document.getElementById('rp-compare');
  if (!panel || compareResizeObserver || typeof ResizeObserver === 'undefined') return;
  compareLastWidth = panel.clientWidth || 0;
  compareResizeObserver = new ResizeObserver(entries => {
    const width = entries[0]?.contentRect?.width || 0;
    if (!width || Math.abs(width - compareLastWidth) <= 20) return;
    compareLastWidth = width;
    if (compareState.data) renderCompare(compareState.data);
  });
  compareResizeObserver.observe(panel);
}

async function runCompare() {
  const aSel = document.getElementById('cmp-a');
  const bSel = document.getElementById('cmp-b');
  if (aSel) compareState.a = aSel.value;
  if (bSel) compareState.b = bSel.value;
  preventSameCompareSeries('cmp-b');
  compareState.fetching = true;
  setCompareLoading();
  const interp = document.getElementById('compare-interpretation');
  if (interp) { interp.textContent = 'Reading cross-market relationship...'; interp.style.borderLeftColor = 'var(--gold, #ffbf3d)'; interp.style.background = 'rgba(255,191,61,.08)'; }
  try {
    const url = `/api/compare?a=${encodeURIComponent(compareState.a)}&b=${encodeURIComponent(compareState.b)}`;
    const data = await fetchJsonWithTimeout(url, {}, 15000);
    compareState.data = data;
    localStorage.setItem('dw-compare-pair', JSON.stringify({ a: compareState.a, b: compareState.b }));
    initCompareQuickPairs();
    renderCompare(data);
  } catch (e) {
    if (interp) { interp.textContent = e.message; interp.style.borderLeftColor = 'var(--red)'; interp.style.background = 'rgba(255,51,51,.08)'; }
  } finally {
    compareState.fetching = false;
  }
}
window.runCompare = runCompare;

function drawCompareChart(data) {
  const chart = document.getElementById('compare-chart');
  if (!chart) return;
  chart.innerHTML = `<div class="compare-chart-head"><span class="compare-axis-label">${data.a.label}</span><span class="compare-axis-label">${data.b.label}</span></div><canvas id="compare-canvas" class="compare-dual-canvas" height="160"></canvas>`;
  const canvas = document.getElementById('compare-canvas');
  const rows = data.aligned || [];
  if (!canvas || !rows.length) return;
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(300, chart.clientWidth - 24);
  const height = 160;
  canvas.width = width * dpr; canvas.height = height * dpr;
  canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const pad = { l: 10, r: 78, t: 16, b: 24 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const normalize = (values) => {
    const min = Math.min(...values), max = Math.max(...values), range = (max - min) || 1;
    return values.map(value => ((value - min) / range) * 100);
  };
  const buildPts = (values) => normalize(values).map((value, i) => ({ x: pad.l + (i / Math.max(values.length - 1, 1)) * plotW, y: pad.t + plotH - (value / 100) * plotH }));
  const aPts = buildPts(rows.map(row => Number(row.a)));
  const bPts = buildPts(rows.map(row => Number(row.b)));
  const drawLine = (pts, color) => {
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
  };
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) { const y = pad.t + (plotH / 3) * i; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke(); }
  drawLine(aPts, '#ff6600');
  drawLine(bPts, '#4a9eff');
  const labels = [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
  ctx.fillStyle = '#555550'; ctx.font = '9px IBM Plex Mono, monospace'; ctx.textAlign = 'center';
  labels.forEach(i => ctx.fillText(rows[i].date.slice(5), pad.l + (i / Math.max(rows.length - 1, 1)) * plotW, height - 6));
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ff6600'; ctx.beginPath(); ctx.arc(width - 68, 22, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillText(data.a.label, width - 60, 25);
  ctx.fillStyle = '#4a9eff'; ctx.beginPath(); ctx.arc(width - 68, 39, 3, 0, Math.PI * 2); ctx.fill(); ctx.fillText(data.b.label, width - 60, 42);
  const aLast = aPts[aPts.length - 1], bLast = bPts[bPts.length - 1];
  ctx.font = '9px IBM Plex Mono, monospace';
  ctx.fillStyle = '#ff6600'; ctx.fillText(compareFmt(rows[rows.length - 1].a, data.a), aLast.x + 6, aLast.y + 3);
  ctx.fillStyle = '#4a9eff'; ctx.fillText(compareFmt(rows[rows.length - 1].b, data.b), bLast.x + 6, bLast.y + 3);
}

function relationshipGlyph(row, prev) {
  if (!prev) return { text: 'BASE', cls: '' };
  const aUp = Number(row.a) >= Number(prev.a);
  const bUp = Number(row.b) >= Number(prev.b);
  const text = (aUp ? '↑' : '↓') + (bUp ? '↑' : '↓');
  return { text, cls: aUp === bUp ? 'rel-up' : 'rel-dn' };
}

function renderCompare(data) {
  if (!data) return;
  const interp = document.getElementById('compare-interpretation');
  const tone = data.divergence === 'DIVERGING' ? ['var(--red)', 'rgba(255,51,51,.08)'] : data.divergence === 'CONVERGING' ? ['var(--green)', 'rgba(0,204,102,.08)'] : ['var(--gold, #ffbf3d)', 'rgba(255,191,61,.08)'];
  if (interp) { interp.textContent = data.interpretation || ''; interp.style.borderLeftColor = tone[0]; interp.style.background = tone[1]; }
  drawCompareChart(data);
  const meta = document.getElementById('compare-meta');
  const badgeClass = data.divergence === 'DIVERGING' ? 'is-diverging' : data.divergence === 'CONVERGING' ? 'is-converging' : 'is-aligned';
  const direction = data.divergence === 'DIVERGING' ? 'MOVING APART' : data.divergence === 'CONVERGING' ? 'REALIGNING' : 'MOVING TOGETHER';
  if (meta) meta.innerHTML = `<span class="diverge-badge ${badgeClass}">${data.divergence}</span><span>${data.sessions} SESSIONS</span><span>${direction}</span>`;
  const table = document.getElementById('compare-table'); if (!table) return;
  const rows = (data.aligned || []).slice(-5);
  let html = `<div class="compare-table-head"><span>DATE</span><span>${data.a.label}</span><span>${data.b.label}</span><span>RELATIONSHIP</span></div>`;
  html += rows.map((row, i) => {
    const prev = data.aligned[data.aligned.length - rows.length + i - 1];
    const rel = relationshipGlyph(row, prev);
    return `<div class="compare-table-row"><span>${row.date}</span><span>${compareFmt(row.a, data.a)}</span><span>${compareFmt(row.b, data.b)}</span><span class="${rel.cls}">${rel.text}</span></div>`;
  }).join('');
  table.innerHTML = html;
}

function renderSopLoadingSkeleton() {
  const brief = document.getElementById('sop-brief');
  if (!brief) return;
  brief.innerHTML = Array.from({ length: 3 }, (_, i) => `<div class="sop-section signal-neutral sop-section-skeleton"><span class="sop-section-label">${['GLOBAL SETUP', 'DOMESTIC FLOWS', 'VOLATILITY'][i]}</span><span class="sop-section-text"><span class="skel-pill sop-skel-line"></span><span class="skel-pill sop-skel-line short"></span></span></div>`).join('');
}

function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function sopNum(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function sopFmtPct(value) { const n = sopNum(value); return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function sopFmtCr(value) { const n = sopNum(value); return (n >= 0 ? '+' : '') + Math.round(n).toLocaleString('en-IN') + ' Cr'; }

function shiftSopColor(hex, riskLabel) {
  const base = hex.replace('#', '');
  let r = parseInt(base.slice(0, 2), 16), g = parseInt(base.slice(2, 4), 16), b = parseInt(base.slice(4, 6), 16);
  if (riskLabel === 'DEFENSIVE') { b = Math.min(255, Math.round(b * 1.2 + 18)); r = Math.round(r * 0.88); }
  if (riskLabel === 'AGGRESSIVE') { r = Math.min(255, Math.round(r * 1.2 + 18)); b = Math.round(b * 0.86); }
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}

function computeProfile(sliders) {
  const horizon = sopNum(sliders.horizon, 50);
  const signal = sopNum(sliders.signal, 50);
  const risk = sopNum(sliders.risk, 50);
  const horizonLabel = horizon <= 33 ? 'INTRADAY' : horizon <= 66 ? 'MEDIUM' : 'LONG';
  const signalLabel = signal <= 33 ? 'TECHNICAL' : signal <= 66 ? 'MIXED' : 'FUNDAMENTAL';
  const riskLabel = risk <= 33 ? 'DEFENSIVE' : risk <= 66 ? 'MODERATE' : 'AGGRESSIVE';
  let weights = horizon <= 33
    ? { vix: 0.9, fii: 0.8, maDistance: 0.8, rsi: 0.9, valuation: 0.1, global: 0.6, crude: 0.4, gsec: 0.2 }
    : horizon <= 66
      ? { vix: 0.5, fii: 0.5, maDistance: 0.5, rsi: 0.5, valuation: 0.5, global: 0.5, crude: 0.5, gsec: 0.5 }
      : { vix: 0.2, fii: 0.3, maDistance: 0.3, rsi: 0.2, valuation: 0.9, global: 0.4, crude: 0.6, gsec: 0.8 };
  weights = { ...weights };
  if (signal <= 33) {
    weights.valuation *= 0.3;
    weights.rsi = Math.min(1, weights.rsi * 1.5);
    weights.maDistance = Math.min(1, weights.maDistance * 1.5);
  } else if (signal >= 67) {
    weights.rsi *= 0.3;
    weights.maDistance *= 0.3;
    weights.valuation = Math.min(1, weights.valuation * 1.5);
  }
  let baseColor = '#ff6600';
  if (signalLabel === 'TECHNICAL' && horizonLabel === 'INTRADAY') baseColor = '#4a9eff';
  else if (signalLabel === 'FUNDAMENTAL' && horizonLabel === 'LONG') baseColor = '#e6b84a';
  const name =
    signalLabel === 'TECHNICAL' && horizonLabel === 'INTRADAY' && riskLabel === 'AGGRESSIVE' ? 'MOMENTUM TRADER' :
    signalLabel === 'FUNDAMENTAL' && horizonLabel === 'LONG' && riskLabel === 'DEFENSIVE' ? 'VALUE INVESTOR' :
    signalLabel === 'TECHNICAL' && horizonLabel === 'MEDIUM' && riskLabel === 'MODERATE' ? 'SWING TRADER' :
    signalLabel === 'FUNDAMENTAL' && horizonLabel === 'MEDIUM' && riskLabel === 'MODERATE' ? 'GROWTH INVESTOR' :
    horizonLabel === 'LONG' && riskLabel === 'DEFENSIVE' ? 'CONSERVATIVE' :
    signalLabel === 'TECHNICAL' && horizonLabel === 'INTRADAY' && riskLabel === 'DEFENSIVE' ? 'SCALPER' :
    'ADAPTIVE';
  return {
    name,
    horizonLabel: horizonLabel === 'MEDIUM' && horizon < 50 ? 'SHORT' : horizonLabel,
    signalLabel,
    riskLabel,
    weights,
    accentColor: shiftSopColor(baseColor, riskLabel),
    outputStyle: horizon <= 33 ? 'terse' : horizon >= 67 ? 'contextual' : 'balanced'
  };
}

function restoreSopSliders() {
  try {
    const saved = JSON.parse(localStorage.getItem('dw-sop-sliders') || '{}');
    ['horizon', 'signal', 'risk'].forEach(key => {
      const value = Number(saved[key]);
      if (Number.isFinite(value)) sopState.sliders[key] = Math.max(0, Math.min(100, value));
    });
  } catch {}
}

function updateSopSliders() {
  const ids = { horizon: 'sop-horizon', signal: 'sop-signal', risk: 'sop-risk' };
  Object.entries(ids).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) sopState.sliders[key] = Number(el.value);
  });
  sopState.profile = computeProfile(sopState.sliders);
  const panel = document.getElementById('rp-sop');
  if (panel) panel.style.setProperty('--sop-accent', sopState.profile.accentColor);
  Object.entries(ids).forEach(([key, id]) => {
    const value = sopState.sliders[key];
    const input = document.getElementById(id);
    if (input) input.style.setProperty('--pct', value + '%');
    const pos = document.querySelector(`[data-sop-pos="${key}"]`);
    if (pos) pos.style.setProperty('--pct', value + '%');
    const dot = document.querySelector(`[data-sop-dot="${key}"]`);
    if (dot) dot.style.opacity = String(0.3 + (value / 100) * 0.7);
  });
  const name = document.querySelector('.sop-profile-name');
  if (name) name.textContent = sopState.profile.name;
  localStorage.setItem('dw-sop-sliders', JSON.stringify(sopState.sliders));
  if (sopState.data) renderSOP();
}
window.updateSopSliders = updateSopSliders;

function initSopControls() {
  restoreSopSliders();
  const ids = { horizon: 'sop-horizon', signal: 'sop-signal', risk: 'sop-risk' };
  Object.entries(ids).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.value = sopState.sliders[key];
  });
  updateSopSliders();
}

async function fetchSOPHistory() {
  try {
    const data = await fetchJsonWithTimeout('/api/sop-history', {}, 15000);
    sopDeltaState.history = data;
    computeDeltas();
    if (currentRP === 'sop') renderSOP();
  } catch (e) {
    console.warn('SOP History failed', e);
    computeDeltas();
    if (currentRP === 'sop') renderSOP();
  }
}

function saveSOPSnapshot() {
  if (sopState.data) {
    const snap = {
      nifty: sopState.data.nifty?.price || 0,
      vix: sopState.data.vix?.price || 0,
      usdinr: sopState.data.macro?.usdinr?.price || 0,
      crude: sopState.data.macro?.crude?.price || 0,
      fii_net: sopState.data.fii?.today_net || 0,
      ts: Date.now()
    };
    localStorage.setItem('dw-sop-snapshot', JSON.stringify(snap));
  }
}
window.addEventListener('beforeunload', saveSOPSnapshot);

function computeDeltas() {
  const current = sopState.data;
  if (!current) return;
  
  let prev = null;
  if (sopDeltaState.history && sopDeltaState.history.sessions && sopDeltaState.history.sessions.length > 1) {
     prev = sopDeltaState.history.sessions[1];
  } else {
     try {
       const snap = JSON.parse(localStorage.getItem('dw-sop-snapshot'));
       if (snap && (Date.now() - snap.ts < 48 * 60 * 60_000)) prev = snap;
     } catch(e){}
  }
  
  if (!prev) {
     sopDeltaState.deltas = [];
     return;
  }
  
  const deltas = [];
  const addDelta = (key, metric, curr, old, type) => {
     if (!curr || !old) return;
     const diff = curr - old;
     const pct = (diff / old) * 100;
     deltas.push({ key, metric, curr, old, diff, pct, type });
  };
  
  addDelta('nifty', 'Nifty 50', current.nifty?.price, prev.nifty, 'index');
  addDelta('vix', 'India VIX', current.vix?.price, prev.vix, 'volatility');
  
  const currFii = current.fii?.today_net || 0;
  const prevFii = prev.fii_net || 0;
  if (currFii !== 0 || prevFii !== 0) {
     deltas.push({ key: 'fii', metric: 'FII Flow', curr: currFii, old: prevFii, diff: currFii - prevFii, pct: 0, type: 'flow' });
  }
  
  addDelta('usdinr', 'USD/INR', current.macro?.usdinr?.price, prev.usdinr, 'macro');
  addDelta('crude', 'Crude Oil', current.macro?.crude?.price, prev.crude, 'macro');

  const significant = [];
  deltas.forEach(d => {
    let score = 0;
    let desc = '';
    let dir = d.diff > 0 ? 'up' : 'down';
    
    if (d.type === 'index') {
       if (Math.abs(d.pct) > 1.5) { score = 3; desc = `Moved sharply by ${Math.abs(d.pct).toFixed(1)}%`; }
       else if (Math.abs(d.pct) > 0.7) { score = 2; desc = `Moved by ${Math.abs(d.pct).toFixed(1)}%`; }
       else if (Math.abs(d.pct) > 0.3) { score = 1; desc = `Slight move of ${Math.abs(d.pct).toFixed(1)}%`; }
    } else if (d.type === 'volatility') {
       if (Math.abs(d.pct) > 10) { score = 3; desc = `Spiked ${Math.abs(d.pct).toFixed(1)}%`; }
       else if (Math.abs(d.pct) > 5) { score = 2; desc = `Changed ${Math.abs(d.pct).toFixed(1)}%`; }
       else if (Math.abs(d.diff) > 1) { score = 1; desc = `Shifted by ${Math.abs(d.diff).toFixed(1)} points`; }
    } else if (d.type === 'flow') {
       if ((d.curr > 0 && d.old < 0) || (d.curr < 0 && d.old > 0)) {
         score = 3; 
         desc = `Flipped to net ${d.curr > 0 ? 'buying' : 'selling'}`; 
         dir = d.curr > 0 ? 'up' : 'down';
       } else if (Math.abs(d.diff) > 2000) {
         score = 2; desc = `Significant acceleration`;
       } else if (Math.abs(d.diff) > 1000) {
         score = 1; desc = `Change in momentum`;
       }
    } else if (d.type === 'macro') {
       if (Math.abs(d.pct) > 2) { score = 3; desc = `Large move of ${Math.abs(d.pct).toFixed(1)}%`; }
       else if (Math.abs(d.pct) > 1) { score = 2; desc = `Moved by ${Math.abs(d.pct).toFixed(1)}%`; }
    }
    
    if (score > 0) {
      significant.push({ ...d, score, desc, dir });
    }
  });
  
  significant.sort((a, b) => b.score - a.score);
  sopDeltaState.deltas = significant.slice(0, 3);
}

async function fetchSOPData() {
  const brief = document.getElementById('sop-brief');
  if (brief) brief.innerHTML = '<div class="sop-section signal-neutral"><span class="sop-section-label">LOADING</span><span class="sop-section-text">Building live SOP from market, flow, volatility, macro, and global data...</span></div>';
  try {
    const data = await fetchJsonWithTimeout('/api/sop-data', {}, 18000);
    sopState.data = data;
    sopState.lastFetch = Date.now();
    computeDeltas();
    renderSOP();
    if (!sopDeltaState.history || Date.now() - (sopDeltaState.lastFetch || 0) > 60_000) {
      sopDeltaState.lastFetch = Date.now();
      fetchSOPHistory();
    }
  } catch (e) {
    if (brief) brief.innerHTML = `<div class="sop-section signal-headwind"><span class="sop-section-label">ERROR</span><span class="sop-section-text">${e.message}</span></div>`;
  }
}

function section(label, text, signal, weight = 1) { return { label, text, signal, weight }; }

function generateSOP(data, profile) {
  const sections = [];
  const weights = profile.weights;
  const globalAvg = (sopNum(data.global?.sp500) + sopNum(data.global?.dow) + sopNum(data.global?.nasdaq)) / 3;
  let globalText = `Overnight setup is ${data.global?.overnight_bias || 'neutral'}.`;
  if (weights.global > 0.6) globalText += ` S&P 500 ${sopFmtPct(data.global?.sp500)}, Dow ${sopFmtPct(data.global?.dow)}, Nasdaq ${sopFmtPct(data.global?.nasdaq)} define the opening handover.`;
  sections.push(section('GLOBAL SETUP', globalText, globalAvg > 0.15 ? 'tailwind' : globalAvg < -0.15 ? 'headwind' : 'neutral', weights.global));

  const fiiNet = sopNum(data.fii?.today_net);
  const fiiAbs = Math.abs(fiiNet);
  const fiiText = weights.fii > 0.6
    ? `FII net flow is ${sopFmtCr(fiiNet)} versus ${sopFmtCr(data.fii?.yesterday_net)} yesterday, with flow ${data.fii?.direction || 'flat'}.`
    : `FII flow is ${fiiNet >= 0 ? 'positive' : 'negative'}, ${data.fii?.direction || 'flat'}.`;
  sections.push(section('DOMESTIC FLOWS', fiiText, fiiNet > 250 ? 'tailwind' : fiiNet < -250 ? 'headwind' : 'neutral', weights.fii));

  const vix = sopNum(data.vix?.price);
  const vixWarning = profile.riskLabel === 'DEFENSIVE' ? vix > 16 : profile.riskLabel === 'AGGRESSIVE' ? vix > 22 : vix > 18;
  sections.push(section('VOLATILITY', `India VIX is ${vix.toFixed(2)} (${data.vix?.level || 'unknown'}) and ${data.vix?.trend_3d || 'flat'} over three sessions.`, vixWarning ? 'headwind' : vix < 13 ? 'tailwind' : 'neutral', weights.vix));

  if (profile.signalLabel !== 'FUNDAMENTAL') {
    const rsi = sopNum(data.nifty?.rsi14, 50);
    const maText = `Nifty is ${sopFmtPct(data.nifty?.distance_20d_ma)} from the 20D average and ${sopFmtPct(data.nifty?.distance_200d_ma)} from the 200D average. RSI-14 is ${rsi.toFixed(1)}.`;
    const priceSignal = rsi > 70 ? 'headwind' : rsi < 30 ? 'tailwind' : sopNum(data.nifty?.distance_20d_ma) >= 0 ? 'tailwind' : 'headwind';
    sections.push(section('PRICE STRUCTURE', maText, priceSignal, (weights.maDistance + weights.rsi) / 2));
  }

  if (profile.signalLabel !== 'TECHNICAL') {
    const val = data.valuation?.label || 'FAIR';
    const gsec = data.macro?.gsec?.price ? ` 10Y G-Sec near ${sopNum(data.macro.gsec.price).toFixed(2)}% frames the equity yield trade-off.` : '';
    sections.push(section('VALUATION CONTEXT', `Nifty valuation proxy is ${val} at ${Math.round(sopNum(data.valuation?.nifty_level)).toLocaleString('en-IN')}.${gsec}`, val === 'ATTRACTIVE' ? 'tailwind' : val === 'STRETCHED' ? 'headwind' : 'neutral', weights.valuation));
  }

  const crude = sopNum(data.macro?.crude?.price);
  const usdinr = sopNum(data.macro?.usdinr?.price);
  const macroStress = crude > 90 || usdinr > 84;
  sections.push(section('MACRO STRESS', `Crude is ${crude.toFixed(2)} (${sopFmtPct(data.macro?.crude?.percent_change)}), USD/INR is ${usdinr.toFixed(2)}, and DXY is ${sopFmtPct(data.macro?.dxy?.percent_change)}.`, macroStress ? 'headwind' : 'neutral', Math.max(weights.crude, weights.gsec)));

  const visible = sections.filter(s => s.weight >= 0.25);
  
  if (sopDeltaState.deltas) {
     if (sopDeltaState.deltas.length > 0) {
       let html = `<div id="sop-delta-section">`;
       sopDeltaState.deltas.forEach(d => {
         const arrow = d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '—';
         const icon = d.score === 3 ? '●' : '·';
         const oldStr = d.type === 'flow' ? sopFmtCr(d.old) : (typeof d.old === 'number' ? d.old.toFixed(2) : d.old);
         html += `<div class="sop-delta-item"><span class="sop-delta-icon">${icon}</span><span class="sop-delta-metric">${d.metric} ${arrow}</span><span class="sop-delta-desc">${d.desc} (was ${oldStr})</span></div>`;
       });
       html += `</div>`;
       visible.unshift({ label: 'WHAT CHANGED', text: html, signal: 'neutral', weight: 2 });
     } else {
       visible.unshift({ label: 'WHAT CHANGED', text: '<div id="sop-delta-section" style="padding-top:4px"><div class="sop-delta-item"><span class="sop-delta-desc">Establishing baseline...</span></div></div>', signal: 'neutral', weight: 2 });
     }
  }

  const counts = visible.reduce((acc, s) => { acc[s.signal] = (acc[s.signal] || 0) + 1; return acc; }, {});
  let overall = counts.tailwind > counts.headwind ? 'tailwind' : counts.headwind > counts.tailwind ? 'headwind' : 'neutral';
  if (profile.riskLabel === 'DEFENSIVE' && counts.headwind >= counts.tailwind) overall = 'headwind';
  if (profile.riskLabel === 'AGGRESSIVE' && counts.tailwind >= counts.headwind - 1) overall = 'tailwind';
  const dominant = overall === 'tailwind' ? 'Tailwinds are stronger than warnings.' : overall === 'headwind' ? 'Warnings dominate the setup.' : 'Signals are mixed and require confirmation.';
  const implication = overall === 'tailwind'
    ? (profile.riskLabel === 'AGGRESSIVE' ? 'Look for breakout participation, but keep invalidation tight.' : 'Prefer selective longs over broad exposure.')
    : overall === 'headwind'
      ? 'Protect capital first and wait for cleaner confirmation.'
      : 'Stay balanced and let price confirm direction.';
  return { sections: visible, synthesis: { text: `${profile.name} setup. ${dominant} ${implication}`, signal: overall } };
}

function renderSOP() {
  if (!sopState.profile) sopState.profile = computeProfile(sopState.sliders);
  if (!sopState.data) return;
  const out = generateSOP(sopState.data, sopState.profile);
  const brief = document.getElementById('sop-brief');
  if (brief) {
    brief.innerHTML = out.sections.map(s => `<div class="sop-section signal-${s.signal}"><span class="sop-section-label">${s.label}</span><span class="sop-section-text">${s.text}</span></div>`).join('');
  }
  const synthesis = document.getElementById('sop-synthesis');
  if (synthesis) {
    synthesis.textContent = out.synthesis.text;
    synthesis.style.color = out.synthesis.signal === 'tailwind' ? 'var(--green)' : out.synthesis.signal === 'headwind' ? 'var(--red)' : 'var(--text)';
    synthesis.classList.remove('sop-reveal');
    void synthesis.offsetWidth;
    synthesis.classList.add('sop-reveal');
    let fresh = document.getElementById('sop-freshness');
    if (!fresh) {
      fresh = document.createElement('div');
      fresh.id = 'sop-freshness';
      synthesis.insertAdjacentElement('afterend', fresh);
    }
    const ts = Date.parse(sopState.data.ts || '');
    if (Number.isFinite(ts) && Date.now() - ts > 5 * 60_000) {
      const time = new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
      fresh.textContent = `Brief is from ${time} IST - refresh for current setup`;
      fresh.style.display = 'block';
    } else {
      fresh.textContent = '';
      fresh.style.display = 'none';
    }
  }
}

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

function flashCell(valId, dir) { const cell = document.getElementById(valId)?.closest('.idx-cell'); if (!cell) return; cell.classList.remove('flash-up', 'flash-dn'); void cell.offsetWidth; cell.classList.add(dir === 'up' ? 'flash-up' : 'flash-dn'); }
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
      if (tm) {
        setEl(tm.tkVal, price);
        const te = document.getElementById(tm.tkChg);
        if (te) { te.textContent = txt; te.className = cls + ' has-data'; }
        if (tm.tkVal === 'tk-nifty') { setEl('tk-nifty2', price); const e2 = document.getElementById('tk-nifty-chg2'); if (e2) { e2.textContent = txt; e2.className = cls + ' has-data'; } }
        if (tm.tkVal === 'tk-sensex') { setEl('tk-sensex2', price); const e2 = document.getElementById('tk-sensex-chg2'); if (e2) { e2.textContent = txt; e2.className = cls + ' has-data'; } }
      }
      sidebarIndices.forEach(item => {
        if (item.sym === key) {
          const prevTxt = document.getElementById(item.valId)?.textContent;
          setEl(item.valId, price);
          const ce = document.getElementById(item.chgId);
          if (ce) { ce.textContent = txt; ce.className = 'idx-chg has-data ' + cls; }
          if (prevTxt && prevTxt !== '--' && prevTxt !== price) flashCell(item.valId, cls);
          if (d.week52High && d.week52Low) update52WBar(item.valId, raw, d.week52Low, d.week52High);
        }
      });
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
    if (vixTag) { const tag = vixHasValue ? (d?.meta?.vix?.tag || 'LIVE') : 'UNAVAILABLE'; vixTag.textContent = tag; vixTag.className = 'truth-tag ' + truthTagClass(tag); }
    if (gsecTag) { const tag = d?.meta?.gsec?.tag || 'DELAYED 15m'; gsecTag.textContent = tag; gsecTag.className = 'truth-tag ' + truthTagClass(tag); }
    if (vixMeta) vixMeta.textContent = vixHasValue ? (d?.meta?.vix?.source || 'NSE India VIX') : 'NSE India VIX — Awaiting data';
    if (gsecMeta) gsecMeta.textContent = d?.meta?.gsec?.source || 'Yahoo Finance India 10Y';
    renderMiniMacroCharts();
  } catch { }
}

// ── GLOBAL MARKETS RENDER ──
function renderGlobal() {
  const el = document.getElementById('gl-content'); if (!el || !globalData) return;
  const groups = [
    { label: 'Americas', keys: ['SP500', 'DOW', 'NASDAQ', 'VIX'] },
    { label: 'Europe/UK', keys: ['DAX', 'CAC40', 'FTSE100'] },
    { label: 'Asia/Pacific', keys: ['NIKKEI', 'HANGSENG', 'SHANGHAI', 'KOSPI'] },
    { label: 'Commodity/FX', keys: ['GOLD', 'CRUDE', 'USDINR', 'DXY', 'US10Y'] }
  ];
  let html = '<div style="padding:16px; font-family:var(--mono);">';
  groups.forEach((region) => {
    const items = region.keys.map(k => globalData[k]).filter(Boolean);
    if (!items.length) return;
    html += `<div style="margin-bottom:20px;"><div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:12px;"><span style="font-size:10px;font-weight:700;color:var(--orange);letter-spacing:1px;text-transform:uppercase;">${region.label}</span><span style="font-size:9px;color:var(--dim);">REAL-TIME FEED</span></div><div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:1px;background:var(--line);border:1px solid var(--line);">`;
    items.forEach(item => {
      const pct = parseFloat(item.percent_change || 0); const cls = pct > 0 ? 'up' : pct < 0 ? 'dn' : 'flat';
      const sign = pct >= 0 ? '+' : '';
      html += `<div style="background:var(--bg2);padding:12px;display:flex;flex-direction:column;gap:4px;"><div style="font-size:10px;color:var(--muted);font-weight:600;">${(item.label||'').toUpperCase()}</div><div style="font-size:18px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums">${parseFloat(item.price || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div><div class="${cls}" style="font-size:10px;font-weight:700;">${sign}${pct.toFixed(2)}%</div></div>`;
    });
    html += `</div></div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

setInterval(() => { if (currentRP === 'global') fetchGlobal(); }, 60000);

// ── TICKER SEARCH ──
const ALL_TICKERS = [
  { sym: 'NIFTY', label: 'Nifty 50' }, { sym: 'SENSEX', label: 'BSE Sensex' }, { sym: 'BANKNIFTY', label: 'Bank Nifty' },
  { sym: 'RELIANCE', label: 'Reliance Industries' }, { sym: 'TCS', label: 'Tata Consultancy' },
  { sym: 'INFY', label: 'Infosys' }, { sym: 'HDFCBANK', label: 'HDFC Bank' }, { sym: 'ICICIBANK', label: 'ICICI Bank' },
  { sym: 'SBIN', label: 'State Bank of India' }, { sym: 'WIPRO', label: 'Wipro' }, { sym: 'TATAMOTORS', label: 'Tata Motors' },
  { sym: 'TATASTEEL', label: 'Tata Steel' }, { sym: 'ADANIENT', label: 'Adani Enterprises' }, { sym: 'BAJFINANCE', label: 'Bajaj Finance' },
  { sym: 'MARUTI', label: 'Maruti Suzuki' }, { sym: 'AXISBANK', label: 'Axis Bank' }, { sym: 'KOTAKBANK', label: 'Kotak Mahindra' },
  { sym: 'LT', label: 'Larsen & Toubro' }, { sym: 'SUNPHARMA', label: 'Sun Pharmaceutical' }, { sym: 'HINDUNILVR', label: 'HUL' },
  { sym: 'ITC', label: 'ITC Limited' }, { sym: 'ASIANPAINT', label: 'Asian Paints' }, { sym: 'TITAN', label: 'Titan Company' },
];

let tickerHighlight = -1;
function showTickerDropdown(q) { const dd = document.getElementById('ticker-dropdown'); if (!dd) return; const query = q.trim().toUpperCase(); if (!query) { dd.style.display = 'none'; return; } const matches = ALL_TICKERS.filter(t => t.sym.includes(query) || t.label.toUpperCase().includes(query)).slice(0, 12); if (!matches.length) { dd.style.display = 'none'; return; } tickerHighlight = -1; dd.innerHTML = matches.map((t, i) => `<div class="td-item" data-sym="${t.sym}" onmousedown="selectTicker('${t.sym}')" onmouseover="tickerHighlight=${i};renderHighlight()"><span style="color:#ff6600;font-weight:bold;font-size:17px">${t.sym}</span><span style="color:#666;font-size:16px;margin-left:8px">${t.label}</span></div>`).join(''); dd.style.display = 'block'; }
function renderHighlight() { document.querySelectorAll('.td-item').forEach((el, i) => { el.style.background = i === tickerHighlight ? '#1a1a2e' : ''; }); }
function handleTickerKey(e) { const dd = document.getElementById('ticker-dropdown'); const items = dd ? dd.querySelectorAll('.td-item') : []; if (e.key === 'ArrowDown') { e.preventDefault(); tickerHighlight = Math.min(tickerHighlight + 1, items.length - 1); renderHighlight(); } else if (e.key === 'ArrowUp') { e.preventDefault(); tickerHighlight = Math.max(tickerHighlight - 1, 0); renderHighlight(); } else if (e.key === 'Enter') { if (tickerHighlight >= 0 && items[tickerHighlight]) selectTicker(items[tickerHighlight].dataset.sym); else applyTicker(); } else if (e.key === 'Escape') { dd.style.display = 'none'; } }
function selectTicker(sym) { document.getElementById('rp-ticker').value = sym; const dd = document.getElementById('ticker-dropdown'); if (dd) dd.style.display = 'none'; applyTicker(); }
document.addEventListener('click', e => { if (!e.target.closest('#rp-ticker-row')) { const dd = document.getElementById('ticker-dropdown'); if (dd) dd.style.display = 'none'; } });

// ── HEATMAP ──
let heatmapData = null; let heatmapSet = 'nifty';
async function fetchHeatmap() {
  const el = document.getElementById('heatmap-content'); if (!el) return;
  heatmapSet = document.getElementById('hm-set')?.value || 'nifty';
  if (heatmapData) { renderHeatmap(); return; }
  el.innerHTML = '<div style="color:#4CAF82;text-align:center;padding:40px;font-size:14px">Loading heatmap...</div>';
  try {
    const res = await fetch(`/api/heatmap?set=${encodeURIComponent(heatmapSet)}`);
    heatmapData = await res.json();
    renderHeatmap();
    if (Array.isArray(heatmapData) && heatmapData.length) { const adv = heatmapData.filter(s => (s.pct || 0) > 0).length; const dec = heatmapData.filter(s => (s.pct || 0) < 0).length; renderBreadthBar(adv, dec); }
  } catch (e) { el.innerHTML = `<div style="color:#ff4444;padding:20px">Error: ${e.message}</div>`; }
}
function forceHeatmap() { heatmapData = null; fetchHeatmap(); }
function onHeatmapSetChange() { heatmapData = null; fetchHeatmap(); }

let dwTooltip = null;
function ensureTooltip() { if (dwTooltip) return dwTooltip; const el = document.createElement('div'); el.className = 'dw-tooltip'; el.id = 'dw-tooltip'; document.body.appendChild(el); dwTooltip = el; return el; }
function showTooltip(html, x, y) { const tt = ensureTooltip(); tt.innerHTML = html; const ox = 14, oy = 16; const vw = window.innerWidth, vh = window.innerHeight; tt.style.transform = `translate3d(${x + ox}px,${y + oy}px,0)`; tt.classList.add('on'); const r = tt.getBoundingClientRect(); let nx = x + ox, ny = y + oy; if (nx + r.width + 8 > vw) nx = Math.max(8, vw - r.width - 8); if (ny + r.height + 8 > vh) ny = Math.max(8, vh - r.height - 8); tt.style.transform = `translate3d(${nx}px,${ny}px,0)`; }
function hideTooltip() { if (!dwTooltip) return; dwTooltip.classList.remove('on'); }

function renderHeatmap() {
  const el = document.getElementById('heatmap-content'); if (!el || !heatmapData) return;
  const data = Array.isArray(heatmapData) ? heatmapData : (heatmapData.nifty || heatmapData.universe || []);
  if (!Array.isArray(data) || !data.length) { el.innerHTML = '<div style="color:var(--muted);padding:24px;font-family:var(--mono);text-align:center;">DATA UNAVAILABLE</div>'; return; }
  const groupBy = document.getElementById('hm-group')?.value || 'sector';
  const sortBy = document.getElementById('hm-sort')?.value || 'mcap';
  const q = (document.getElementById('hm-q')?.value || '').trim().toLowerCase();
  let filtered = data;
  if (q) filtered = data.filter(s => (s.sym || '').toLowerCase().includes(q) || (s.sector || '').toLowerCase().includes(q));
  const sorter = { mcap: (a, b) => (b.mcap - a.mcap), pct: (a, b) => b.pct - a.pct, sym: (a, b) => (a.sym || '').localeCompare(b.sym || '') }[sortBy] || ((a, b) => b.mcap - a.mcap);
  filtered = [...filtered].sort(sorter);
  const metaEl = document.getElementById('hm-meta');
  if (metaEl) { const up = filtered.filter(s => s.pct > 0).length; const dn = filtered.filter(s => s.pct < 0).length; metaEl.textContent = `${filtered.length} ITEMS · ${up} UP · ${dn} DOWN`; }
  let html = '<div style="padding:16px; font-family:var(--mono);">';
  if (groupBy === 'sector') {
    const sectors = {};
    filtered.forEach(s => { const sec = s.sector || 'OTHER'; if (!sectors[sec]) sectors[sec] = []; sectors[sec].push(s); });
    Object.entries(sectors).sort(([a], [b]) => a.localeCompare(b)).forEach(([sector, stocks]) => {
      const avg = stocks.reduce((acc, x) => acc + (x.pct || 0), 0) / Math.max(1, stocks.length);
      const avgSign = avg >= 0 ? '+' : '';
      html += `<div style="margin-bottom:16px;"><div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:12px;"><span style="font-size:10px;font-weight:700;color:var(--orange);letter-spacing:1px;text-transform:uppercase;">${sector}</span><span style="font-size:10px;font-weight:700;color:${avg >= 0 ? 'var(--green)' : 'var(--red)'}">${avgSign}${avg.toFixed(2)}%</span></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);">`;
      stocks.forEach(s => {
        const pct = s.pct || 0;
        const color = pct > 1.5 ? '#00cc66' : pct > 0 ? '#007a3d' : pct < -1.5 ? '#ff4444' : pct < 0 ? '#8a2626' : 'var(--muted)';
        html += `<div style="background:var(--bg2);padding:12px 6px;text-align:center;border-left:2px solid ${color};"><div style="font-size:12px;font-weight:700;">${s.sym}</div><div style="font-size:10px;color:${color};font-weight:700;margin-top:2px;">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</div></div>`;
      });
      html += `</div></div>`;
    });
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);">`;
    filtered.forEach(s => {
      const pct = s.pct || 0;
      const color = pct > 0 ? 'var(--green)' : pct < 0 ? 'var(--red)' : 'var(--muted)';
      html += `<div style="background:var(--bg2);padding:12px 6px;text-align:center;border-left:2px solid ${color};"><div style="font-size:12px;font-weight:700;">${s.sym}</div><div style="font-size:10px;color:${color};font-weight:700;margin-top:2px;">${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</div></div>`;
    });
    html += `</div>`;
  }
  html += '</div>';
  el.innerHTML = html;
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
];

const ETF_LIST = [
  { label: 'Nippon Nifty BeES', amc: 'Nippon', type: 'Nifty 50', nse: 'NIFTYBEES', er: 0.04, aum: 24000, code: '120594' },
  { label: 'HDFC Nifty 50 ETF', amc: 'HDFC', type: 'Nifty 50', nse: 'HDFCNIFTY', er: 0.05, aum: 9800, code: '118989' },
  { label: 'SBI ETF Nifty 50', amc: 'SBI', type: 'Nifty 50', nse: 'SETFNIF50', er: 0.07, aum: 16600, code: '103504' },
  { label: 'Nippon Bank BeES', amc: 'Nippon', type: 'Bank Nifty', nse: 'BANKBEES', er: 0.19, aum: 7800, code: '119598' },
  { label: 'Nippon Gold BeES', amc: 'Nippon', type: 'Gold', nse: 'GOLDBEES', er: 0.82, aum: 8400, code: '118778' },
];

const ALL_AMCS = [...new Set([...MF_SCHEMES.map(s => s.amc), ...ETF_LIST.map(e => e.amc)])].sort();
let mfData = null, mfTab = 'mf', mfExpanded = '', mfView = 'card', mfAmcFilter = new Set(), mfSearchTimeout = null, mfLiveSearchMode = false;

async function fetchMF() {
  if (mfData) { buildMFChips(); renderMF(); return; }
  showMFSkeleton();
  const fetchFull = async (scheme) => {
    try {
      const r = await fetch('/api/mfapi/' + scheme.code); if (!r.ok) return null;
      const d = await r.json(); const h = d?.data || []; if (!h.length) return null;
      const latest = parseFloat(h[0]?.nav || 0); const prev = parseFloat(h[1]?.nav || latest);
      const chg1d = latest - prev; const pct1d = prev > 0 ? (chg1d / prev) * 100 : 0;
      const getH = (days) => { const target = Date.now() - days * 86400000; for (let i = h.length - 1; i >= 0; i--) { const [dd, mm, yyyy] = (h[i].date || '').split('-'); const ts = new Date(yyyy + '-' + mm + '-' + dd).getTime(); if (ts <= target) return parseFloat(h[i].nav || 0); } return 0; };
      const n1 = getH(365), n3 = getH(1095), n5 = getH(1825);
      return { ...scheme, nav: latest, date: h[0]?.date || '', change: chg1d, pct: pct1d, ret1y: n1 > 0 ? ((latest - n1) / n1) * 100 : null, cagr3y: n3 > 0 ? (Math.pow(latest / n3, 1 / 3) - 1) * 100 : null, cagr5y: n5 > 0 ? (Math.pow(latest / n5, 1 / 5) - 1) * 100 : null, _history: h.slice(0, 30) };
    } catch { return null; }
  };
  try {
    const mfs = [];
    for (let i = 0; i < MF_SCHEMES.length; i += 3) {
      const chunk = await Promise.all(MF_SCHEMES.slice(i, i + 3).map(fetchFull));
      mfs.push(...chunk.filter(Boolean));
      if (mfs.length) { mfData = { mfs, etfs: ETF_LIST.map(e => ({ ...e, price: 0, change: 0, pct: 0 })), ts: Date.now() }; buildMFChips(); renderMF(); }
      if (i + 3 < MF_SCHEMES.length) await new Promise(r => setTimeout(r, 200));
    }
    mfData = { mfs, etfs: ETF_LIST.map(e => ({ ...e, price: 0, change: 0, pct: 0, _fetched: false })), ts: Date.now() };
    buildMFChips(); renderMF();
    const upd = document.getElementById('mf-last-upd');
    if (upd) { const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }); upd.textContent = 'NAV · ' + now + ' IST'; }
  } catch (e) { const el = document.getElementById('mf-content'); if (el) el.innerHTML = '<div style="color:#ff4444;padding:20px">Error: ' + e.message + '</div>'; }
}

function forceMF() { mfData = null; mfAmcFilter.clear(); fetchMF(); }
function switchMFTab(tab) { mfTab = tab; mfExpanded = ''; mfLiveSearchMode = false; document.getElementById('mftab-mf').classList.toggle('sc-vbtn-on', tab === 'mf'); document.getElementById('mftab-etf').classList.toggle('sc-vbtn-on', tab === 'etf'); renderMF(); }
function setMFView(v) { mfView = v; document.getElementById('mf-vcard')?.classList.toggle('sc-vbtn-on', v === 'card'); document.getElementById('mf-vlist')?.classList.toggle('sc-vbtn-on', v === 'list'); renderMF(); }
function toggleMFAmc(amc) { if (mfAmcFilter.has(amc)) mfAmcFilter.delete(amc); else mfAmcFilter.add(amc); document.querySelectorAll('.sc-chip').forEach(c => { if (c.dataset.amc === amc) c.classList.toggle('sc-chip-on', mfAmcFilter.has(amc)); }); renderMF(); }
function buildMFChips() { const wrap = document.getElementById('mf-amc-chips'); if (!wrap) return; wrap.innerHTML = ALL_AMCS.map(a => '<span class="sc-chip' + (mfAmcFilter.has(a) ? ' sc-chip-on' : '') + '" data-amc="' + a + '" onclick="toggleMFAmc(\'' + a + '\')">' + a + '</span>').join(''); }
function onMFSearch(val) { clearTimeout(mfSearchTimeout); const q = val.trim(); if (!q) { mfLiveSearchMode = false; renderMF(); return; } renderMF(); }

function showMFSkeleton() {
  const el = document.getElementById('mf-content'); if (!el) return;
  el.innerHTML = '<div style="color:#3a3a5a;font-size:10px;letter-spacing:.8px;margin-bottom:10px">FETCHING NAV DATA...</div><div class="mf-grid">' + Array.from({ length: 4 }, (_, i) => `<div class="mf-tile" style="animation-delay:${i*40}ms"><div class="mf-skel" style="height:11px;width:70%;margin-bottom:8px"></div><div class="mf-skel" style="height:9px;width:38%;margin-bottom:12px"></div></div>`).join('') + '</div>';
}

function retColor(v) { if (v == null) return 'var(--line2)'; return v >= 10 ? 'var(--green)' : v >= 0 ? 'var(--muted)' : 'var(--red)'; }
function fmtAUM(v) { return v >= 1000 ? '₹' + (v / 1000).toFixed(1) + 'K Cr' : '₹' + v + ' Cr'; }

function applyMFFilters(items) {
  const q = (document.getElementById('mf-q')?.value || '').trim().toLowerCase();
  const catF = document.getElementById('mf-cat')?.value || '';
  const sortBy = document.getElementById('mf-sort')?.value || 'amc';
  let out = [...items];
  if (q) out = out.filter(m => (m.label || '').toLowerCase().includes(q) || (m.amc || '').toLowerCase().includes(q) || (m.cat || m.type || '').toLowerCase().includes(q));
  if (catF) out = out.filter(m => (m.cat || m.type || '').toLowerCase().includes(catF.toLowerCase()));
  if (mfAmcFilter.size) out = out.filter(m => mfAmcFilter.has(m.amc));
  const sorters = { amc: (a, b) => (a.amc || '').localeCompare(b.amc || ''), nav: (a, b) => (b.nav || b.price || 0) - (a.nav || a.price || 0), ret1y: (a, b) => (b.ret1y ?? -999) - (a.ret1y ?? -999), aum: (a, b) => (b.aum || 0) - (a.aum || 0) };
  out.sort(sorters[sortBy] || sorters.amc); return out;
}

function renderMF() {
  const el = document.getElementById('mf-content'); if (!el || !mfData) return;
  if (mfLiveSearchMode) return;
  const pool = mfTab === 'etf' ? (mfData.etfs || []) : (mfData.mfs || []).filter(m => m?.nav);
  const items = applyMFFilters(pool);
  if (!items.length) { el.innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center;font-family:var(--mono);">No matching schemes</div>'; return; }
  const kind = mfTab === 'etf' ? 'ETF' : 'MF';
  const cntEl = document.getElementById('mf-count');
  if (cntEl) cntEl.textContent = items.length + (kind === 'ETF' ? ' ETFs' : ' FUNDS');
  let html = '<div style="padding:16px;font-family:var(--mono);">';
  if (mfView === 'list') {
    html += `<div style="border:1px solid var(--line);background:var(--bg1);"><div style="display:grid;grid-template-columns:2fr 1fr 1fr;background:var(--bg2);padding:8px 12px;font-size:9px;color:var(--muted);font-weight:700;border-bottom:1px solid var(--line);letter-spacing:1px;"><span>SCHEME</span><span style="text-align:right">NAV</span><span style="text-align:right">1Y RET</span></div>`;
    items.forEach(m => {
      const navVal = kind === 'ETF' ? (m.price || m.nav || 0) : (m.nav || 0);
      html += `<div style="display:grid;grid-template-columns:2fr 1fr 1fr;padding:10px 12px;border-bottom:1px solid var(--line);align-items:center;"><div><div style="font-size:11px;font-weight:700;color:var(--text);">${m.label}</div><div style="font-size:9px;color:var(--dim);">${m.amc} · ${m.cat || m.type || ''}</div></div><div style="text-align:right;font-size:13px;font-weight:700;">₹${navVal.toFixed(2)}</div><div style="text-align:right;font-size:11px;font-weight:700;color:${retColor(m.ret1y)}">${m.ret1y != null ? (m.ret1y >= 0 ? '+' : '') + m.ret1y.toFixed(1) + '%' : '—'}</div></div>`;
    });
    html += '</div>';
  } else {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;">';
    items.forEach(m => {
      const navVal = kind === 'ETF' ? (m.price || m.nav || 0) : (m.nav || 0);
      html += `<div style="background:var(--bg2);border:1px solid var(--line);padding:14px;"><div style="font-size:9px;color:var(--orange);font-weight:700;letter-spacing:1px;margin-bottom:4px;">${m.amc}</div><div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:10px;">${m.label}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);"><div style="background:var(--bg1);padding:8px;"><span style="font-size:8px;color:var(--muted);display:block;margin-bottom:4px;">NAV</span><b style="font-size:15px;">₹${navVal.toFixed(2)}</b></div><div style="background:var(--bg1);padding:8px;"><span style="font-size:8px;color:var(--muted);display:block;margin-bottom:4px;">1Y RET</span><b style="font-size:15px;color:${retColor(m.ret1y)}">${m.ret1y != null ? (m.ret1y >= 0 ? '+' : '') + m.ret1y.toFixed(1) + '%' : '—'}</b></div></div></div>`;
    });
    html += '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function toggleMFExpand(id) { mfExpanded = (mfExpanded === id) ? '' : id; renderMF(); }

// ── COMMODITIES ──
async function fetchCommodities() {
  const el = document.getElementById('commodities-content'); if (!el) return;
  if (commoditiesData) { renderCommodities(); return; }
  el.innerHTML = `<div style="color:#666;text-align:center;padding:40px;">Loading commodities...</div>`;
  try {
    const res = await fetch('/api/global'); const d = await res.json();
    const usdInrRaw = document.getElementById('m-usdinr')?.textContent || ''; const usdInr = parseFloat(usdInrRaw) || 84;
    commoditiesData = [
      { key: 'GOLD', label: 'GOLD', unit: 'USD/oz', section: 'PRECIOUS METALS', data: d.GOLD, convFn: p => (p * usdInr / 31.1035 * 10), indUnit: '₹/10g' },
      { key: 'SILVER', label: 'SILVER', unit: 'USD/oz', section: 'PRECIOUS METALS', data: d.SILVER, convFn: p => (p * usdInr / 31.1035 * 1000), indUnit: '₹/kg' },
      { key: 'CRUDE', label: 'CRUDE WTI', unit: 'USD/bbl', section: 'ENERGY', data: d.CRUDE, convFn: p => (p * usdInr), indUnit: '₹/bbl' },
      { key: 'NATGAS', label: 'NATURAL GAS', unit: 'USD/MMBtu', section: 'ENERGY', data: d.NATGAS, convFn: p => (p * usdInr), indUnit: '₹/MMBtu' },
      { key: 'COPPER', label: 'COPPER', unit: 'USD/lb', section: 'BASE METALS', data: d.COPPER, convFn: p => (p * 2.20462 * usdInr), indUnit: '₹/kg' },
      { key: 'DXY', label: 'DOLLAR INDEX', unit: 'Index', section: 'FX & MACRO', data: d.DXY, convFn: null, indUnit: '' },
    ];
    renderCommodities();
    const upd = document.getElementById('mcx-last-upd');
    if (upd) { const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }); upd.textContent = 'Updated ' + now + ' IST'; }
  } catch (e) { el.innerHTML = `<div style="color:#ff4444;padding:20px">Error: ${e.message}</div>`; }
}

function forceCommodities() { commoditiesData = null; fetchCommodities(); }

function renderCommodities() {
  const el = document.getElementById('commodities-content'); if (!el || !commoditiesData) return;
  const sectionOrder = ['PRECIOUS METALS', 'ENERGY', 'BASE METALS', 'FX & MACRO'];
  const sections = {};
  commoditiesData.forEach(c => { const sec = c.section || 'OTHER'; if (!sections[sec]) sections[sec] = []; sections[sec].push(c); });
  let html = '<div style="padding:16px;font-family:var(--mono);">';
  sectionOrder.forEach((sec) => {
    const items = sections[sec]; if (!items || !items.length) return;
    html += `<div style="margin-bottom:20px;"><div style="font-size:10px;font-weight:700;color:var(--orange);letter-spacing:1px;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:12px;">${sec}</div><div style="display:grid;grid-template-columns:1fr;gap:1px;background:var(--line);border:1px solid var(--line);">`;
    items.forEach((c) => {
      const p = parseFloat(c.data?.price || 0), pct = parseFloat(c.data?.percent_change || 0);
      const sign = pct >= 0 ? '+' : ''; const cls = pct > 0 ? 'status-up' : pct < 0 ? 'status-dn' : 'status-neutral';
      const hasMcx = c.convFn && p > 0;
      let primaryPrice = '--';
      if (p > 0) { if (hasMcx) { const ip = c.convFn(p); primaryPrice = ip >= 10000 ? '₹' + ip.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '₹' + ip.toFixed(2); } else { primaryPrice = p >= 1000 ? p.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : p.toFixed(2); } }
      html += `<div style="background:var(--bg2);padding:14px;display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:10px;color:var(--muted);font-weight:700;letter-spacing:1px;margin-bottom:2px;">${c.label}</div><div style="font-size:9px;color:var(--dim);">${hasMcx ? c.indUnit : c.unit}</div></div><div style="text-align:right;"><div style="font-size:20px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums">${primaryPrice}</div><div class="status-badge ${cls}" style="display:inline-block;margin-top:4px;">${sign}${pct.toFixed(2)}%</div></div></div>`;
    });
    html += '</div></div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

// ── LOCK-IN ──
async function fetchLockin() {
  if (lockinData) { renderLockin(); return; }
  try { const res = await fetch('/api/lockin'); lockinData = await res.json(); renderLockin(); }
  catch { const el = document.getElementById('lockin-content'); if (el) el.innerHTML = '<div style="color:#ff6666;padding:14px">Lock-in feed unavailable.</div>'; }
}

function renderLockin() {
  const el = document.getElementById('lockin-content'); if (!el) return;
  const events = lockinData?.events || [];
  if (!events.length) { el.innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center;font-size:11px;font-family:var(--mono);">No upcoming lock-in events detected.</div>'; return; }
  const grouped = {};
  events.forEach(x => { const d = x.date ? new Date(x.date) : null; const k = d && !isNaN(d) ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'UNDATED'; if (!grouped[k]) grouped[k] = []; grouped[k].push(x); });
  let html = '<div style="padding:16px;font-family:var(--mono);">';
  Object.entries(grouped).forEach(([date, list]) => {
    html += `<div style="margin-bottom:20px;"><div style="font-size:10px;font-weight:700;color:var(--orange);letter-spacing:1px;border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:12px;">${date.toUpperCase()}</div><div style="display:grid;gap:1px;background:var(--line);border:1px solid var(--line);">`;
    list.forEach(item => {
      const days = Number(item.daysLeft);
      const countdown = Number.isFinite(days) ? (days < 0 ? `${Math.abs(days)}d ago` : days === 0 ? 'TODAY' : `${days}d left`) : '--';
      const impactCls = item.impact === 'High' ? 'status-dn' : item.impact === 'Medium' ? 'status-up' : 'status-neutral';
      html += `<div style="background:var(--bg2);padding:14px;display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:12px;font-weight:700;color:var(--text);">${item.company}</div><div style="font-size:9px;color:var(--muted);margin-top:4px;">${item.event} · ${countdown}</div></div><div style="text-align:right"><div class="status-badge ${impactCls}" style="display:inline-block;">${item.impact || 'LOW'}</div></div></div>`;
    });
    html += '</div></div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

// ── EVENTS CALENDAR ──────────────────────────────────────────
let eventsState = {
  data: null,
  impact: null,
  filter: 'all',
  lastFetch: 0
};

async function fetchEvents() {
  try {
    const [dRes, iRes] = await Promise.all([
      fetch('/api/events').then(r => r.json()),
      fetch('/api/events/impact').then(r => r.json())
    ]);
    eventsState.data = dRes;
    eventsState.impact = iRes;
    eventsState.lastFetch = Date.now();
    renderEventsStrip();
    if (currentRP === 'events') renderEventsPanel();
  } catch (e) {
    console.error('Events fetch error:', e);
  }
}

function renderEventsStrip() {
  const container = document.getElementById('events-strip-items');
  if (!container) return;
  if (!eventsState.data || !eventsState.data.next3) {
    container.innerHTML = '<div style="color:var(--dim);font-size:10px;padding:0 16px;">Loading events...</div>';
    return;
  }
  
  const iconMap = {
    rbi: 'RBI', fomc: 'FED', expiry: 'EXP', msci: 'MSCI',
    budget: 'BUDG', earnings_season: 'EARN', holiday: 'HOL'
  };

  let html = '';
  eventsState.data.next3.forEach(ev => {
    let cdHtml = '';
    if (ev.urgency === 'today') cdHtml = 'TODAY';
    else if (ev.urgency === 'imminent') cdHtml = ev.daysUntil === 1 ? 'TOMORROW' : `${ev.hoursUntil || 0} HRS`;
    else cdHtml = `${ev.daysUntil} DAYS`;
    
    html += `
      <div class="event-strip-item urgency-${ev.urgency}">
        <span class="esi-category">${iconMap[ev.category] || 'EVT'}</span>
        <span class="esi-title" title="${ev.title}">${ev.title}</span>
        <span class="esi-countdown urgency-${ev.urgency}">${cdHtml}</span>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function setEventsFilter(cat) {
  eventsState.filter = cat;
  renderEventsPanel();
}

function renderEventsPanel() {
  const banner = document.getElementById('events-impact-banner');
  const filterRow = document.getElementById('events-filter-row');
  const list = document.getElementById('events-list');
  if (!banner || !filterRow || !list || !eventsState.data || !eventsState.impact) return;

  // Banner
  const imp = eventsState.impact;
  let bg = 'var(--bg1)';
  if (imp.eventDensity === 'critical week') bg = 'rgba(255,51,51,0.1)';
  else if (imp.eventDensity === 'busy') bg = 'rgba(230,184,74,0.1)';
  else if (imp.eventDensity === 'normal') bg = 'rgba(255,255,255,0.03)';
  
  banner.style.background = bg;
  banner.innerHTML = `<strong>MARKET RADAR:</strong> ${imp.headline}`;

  // Filters
  const filters = [
    { id: 'all', label: 'ALL' },
    { id: 'rbi', label: 'RBI' },
    { id: 'fomc', label: 'FED' },
    { id: 'expiry', label: 'EXPIRY' },
    { id: 'msci', label: 'MSCI' },
    { id: 'budget', label: 'BUDGET' },
    { id: 'earnings_season', label: 'EARNINGS' },
    { id: 'holiday', label: 'HOLIDAYS' }
  ];
  
  filterRow.innerHTML = filters.map(f => 
    `<button class="event-filter-chip ${eventsState.filter === f.id ? 'active' : ''}" onclick="setEventsFilter('${f.id}')">${f.label}</button>`
  ).join('');

  // List
  let events = eventsState.data.upcoming;
  if (eventsState.filter !== 'all') {
    events = events.filter(e => e.category === eventsState.filter);
  }
  
  if (events.length === 0) {
    list.innerHTML = '<div style="color:var(--dim);font-size:12px;padding:20px;text-align:center;">No upcoming events in this category.</div>';
    return;
  }
  
  const iconMap = { rbi: 'RBI', fomc: 'FED', expiry: 'EXPIRY', msci: 'MSCI', budget: 'BUDGET', earnings_season: 'EARNINGS', holiday: 'HOLIDAY' };
  
  let html = '';
  events.forEach(ev => {
    let cdHtml = '';
    if (ev.urgency === 'today') cdHtml = 'TODAY';
    else if (ev.urgency === 'imminent') cdHtml = ev.daysUntil === 1 ? 'TOMORROW' : `${ev.hoursUntil || 0} HRS`;
    else cdHtml = `IN ${ev.daysUntil} DAYS`;
    
    let dtObj = new Date(`${ev.date}T${ev.time || '00:00'}:00+05:30`);
    let dtStr = dtObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
    if (ev.time) dtStr += ` · ${ev.time} IST`;
    
    html += `
      <div class="event-card urgency-${ev.urgency} impact-${ev.impact}">
        <div class="ec-header">
          <span class="ec-cat">${iconMap[ev.category] || ev.category}</span>
          <span class="ec-impact ${ev.impact}">${ev.impact} IMPACT</span>
        </div>
        <div class="ec-title">${ev.title}</div>
        <div class="ec-date">${dtStr}</div>
        <div class="ec-countdown urgency-${ev.urgency}">${cdHtml}</div>
        <div class="ec-note">${ev.note}</div>
      </div>
    `;
  });
  list.innerHTML = html;
}

function startEventCountdownTick() {
  setInterval(() => {
    if (!eventsState.data) return;
    renderEventsStrip();
    if (currentRP === 'events') renderEventsPanel();
  }, 60000);
}

// ── EARNINGS CALENDAR ──
const EARNINGS = [
  { date: '07 Apr', company: 'TCS', sym: 'TCS', est: 'Rev $7.1B', period: 'Q4 FY26', sector: 'IT' },
  { date: '10 Apr', company: 'Infosys', sym: 'INFY', est: 'Rev $4.8B', period: 'Q4 FY26', sector: 'IT' },
  { date: '14 Apr', company: 'HDFC Bank', sym: 'HDFCBANK', est: 'NII ₹31,400Cr', period: 'Q4 FY26', sector: 'BANK' },
  { date: '15 Apr', company: 'ICICI Bank', sym: 'ICICIBANK', est: 'NII ₹21,600Cr', period: 'Q4 FY26', sector: 'BANK' },
  { date: '19 Apr', company: 'Reliance Industries', sym: 'RELIANCE', est: 'EBITDA ₹47,000Cr', period: 'Q4 FY26', sector: 'ENERGY' },
  { date: '25 Apr', company: 'SBI', sym: 'SBIN', est: 'NII ₹42,000Cr', period: 'Q4 FY26', sector: 'BANK' },
  { date: '28 Apr', company: 'Tata Motors', sym: 'TATAMOTORS', est: 'Rev ₹1,22,000Cr', period: 'Q4 FY26', sector: 'AUTO' },
  { date: '05 May', company: 'Sun Pharma', sym: 'SUNPHARMA', est: 'Rev ₹14,200Cr', period: 'Q4 FY26', sector: 'PHARMA' },
];

function renderEarnings() {
  const el = document.getElementById('earnings-content'); if (!el) return;
  const grouped = {}; EARNINGS.forEach(e => { if (!grouped[e.date]) grouped[e.date] = []; grouped[e.date].push(e); });
  const today = new Date(); let html = '';
  Object.entries(grouped).forEach(([date, items]) => {
    const d = new Date(date + ' 2026');
    const isPast = d < today; const isToday = d.toDateString() === today.toDateString();
    html += `<div style="margin-bottom:16px"><div style="font-size:10px;color:var(--dim);margin-bottom:8px;display:flex;align-items:center;gap:8px">${date.toUpperCase()}${isToday ? '<span style="color:var(--orange)">[TODAY]</span>' : ''}</div>`;
    items.forEach(e => {
      html += `<div style="background:var(--bg2);border:1px solid var(--line2);border-left:2px solid var(--orange);padding:12px;margin-bottom:6px;opacity:${isPast ? 0.5 : 1}"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><b style="font-size:13px;color:var(--text)">${e.company}</b><span style="font-size:10px;color:var(--muted)">${e.period}</span></div><div style="display:flex;justify-content:space-between;font-size:11px;"><span style="color:var(--muted)">${e.sym} · ${e.sector}</span><b style="color:var(--text)">${e.est}</b></div></div>`;
    });
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
  return { net: null, date: '' };
}
function processFiiDii(data) {
  try {
    if (!data) return; fiiDiiData = data;
    const fiiLatest = pickLatestFlowEntry(fiiDiiData, 'fii'); const diiLatest = pickLatestFlowEntry(fiiDiiData, 'dii');
    const today = { fii_net: fiiLatest.net, dii_net: diiLatest.net, date: fiiLatest.date || diiLatest.date || '' };
    const fiiEl = document.getElementById('m-fii'); const diiEl = document.getElementById('m-dii');
    if (fiiEl) { if (Number.isFinite(today.fii_net)) { const v = today.fii_net; const sign = v >= 0 ? '+' : ''; fiiEl.textContent = sign + '₹' + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' Cr'; fiiEl.className = 'mv ' + (v >= 0 ? 'up' : 'dn'); } else { fiiEl.textContent = 'Awaiting NSE EOD'; fiiEl.className = 'mv'; } }
    if (diiEl) { if (Number.isFinite(today.dii_net)) { const v = today.dii_net; const sign = v >= 0 ? '+' : ''; diiEl.textContent = sign + '₹' + Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' Cr'; diiEl.className = 'mv ' + (v >= 0 ? 'up' : 'dn'); } else { diiEl.textContent = 'Awaiting NSE EOD'; diiEl.className = 'mv'; } }
  } catch (e) { console.warn('FII/DII processing failed:', e.message); }
}

function animateCollection(selector, options = {}) {
  const nodes = document.querySelectorAll(selector);
  nodes.forEach(n => { n.style.opacity = '1'; n.style.transform = 'none'; });
}

// FOCUS MODE
let dalalFocusMode = false;

function applyDalalFocusMode() {
  document.body.classList.toggle('dalal-focus-mode', dalalFocusMode);
  document.getElementById('bb')?.classList.toggle('dalal-focus-mode', dalalFocusMode);
  const btn = document.getElementById('dw-focus-toggle');
  if (btn) { btn.textContent = dalalFocusMode ? 'EXIT FOCUS' : 'TERMINAL FOCUS'; btn.classList.toggle('is-active', dalalFocusMode); }
}

function toggleDalalFocusMode(force) {
  dalalFocusMode = typeof force === 'boolean' ? force : !dalalFocusMode;
  applyDalalFocusMode();
}
window.toggleDalalFocusMode = toggleDalalFocusMode;

// ── LAYOUT SAVE/RESTORE ──
function saveLayout() { localStorage.setItem('dw-layout', JSON.stringify({ cat: currentCat, rp: currentRP, ticker: currentTicker })); }
function restoreLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem('dw-layout') || '{}');
    const cat = saved.cat || 'market';
    let rp = saved.rp || 'detail';
    if (rp === 'charts' || rp === 'earnings') rp = 'detail'; // safe fallback
    const validSavedRPs = new Set(['detail', 'advice', 'global', 'heatmap', 'mf', 'commodities', 'lockin', 'feargreed', 'sop', 'compare', 'events']);
    if (!validSavedRPs.has(rp)) rp = 'detail';
    currentCat = cat;
    currentRP = rp;
    if (saved.ticker) currentTicker = saved.ticker;
    // Update chip active state
    document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active-chip', c.textContent.toLowerCase() === cat));
    // Update tab active state
    document.querySelectorAll('.rp-tab').forEach(t => t.classList.toggle('active-rp-tab', t.dataset.rp === rp));
  } catch (e) { }
}

// ── KEYBOARD SHORTCUTS ──
function initTabScroll() {
  const tabs = document.getElementById('rp-tabs');
  const arrow = document.getElementById('rp-tabs-arrow');
  const container = document.getElementById('rp-tabs-container');
  if (!tabs || !arrow || !container) return;

  updateArrowVisibility = function () {
    const hasOverflow = tabs.scrollWidth > tabs.clientWidth;
    const atEnd = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 4;
    const atStart = tabs.scrollLeft > 4;

    if (hasOverflow && !atEnd) {
      arrow.classList.add('visible');
      arrow.setAttribute('aria-label', 'Scroll tabs right');
    } else {
      arrow.classList.remove('visible');
      arrow.setAttribute('aria-label', 'Scroll tabs to start');
    }

    if (atStart) container.classList.add('scrolled-left');
    else container.classList.remove('scrolled-left');
  };

  tabs.addEventListener('scroll', updateArrowVisibility);
  window.addEventListener('resize', updateArrowVisibility);
  updateArrowVisibility();
}

function scrollTabsRight() {
  const tabs = document.getElementById('rp-tabs');
  if (!tabs) return;

  const tabEls = tabs.querySelectorAll('.rp-tab');
  const tabsRight = tabs.getBoundingClientRect().right;

  let targetTab = null;
  for (const tab of tabEls) {
    const rect = tab.getBoundingClientRect();
    if (rect.right > tabsRight - 4) {
      targetTab = tab;
      break;
    }
  }

  if (targetTab) {
    tabs.scrollTo({
      left: targetTab.offsetLeft - 8,
      behavior: 'smooth'
    });
  } else {
    tabs.scrollTo({ left: 0, behavior: 'smooth' });
  }

  setTimeout(() => {
    if (updateArrowVisibility) updateArrowVisibility();
  }, 350);
}
window.scrollTabsRight = scrollTabsRight;

const KEY_HELP = [['R','Refresh news'],['M','Market'],['B','Banks'],['S','Sectors'],['A','Macro'],['T','Stocks'],['G','Global'],['C','Compare views'],['P','SOP brief'],['1','Story'],['2','Advice'],['3','Global markets'],['4','Heatmap'],['5','MF/ETF'],['6','Commodities'],['7','Lock-in'],['8','Sentiment'],['?','Help']];
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
  if (e.key === 'Escape') {
    if (helpVisible) { toggleHelp(); return; }
    if (dalalFocusMode) { toggleDalalFocusMode(false); return; }
    const q = document.getElementById('q-input'); if (q && q.value) { q.value = ''; loadCategory(currentCat); return; }
    if (activeIdx >= 0) { clearDetail(); return; }
    return;
  }
  if (e.key === '?' && !inInput) { toggleHelp(); return; }
  if (inInput) return;
  const catMap = { m: 'market', b: 'banks', s: 'sectors', a: 'macro', t: 'stocks', g: 'global' };
  if (catMap[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) { loadCategory(catMap[e.key.toLowerCase()]); return; }
  if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) { switchRP('compare'); return; }
  if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) { switchRP('sop'); return; }
  if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) { refreshNews(); return; }
  const rpMap = { '1': 'detail', '2': 'advice', '3': 'global', '4': 'heatmap', '5': 'mf', '6': 'commodities', '7': 'lockin', '8': 'feargreed' };
  if (rpMap[e.key]) { switchRP(rpMap[e.key]); return; }
  if (e.key === '/') { e.preventDefault(); document.getElementById('q-input')?.focus(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); const len = currentStories.length; if (!len) return;
    if (e.key === 'ArrowDown') activeIdx = Math.min(activeIdx + 1, len - 1);
    else activeIdx = Math.max(activeIdx - 1, 0);
    showDetail(activeIdx);
    const items = document.querySelectorAll('.nl'); if (items[activeIdx]) items[activeIdx].scrollIntoView({ block: 'nearest' });
    return;
  }
});

function applyBridgeLaunchState() {
  const params = new URLSearchParams(window.location.search); if (!params.toString()) return;
  const nextCat = (params.get('cat') || '').trim().toLowerCase();
  const nextRP = (params.get('rp') || '').trim().toLowerCase();
  const validCats = new Set(['market', 'banks', 'sectors', 'macro', 'stocks', 'global']);
  const validRPs = new Set(['detail', 'advice', 'global', 'heatmap', 'mf', 'commodities', 'lockin', 'feargreed', 'sop', 'compare', 'events']);
  if (validCats.has(nextCat)) currentCat = nextCat;
  if (validRPs.has(nextRP)) currentRP = nextRP;
  if (params.toString()) { window.history.replaceState({}, '', window.location.pathname); }
}

// ── INIT — FIXED BOOT SEQUENCE ──
let indicesFastFetching = false; let dashboardSlowFetching = false;
let refreshCountdown = 30;
const DASHBOARD_HEALTH_KEYS = ['NIFTY:NSE', 'SENSEX:BSE', 'BANKNIFTY:NSE'];

function applyDashboardHealthLabel(quotes = {}) {
  const lu = document.getElementById('last-updated'); if (!lu) return;
  const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  const staleCount = DASHBOARD_HEALTH_KEYS.filter(k => quotes[k]?.stale).length;
  const label = staleCount === DASHBOARD_HEALTH_KEYS.length ? 'FALLBACK ' : staleCount > 0 ? 'PARTIAL ' : 'UPDATED ';
  lu.textContent = label + now + ' IST';
  lu.style.color = staleCount === DASHBOARD_HEALTH_KEYS.length ? '#ff9900' : staleCount > 0 ? '#d7b36b' : '#7fd5ff';
}

function scheduleDashboardSlowLoad(delay = 200) {
  setTimeout(() => { fetchDashboardSlowData(); }, delay);
}

async function fetchIndicesFastData() {
  if (indicesFastFetching) return; indicesFastFetching = true;
  if (indicesFastController) { try { indicesFastController.abort(); } catch {} }
  const controller = new AbortController(); indicesFastController = controller;
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch('/api/indices-fast', { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const fast = await res.json();
    const quotes = fast?.indices || {};
    dashStore = { ...(dashStore || {}), quotes: { ...(dashStore?.quotes || {}), ...quotes }, fastTs: fast?.ts };
    processLivePrices(quotes);
    renderApp();
    applyDashboardHealthLabel(dashStore.quotes || {});
    fetchGlobal();
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error('Fast indices error:', e.message);
    const lu = document.getElementById('last-updated'); if (lu) { lu.textContent = 'CONNECTION ERROR'; lu.style.color = '#ff4444'; }
  } finally {
    clearTimeout(timeout);
    if (indicesFastController === controller) indicesFastController = null;
    indicesFastFetching = false;
    refreshCountdown = 30;
    const sr = document.getElementById('sb-refresh'); if (sr) { sr.textContent = 'REFRESH IN 30s'; sr.style.color = '#444'; }
  }
}

async function fetchDashboardSlowData() {
  if (dashboardSlowFetching) return; dashboardSlowFetching = true;
  if (dashboardSlowController) { try { dashboardSlowController.abort(); } catch {} }
  const controller = new AbortController(); dashboardSlowController = controller;
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const res = await fetch('/api/dashboard-slow', { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const slow = await res.json();
    dashStore = { ...(dashStore || {}), fiiDii: slow?.fiiDii || dashStore?.fiiDii, slowTs: slow?.ts };
    const macroQuotes = {};
    if (slow?.macro?.usdinr) macroQuotes['USD/INR:Forex'] = slow.macro.usdinr;
    if (slow?.macro?.gold) macroQuotes['XAU/USD:Forex'] = slow.macro.gold;
    if (slow?.macro?.crude) macroQuotes['WTI:Commodity'] = slow.macro.crude;
    if (slow?.macro?.gsec) macroQuotes['IN10Y:Bond'] = slow.macro.gsec;
    if (Object.keys(macroQuotes).length) { dashStore.quotes = { ...(dashStore?.quotes || {}), ...macroQuotes }; processLivePrices(macroQuotes); }
    processFiiDii(slow?.fiiDii || null);
    processMiniVix({ vix: slow?.vix?.series, gsec: slow?.macro?.gsecDaily, spot: { vix: slow?.vix?.spot?.price, gsec: slow?.macro?.gsec?.price }, meta: { vix: slow?.vix?.status, gsec: { tag: 'DELAYED 15M', source: 'Yahoo Finance India 10Y' } } });
    renderApp();
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error('Slow dashboard error:', e.message);
  } finally {
    clearTimeout(timeout);
    if (dashboardSlowController === controller) dashboardSlowController = null;
    dashboardSlowFetching = false;
  }
}

function fetchDashboardData() { return fetchIndicesFastData(); }

async function fetchMacroContext() {
  try {
    const res = await fetch('/api/macro-context');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Macro context unavailable');
    macroContext = data;
    applyMacroContextBadges();
  } catch (e) {
    console.warn('Macro context error:', e.message);
  }
}

function manualRefresh() {
  refreshCountdown = 30;
  const el = document.getElementById('sb-refresh');
  if (el) { el.innerHTML = '<span style="display:inline-block;margin-right:4px">↻</span>REFRESHING...'; el.style.color = '#ff6600'; }
  fetchIndicesFastData();
  scheduleDashboardSlowLoad(200);
  fetchMacroContext();
}

function startFastRefreshInterval() {
  if (fastRefreshTimer) clearInterval(fastRefreshTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  fastRefreshTimer = setInterval(() => {
    refreshCountdown = 30;
    fetchDashboardData();
  }, 30000);
  countdownTimer = setInterval(() => {
    refreshCountdown = Math.max(0, refreshCountdown - 1);
    const el = document.getElementById('sb-refresh');
    if (el) {
      el.innerHTML = `<span style="display:inline-block;margin-right:4px">â†»</span>REFRESH IN ${refreshCountdown}s`;
      el.style.color = refreshCountdown <= 5 ? '#ff9900' : '#444';
    }
  }, 1000);
}

function startSlowRefreshInterval() {
  if (slowRefreshTimer) clearInterval(slowRefreshTimer);
  slowRefreshTimer = setInterval(() => {
    fetchDashboardSlowData();
    fetchMacroContext();
    if (currentRP === 'sop') fetchSOPData();
  }, 60000);
}

// ── BOOT SEQUENCE — FIXED ──
async function init() {
  // FIX 1: Warm auth token BEFORE any API call
  await getDalalToken().catch(() => {});

  // Native scrolling for internal panels is used instead of Lenis to avoid event hijacking.

  try {
    // Restore layout state
    restoreLayout();
    applyBridgeLaunchState();
    applyDalalFocusMode();
    restoreSopSliders();
    initSopControls();
    initTabScroll();

    // Show initial panel
    const startRP = currentRP || 'detail';
    switchRP(['charts','earnings'].includes(startRP) ? 'detail' : startRP, { fetchAdviceOnOpen: false });

    isStartupBoot = false;

    // FIX 3: Explicitly load news — this is the primary fix for blank news panel
    loadCategory(currentCat);
    fetchEvents();
    startEventCountdownTick();
    setInterval(fetchEvents, 300000);
    fetchIndicesFastData();
    scheduleDashboardSlowLoad(200);
    fetchMacroContext();
    startFastRefreshInterval();
    startSlowRefreshInterval();

  } catch (e) {
    console.error('Boot error:', e);
    isStartupBoot = false;
    loadCategory('market');
    startFastRefreshInterval();
    startSlowRefreshInterval();
  }
}

// Initial render before data arrives
restoreSopSliders();
setHeadlinesEmptyState('Loading market news...', 'Connecting to live feeds.');
renderApp();
renderHeadlines(true);

// Start boot
init();

// Legacy refresh timers moved into init().
/*
// Refresh countdown timer
setInterval(() => {
  refreshCountdown--;
  const el = document.getElementById('sb-refresh');
  if (refreshCountdown <= 0) {
    refreshCountdown = 30;
    if (el) { el.innerHTML = `<span style="display:inline-block;margin-right:4px">↻</span>REFRESHING...`; el.style.color = '#ff6600'; }
    fetchDashboardData();
  } else {
    if (el) { el.innerHTML = `<span style="display:inline-block;margin-right:4px">↻</span>REFRESH IN ${refreshCountdown}s`; el.style.color = refreshCountdown <= 5 ? '#ff9900' : '#444'; }
  }
}, 1000);

// Slow data refresh every 60s
setInterval(() => {
  fetchDashboardSlowData();
  if (sopState.data || currentRP === 'sop') fetchSOPData();
}, 60000);
*/
