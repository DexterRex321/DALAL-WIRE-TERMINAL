const buildVariant = (() => {
  try {
    return import.meta.env?.VITE_VARIANT || 'full';
  } catch {
    return 'full';
  }
})();

const KNOWN_VARIANTS = ['tech', 'full', 'finance', 'happy', 'commodity'] as const;
type SiteVariant = typeof KNOWN_VARIANTS[number];

const FINANCE_PRESET_STORAGE_KEY = 'worldmonitor-finance-preset';
const KNOWN_FINANCE_PRESETS = ['dalal', 'default'] as const;
type FinancePreset = typeof KNOWN_FINANCE_PRESETS[number];

function isKnownVariant(value: string | null): value is SiteVariant {
  return KNOWN_VARIANTS.includes(value as SiteVariant);
}

function isKnownFinancePreset(value: string | null): value is FinancePreset {
  return KNOWN_FINANCE_PRESETS.includes(value as FinancePreset);
}

function readRequestedVariant(): SiteVariant | null {
  if (typeof window === 'undefined') return null;
  const requested = new URLSearchParams(window.location.search).get('variant');
  return isKnownVariant(requested) ? requested : null;
}

function readRequestedFinancePreset(): FinancePreset | null {
  if (typeof window === 'undefined') return null;
  const requested = new URLSearchParams(window.location.search).get('preset');
  return isKnownFinancePreset(requested) ? requested : null;
}

export const SITE_VARIANT: SiteVariant = (() => {
  if (typeof window === 'undefined') return buildVariant as SiteVariant;

  const requestedVariant = readRequestedVariant();
  if (requestedVariant) {
    localStorage.setItem('worldmonitor-variant', requestedVariant);
    return requestedVariant;
  }

  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (isTauri) {
    const stored = localStorage.getItem('worldmonitor-variant');
    if (isKnownVariant(stored)) return stored;
    return buildVariant as SiteVariant;
  }

  const h = location.hostname;
  if (h.startsWith('tech.')) return 'tech';
  if (h.startsWith('finance.')) return 'finance';
  if (h.startsWith('happy.')) return 'happy';
  if (h.startsWith('commodity.')) return 'commodity';

  if (h === 'localhost' || h === '127.0.0.1') {
    const stored = localStorage.getItem('worldmonitor-variant');
    if (isKnownVariant(stored)) return stored;
    return buildVariant as SiteVariant;
  }

  return 'full';
})();

export const FINANCE_PRESET: FinancePreset = (() => {
  if (typeof window === 'undefined') return 'dalal';

  const requestedPreset = readRequestedFinancePreset();
  if (requestedPreset) {
    localStorage.setItem(FINANCE_PRESET_STORAGE_KEY, requestedPreset);
    return requestedPreset;
  }

  const storedPreset = localStorage.getItem(FINANCE_PRESET_STORAGE_KEY);
  if (isKnownFinancePreset(storedPreset)) return storedPreset;

  return SITE_VARIANT === 'finance' ? 'dalal' : 'default';
})();

export const FINANCE_PRESET_APPLY_KEY = 'worldmonitor-finance-preset-applied';
