// scripts/leak-audit/frontend-soak.mjs
// Long-running browser soak to validate web-ui doesn't leak heap
// during 6h of dashboard view. Use: node scripts/leak-audit/frontend-soak.mjs
//
// T13 风险 #5 防御 #2：除了源码上限 (regression-guard-pv-cap.mjs)，
// 用 Puppeteer 在真实浏览器里跑 6h dashboard，每 5 分钟采样 JS heap，
// 最终 delta ≤ 100MB 视为通过。
//
// 环境变量:
//   SOAK_URL                   默认 http://localhost:3000/dashboard
//   SOAK_DURATION_HOURS        默认 6
//   SOAK_REPORT_DIR            默认 ./soak-runs
//   SOAK_HEAP_DELTA_MB_LIMIT   默认 100 (delta 超过即 fail)
//
// 注意：本脚本不在 T13 CI 内运行（6h 太长），仅作为发布前手工 soak 工具。
// 依赖 puppeteer：npm i -D puppeteer (web-ui 包内或仓根)

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.SOAK_URL ?? 'http://localhost:3000/dashboard';
const DURATION_MS = Number(process.env.SOAK_DURATION_HOURS ?? 6) * 60 * 60_000;
const SAMPLE_INTERVAL_MS = 5 * 60_000;
const REPORT_DIR = process.env.SOAK_REPORT_DIR ?? './soak-runs';
const HEAP_DELTA_LIMIT_MB = Number(process.env.SOAK_HEAP_DELTA_MB_LIMIT ?? 100);

fs.mkdirSync(REPORT_DIR, { recursive: true });
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = path.join(REPORT_DIR, `frontend-soak-${runId}.json`);
console.log(`[frontend-soak] target=${URL} duration=${DURATION_MS / 60_000}min report=${reportPath} limit=${HEAP_DELTA_LIMIT_MB}MB`);

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();

page.on('pageerror', (e) => console.error('[page error]', e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error('[browser console error]', msg.text());
});

await page.goto(URL, { waitUntil: 'networkidle0' });

const samples = [];
const start = Date.now();
const startMem = (await page.metrics()).JSHeapUsedSize;
samples.push({ t: 0, mem: startMem });
console.log(`[frontend-soak] baseline heap=${(startMem / 1024 / 1024).toFixed(1)}MB`);

const tick = setInterval(async () => {
  try {
    const m = await page.metrics();
    const t = Date.now() - start;
    samples.push({ t, mem: m.JSHeapUsedSize });
    console.log(`[${Math.floor(t / 60_000)}min] heap=${(m.JSHeapUsedSize / 1024 / 1024).toFixed(1)}MB nodes=${m.Nodes} listeners=${m.JSEventListeners}`);
    if (t > DURATION_MS) {
      clearInterval(tick);
      const finalDeltaMb = (samples.at(-1).mem - startMem) / 1024 / 1024;
      const pass = finalDeltaMb <= HEAP_DELTA_LIMIT_MB;
      fs.writeFileSync(
        reportPath,
        JSON.stringify(
          {
            runId,
            url: URL,
            durationMs: t,
            baselineMb: startMem / 1024 / 1024,
            samples,
            finalDeltaMb,
            limitMb: HEAP_DELTA_LIMIT_MB,
            pass,
          },
          null,
          2,
        ),
      );
      console.log(`[frontend-soak] DONE delta=${finalDeltaMb.toFixed(1)}MB limit=${HEAP_DELTA_LIMIT_MB}MB pass=${pass}`);
      await browser.close();
      process.exit(pass ? 0 : 1);
    }
  } catch (e) {
    console.error('[frontend-soak] sample error:', e.message);
  }
}, SAMPLE_INTERVAL_MS);
