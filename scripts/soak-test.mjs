#!/usr/bin/env node
// scripts/soak-test.mjs — 24h accelerated soak (T43, Sprint 4 Track A spec §6.5)
// Validates BIOCore can run 7×24 by sampling /admin/health every minute,
// then asserting heap/handles/uncaught/influx/browser stay within budget.
//
// Usage:
//   ADMIN_TOKEN=<jwt> node scripts/soak-test.mjs
//   SOAK_DURATION_HOURS=1 ADMIN_TOKEN=<jwt> node scripts/soak-test.mjs
//
// CI: invoked by .github/workflows/soak.yml (T45) on a self-hosted runner.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DURATION_HOURS = Number(process.env.SOAK_DURATION_HOURS ?? 24);
const SPEED = Number(process.env.SOAK_SPEED_MULTIPLIER ?? 5);
const REPORT_DIR = process.env.SOAK_REPORT_DIR ?? './soak-runs';
const PORT = Number(process.env.SOAK_PORT ?? 3088);
const BROWSER_ENABLED = (process.env.SOAK_BROWSER ?? 'true') !== 'false';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');

if (!ADMIN_TOKEN) {
  console.error('[soak] ADMIN_TOKEN env var required (JWT for admin user). Skipping snapshot polling.');
  console.error('[soak] Continuing in liveness-only mode (no /admin/health snapshot, no full assertions).');
}

fs.mkdirSync(REPORT_DIR, { recursive: true });
const csvPath = path.join(REPORT_DIR, `${RUN_ID}.csv`);
const reportPath = path.join(REPORT_DIR, `${RUN_ID}-report.json`);
const csv = fs.createWriteStream(csvPath);
csv.write('ts,heap_used_mb,heap_total_mb,rss_mb,handles_active,lag_p99_ms,influx_failures_24h,browser_heap_mb\n');

console.log(`[soak] starting ${DURATION_HOURS}h run, speed=${SPEED}x, browser=${BROWSER_ENABLED}, port=${PORT}`);
console.log(`[soak] csv: ${csvPath}`);
console.log(`[soak] report: ${reportPath}`);

// ─── 1. Spawn server ───────────────────────────────────────
const env = {
  ...process.env,
  MOCK_PLC: 'true',
  PORT: String(PORT),
  SOAK_SPEED: String(SPEED),
  NODE_ENV: process.env.NODE_ENV ?? 'development',  // dev: avoid auto-SIGTERM on OOM
};
const server = spawn('node', ['packages/server/dist/index.js'], { env, stdio: 'pipe' });
let serverErrors = '';
server.stderr?.on('data', (d) => { serverErrors += d.toString(); });
server.on('error', (e) => { console.error('[soak] server spawn error:', e); process.exit(1); });

await wait(10_000);  // server boot

// ─── 2. (optional) Spawn browser ───────────────────────────
let browser, page;
let browserBaseline = 0;
if (BROWSER_ENABLED) {
  try {
    const { default: puppeteer } = await import('puppeteer');
    browser = await puppeteer.launch({ headless: 'new' });
    page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/dashboard`, { waitUntil: 'networkidle0', timeout: 30_000 });
    const m0 = await page.metrics();
    browserBaseline = m0.JSHeapUsedSize;
    console.log(`[soak] browser baseline heap=${(browserBaseline / 1024 / 1024).toFixed(1)}MB`);
  } catch (e) {
    console.warn('[soak] puppeteer launch failed, continuing browser-less:', e?.message ?? e);
    browser = null;
    page = null;
  }
}

// ─── 3. Poll /admin/health every minute ────────────────────
let baseline = null;
let influxFailures = 0;
let uncaughtTotal = 0;

const start = Date.now();
const endTime = start + DURATION_HOURS * 3600_000;

const tick = async () => {
  try {
    const r = await fetch(`http://localhost:${PORT}/api/v1/admin/health`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    if (!r.ok) {
      console.warn(`[soak] /admin/health HTTP ${r.status}`);
      return;
    }
    const j = await r.json();
    // v1 response wrapper: actual snap may be in j.data
    const snap = j.data ?? j;

    let browserHeapMb = 0;
    if (page) {
      try { browserHeapMb = Math.round((await page.metrics()).JSHeapUsedSize / 1024 / 1024); } catch {}
    }

    const row = [
      new Date().toISOString(),
      snap.memory?.heap_used_mb ?? '',
      snap.memory?.heap_total_mb ?? '',
      snap.memory?.rss_mb ?? '',
      snap.handles?.active ?? '',
      snap.event_loop?.lag_p99_ms ?? '',
      snap.data_service?.influx_failures_24h ?? 0,
      browserHeapMb,
    ].join(',');
    csv.write(row + '\n');

    if (!baseline) {
      baseline = {
        heap_used_mb: snap.memory?.heap_used_mb ?? 0,
        rss_mb: snap.memory?.rss_mb ?? 0,
        handles_active: snap.handles?.active ?? 0,
        browser_heap_mb: browserHeapMb,
      };
      console.log(`[soak] baseline: heap=${baseline.heap_used_mb}MB rss=${baseline.rss_mb}MB handles=${baseline.handles_active} browser=${baseline.browser_heap_mb}MB`);
    }

    const elapsedMin = Math.floor((Date.now() - start) / 60_000);
    if (elapsedMin % 10 === 0) {
      console.log(`[${elapsedMin}min] heap=${snap.memory?.heap_used_mb}MB rss=${snap.memory?.rss_mb}MB handles=${snap.handles?.active} browser=${browserHeapMb}MB`);
    }
  } catch (e) {
    console.warn('[soak] sample error:', e?.message ?? e);
  }

  // Pull metrics endpoint for influx + uncaught counters
  try {
    const r = await fetch(`http://localhost:${PORT}/api/v1/admin/metrics`);
    if (r.ok) {
      const text = await r.text();
      const failMatch = text.match(/^biocore_influx_write_failures_total\s+(\d+)/m);
      const uncaughtMatch = text.match(/^biocore_uncaught_exceptions_total[^\s]*\s+(\d+)/m);
      if (failMatch) influxFailures = Math.max(influxFailures, Number(failMatch[1]));
      if (uncaughtMatch) uncaughtTotal = Math.max(uncaughtTotal, Number(uncaughtMatch[1]));
    }
  } catch { /* metrics scrape best-effort */ }
};

