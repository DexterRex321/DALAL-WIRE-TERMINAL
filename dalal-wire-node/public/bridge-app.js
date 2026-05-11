// ── BRIDGE AUTH ──────────────────────────────────────────────
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

async function apiFetch(url) {
  const token = await getDalalToken();
  const res = await fetch(url, { headers: { 'x-dalal-token': token } });
  if (res.status === 401) {
    dToken = null;
    const newToken = await getDalalToken();
    return fetch(url, { headers: { 'x-dalal-token': newToken } }).then(r => r.json());
  }
  return res.json();
}

// Token rotation
setInterval(async () => { dToken = null; await getDalalToken(); }, 14 * 60 * 1000);

// ── CLOCK ───────────────────────────────────────────────────
function tickClock() {
  const el = document.getElementById('bridge-clock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Kolkata'
  }) + ' IST';
}
setInterval(tickClock, 1000);
tickClock();

// ── NAVIGATION ──────────────────────────────────────────────
function navigate(e, url) {
  e.preventDefault();
  window.location.href = url;
}

// Nav panel toggle
document.addEventListener('click', e => {
  const p = document.getElementById('nav-panel');
  const w = document.getElementById('nav-widget');
  if (p && w && !w.contains(e.target)) p.classList.remove('open');
});

// ── SIGNAL BAR ──────────────────────────────────────────────
const POLL_MS = 30_000;
let signalData = null;

async function fetchBridgeSignal() {
  try {
    const data = await apiFetch('/api/bridge-signal');
    signalData = data;
    renderBridgeSignal(data);
  } catch (e) {
    console.error('Bridge signal fetch error:', e);
    // Never show broken state — keep last data
    if (!signalData) {
      renderBridgeSignalFallback();
    }
  }
}

function renderBridgeSignal(data) {
  // Score
  const scoreEl = document.getElementById('signal-score');
  if (scoreEl) scoreEl.textContent = data.score;

  // Score color
  if (scoreEl) {
    if (data.score >= 65) scoreEl.style.color = 'var(--green)';
    else if (data.score <= 35) scoreEl.style.color = 'var(--red)';
    else scoreEl.style.color = 'var(--gold)';
  }

  // Label
  const labelEl = document.getElementById('signal-label');
  if (labelEl) {
    labelEl.textContent = data.label;
    if (data.bias === 'BULLISH') labelEl.style.color = 'var(--green)';
    else if (data.bias === 'BEARISH') labelEl.style.color = 'var(--red)';
    else labelEl.style.color = 'var(--gold)';
  }

  // Reason
  const reasonEl = document.getElementById('signal-reason');
  if (reasonEl) reasonEl.textContent = data.dominantReason;

  // Bar border + tint
  const bar = document.getElementById('signal-bar');
  if (bar) {
    if (data.bias === 'BULLISH') {
      bar.style.borderBottomColor = 'var(--green)';
      bar.style.background = 'rgba(16,185,129,0.04)';
    } else if (data.bias === 'BEARISH') {
      bar.style.borderBottomColor = 'var(--red)';
      bar.style.background = 'rgba(239,68,68,0.04)';
    } else {
      bar.style.borderBottomColor = 'var(--gold)';
      bar.style.background = 'var(--bg1)';
    }
  }

  // Factors
  const factorsEl = document.getElementById('signal-factors');
  if (factorsEl && data.factors) {
    factorsEl.innerHTML = data.factors.map(f => {
      const sign = f.direction === 'positive' ? '+' : f.direction === 'negative' ? '−' : '~';
      return `<span class="signal-factor-pill ${f.direction}">${sign}${f.impact} ${f.label}</span>`;
    }).join('');
  }

  // Event pill
  const eventPill = document.getElementById('signal-event-pill');
  if (eventPill) {
    if (data.nearestEvent && data.nearestEvent.daysUntil <= 3) {
      const cat = (data.nearestEvent.category || '').toUpperCase();
      const days = data.nearestEvent.daysUntil === 0 ? 'TODAY'
        : data.nearestEvent.daysUntil === 1 ? 'TOMORROW'
        : `in ${data.nearestEvent.daysUntil} DAYS`;
      eventPill.textContent = `${cat} ${data.nearestEvent.title} ${days}`;
      eventPill.classList.add('visible');
    } else {
      eventPill.classList.remove('visible');
    }
  }

  // CTA
  const cta = document.getElementById('signal-cta');
  if (cta) {
    if (data.label === 'HIGH SIGNAL DAY') {
      cta.textContent = 'OPEN TERMINAL — NOW →';
    } else {
      cta.textContent = 'OPEN TERMINAL →';
    }
  }

  // Freshness indicator on score label
  const scoreLabelEl = document.getElementById('signal-score-label');
  if (scoreLabelEl) {
    if (data.freshness === 'PARTIAL') {
      scoreLabelEl.textContent = 'SIGNAL ◐';
    } else if (data.freshness === 'FALLBACK') {
      scoreLabelEl.textContent = 'SIGNAL ○';
    } else {
      scoreLabelEl.textContent = 'SIGNAL';
    }
  }
}

function renderBridgeSignalFallback() {
  const scoreEl = document.getElementById('signal-score');
  if (scoreEl) { scoreEl.textContent = '--'; scoreEl.style.color = 'var(--dim)'; }
  const labelEl = document.getElementById('signal-label');
  if (labelEl) { labelEl.textContent = 'CONNECTING'; labelEl.style.color = 'var(--dim)'; }
  const reasonEl = document.getElementById('signal-reason');
  if (reasonEl) reasonEl.textContent = 'Waiting for market data...';
}

// ── BOOT ────────────────────────────────────────────────────
async function init() {
  await getDalalToken().catch(() => {});
  await fetchBridgeSignal();
  setInterval(fetchBridgeSignal, POLL_MS);
}

init();
