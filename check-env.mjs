/**
 * scripts/check-env.mjs
 * Run: npm run check:env
 * Validates that all required env variables are set correctly before launch
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const ROOT = process.cwd();

// Try to load .env manually for checking
let envVars = {};
try {
  const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
  raw.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    envVars[key] = val;
  });
} catch {
  console.error('  ✗ No .env file found');
  console.error('  → Copy .env.example to .env and fill in your values\n');
  process.exit(1);
}

const checks = [];

function check(label, condition, fix) {
  checks.push({ label, pass: condition, fix });
}

// ── Required checks ───────────────────────────────────────────
check(
  'PORT is set',
  Boolean(envVars.PORT),
  'Add PORT=3000 to .env'
);

check(
  'API_SECRET is set',
  Boolean(envVars.API_SECRET) && envVars.API_SECRET !== 'REPLACE_WITH_OUTPUT_OF_CRYPTO_COMMAND',
  'Run: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" and paste into API_SECRET'
);

check(
  'API_SECRET is strong (≥32 chars)',
  (envVars.API_SECRET || '').length >= 32,
  'Regenerate API_SECRET — it should be 64 hex characters long'
);

check(
  'ALLOWED_ORIGINS is set',
  Boolean(envVars.ALLOWED_ORIGINS),
  'Set ALLOWED_ORIGINS=http://localhost:3000 for local dev'
);

check(
  'No leaked TwelveData key',
  !envVars.TWELVE_DATA_KEY,
  'Remove TWELVE_DATA_KEY from .env — not used in v2'
);

check(
  'No leaked Newsdata key in plain text that looks like old key',
  !envVars.NEWSDATA_KEY || envVars.NEWSDATA_KEY !== 'pub_b0333cb8c3094fa2a3e10c20c2f5f5d1',
  'Rotate NEWSDATA_KEY — this key was exposed in render.yaml. Get a new one at newsdata.io'
);

// ── Dhan checks (only if feature enabled) ────────────────────
if (envVars.FEATURE_DHAN_API === 'true') {
  check(
    'DHAN_CLIENT_ID is set (FEATURE_DHAN_API=true)',
    Boolean(envVars.DHAN_CLIENT_ID),
    'Add your Dhan Client ID from dhanhq.co → My Profile → API & App'
  );

  check(
    'DHAN_ACCESS_TOKEN is set (FEATURE_DHAN_API=true)',
    Boolean(envVars.DHAN_ACCESS_TOKEN),
    'Add your Dhan Access Token. Note: it expires every 30 days'
  );

  check(
    'DHAN_API_BASE is correct',
    envVars.DHAN_API_BASE === 'https://api.dhan.co',
    'Set DHAN_API_BASE=https://api.dhan.co'
  );
}

// ── Old/outdated key checks ───────────────────────────────────
check(
  'No TwelveData references remaining',
  !envVars.TWELVE_DATA_KEY && !envVars.TWELVEDATA_KEY,
  'TwelveData is not used in v2. Remove any TWELVE_DATA_KEY entries.'
);

// ── Print results ─────────────────────────────────────────────
console.log('\n  DALAL WIRE — ENV CHECK\n');

let passed = 0, failed = 0;
checks.forEach(({ label, pass, fix }) => {
  if (pass) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}`);
    console.log(`     → ${fix}\n`);
    failed++;
  }
});

console.log(`\n  ${passed} passed · ${failed} failed\n`);

if (failed > 0) {
  console.log('  Fix the issues above before starting the server.\n');
  process.exit(1);
} else {
  console.log('  All checks passed — you are good to go.\n');
  process.exit(0);
}