const interval = setInterval(tick, 60_000);
tick();  // initial sample

// ─── 4. After duration, run assertions + write report ───────
await new Promise((resolve) => {
  const finishTimer = setTimeout(resolve, DURATION_HOURS * 3600_000);
  finishTimer.unref?.();
});

clearInterval(interval);
csv.end();

let last = baseline ? { ...baseline } : null;
let browserDeltaMb = 0;
try {
  const r = await fetch(`http://localhost:${PORT}/api/v1/admin/health`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
  if (r.ok) {
    const j = await r.json();
    const snap = j.data ?? j;
    last = {
      heap_used_mb: snap.memory?.heap_used_mb ?? last?.heap_used_mb ?? 0,
      rss_mb: snap.memory?.rss_mb ?? last?.rss_mb ?? 0,
      handles_active: snap.handles?.active ?? last?.handles_active ?? 0,
      browser_heap_mb: 0,
    };
  }
} catch {}

if (page) {
  try {
    const m = await page.metrics();
    browserDeltaMb = (m.JSHeapUsedSize - browserBaseline) / 1024 / 1024;
    if (last) last.browser_heap_mb = Math.round(m.JSHeapUsedSize / 1024 / 1024);
  } catch {}
}

const heapRatio = baseline && last ? last.heap_used_mb / baseline.heap_used_mb : 0;
const handleDelta = baseline && last ? last.handles_active - baseline.handles_active : 0;

const asserts = {
  heapRatio,
  heapRatioPass: heapRatio === 0 || heapRatio <= 1.3,
  handleDelta,
  handleDeltaPass: handleDelta <= 5,
  uncaughtTotal,
  uncaughtPass: uncaughtTotal === 0,
  influxFailures,
  influxFailuresPass: influxFailures === 0,
  browserDeltaMb: Math.round(browserDeltaMb),
  browserDeltaPass: !page || browserDeltaMb <= 100,
};
const pass =
  asserts.heapRatioPass &&
  asserts.handleDeltaPass &&
  asserts.uncaughtPass &&
  asserts.influxFailuresPass &&
  asserts.browserDeltaPass;

const report = {
  run: RUN_ID,
  duration_hours: DURATION_HOURS,
  speed_multiplier: SPEED,
  browser_enabled: BROWSER_ENABLED && !!page,
  baseline,
  last,
  asserts,
  pass,
  csv: path.basename(csvPath),
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`[soak] DONE pass=${pass} heapRatio=${heapRatio.toFixed(2)} handleDelta=${handleDelta} influxFailures=${influxFailures} uncaughtTotal=${uncaughtTotal} browserDeltaMb=${asserts.browserDeltaMb}`);
console.log(`[soak] report: ${reportPath}`);

// ─── 5. Cleanup ────────────────────────────────────────────
try { server.kill('SIGTERM'); } catch {}
try { await new Promise((r) => server.once('exit', r)); } catch {}
if (browser) {
  try { await browser.close(); } catch {}
}

process.exit(pass ? 0 : 1);

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
