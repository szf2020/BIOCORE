// scripts/leak-audit/regression-guard-pv-cap.mjs
//
// T13 风险 #5 回归保护：web-ui realtime-store 的 process_values 趋势缓冲必须保持环形上限。
//
// 背景：
//   packages/web-ui/src/stores/realtime-store.ts 在 'pv_realtime' 分支用 .slice(-MAX_POINTS)
//   截断 trendBuffer 的 6 条数组（timestamps/temperature/pH/DO/rpm/airflow），上限为 3600
//   (60min × 1Hz)。'cusum' 分支同样用 .slice(-MAX_CUSUM_POINTS) 截断 cusumHistory，上限 300。
//
// 该脚本不依赖 vitest/jest（web-ui 包没装测试运行器），直接 grep 源码做静态保护：
//   1. trendBuffer 必须有 MAX_POINTS 常量且 ≤ 7200
//   2. cusumHistory 必须有 MAX_CUSUM_POINTS 常量且 ≤ 1800
//   3. .slice(-MAX_POINTS) 必须出现在 6 条 trend 数组上
//   4. alarms 仍有 .slice(0, 100) 上限
//   5. aiSuggestions 仍有 .slice(0, 50) 上限
//
// 用法：node scripts/leak-audit/regression-guard-pv-cap.mjs
// 退出码：0 = 全过；1 = 有 cap 被移除或放宽超阈值。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_PATH = path.resolve(__dirname, '..', '..', 'packages', 'web-ui', 'src', 'stores', 'realtime-store.ts');

const src = fs.readFileSync(STORE_PATH, 'utf8');

const failures = [];
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (e) {
    checks.push({ name, ok: false, err: e.message });
    failures.push(`${name}: ${e.message}`);
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
}

console.log(`[regression-guard-pv-cap] target=${STORE_PATH}`);
console.log('');

// ----- 1. MAX_POINTS for trendBuffer -----
check('trendBuffer 定义 MAX_POINTS 常量 (≤ 7200)', () => {
  const m = src.match(/const\s+MAX_POINTS\s*=\s*(\d+)/);
  if (!m) throw new Error('未找到 const MAX_POINTS = N');
  const n = Number(m[1]);
  if (!(n > 0 && n <= 7200)) throw new Error(`MAX_POINTS=${n}，必须 0 < N ≤ 7200`);
});

// ----- 2. MAX_CUSUM_POINTS for cusumHistory -----
check('cusumHistory 定义 MAX_CUSUM_POINTS 常量 (≤ 1800)', () => {
  const m = src.match(/const\s+MAX_CUSUM_POINTS\s*=\s*(\d+)/);
  if (!m) throw new Error('未找到 const MAX_CUSUM_POINTS = N');
  const n = Number(m[1]);
  if (!(n > 0 && n <= 1800)) throw new Error(`MAX_CUSUM_POINTS=${n}，必须 0 < N ≤ 1800`);
});

// ----- 3. .slice(-MAX_POINTS) on all 6 trend arrays -----
const TREND_FIELDS = ['timestamps', 'temperature', 'pH', 'DO', 'rpm', 'airflow'];
for (const field of TREND_FIELDS) {
  check(`trendBuffer.${field} 通过 .slice(-MAX_POINTS) 截断`, () => {
    // 匹配形如:  field: [...buf.field, X].slice(-MAX_POINTS)
    const re = new RegExp(`${field}\\s*:\\s*\\[[\\s\\S]*?\\]\\.slice\\(-MAX_POINTS\\)`);
    if (!re.test(src)) {
      throw new Error(`未找到 ${field}: [...].slice(-MAX_POINTS) 截断模式 — cap 可能被移除`);
    }
  });
}

// ----- 4. cusumHistory 截断 -----
check('cusumHistory[channel] 通过 .slice(-MAX_CUSUM_POINTS) 截断', () => {
  if (!/\.slice\(-MAX_CUSUM_POINTS\)/.test(src)) {
    throw new Error('未找到 .slice(-MAX_CUSUM_POINTS) — cusum cap 可能被移除');
  }
});

// ----- 5. alarms 上限 100 -----
check('alarms 数组保留 .slice(0, 100) 上限', () => {
  if (!/alarms\s*:\s*\[.*?\]\.slice\(0,\s*100\)/s.test(src)) {
    throw new Error('alarms 没有 .slice(0, 100) — 告警列表可能无限增长');
  }
});

// ----- 6. aiSuggestions 上限 50 -----
check('aiSuggestions 数组保留 .slice(0, 50) 上限', () => {
  if (!/aiSuggestions\s*:\s*\[.*?\]\.slice\(0,\s*50\)/s.test(src)) {
    throw new Error('aiSuggestions 没有 .slice(0, 50) — AI 建议列表可能无限增长');
  }
});

// ----- 7. T13 风险 #5 注释 marker 必须存在 -----
check('T13 风险 #5 注释 marker 存在 (防止有人无意删除)', () => {
  if (!/T13.*risk#5|T13 风险 #5/.test(src)) {
    throw new Error('未找到 T13 risk#5 marker — 上下文丢失，未来修改可能不知道这是 load-bearing');
  }
});

console.log('');
if (failures.length === 0) {
  console.log(`[regression-guard-pv-cap] DONE  ${checks.length}/${checks.length} 全绿`);
  process.exit(0);
} else {
  console.log(`[regression-guard-pv-cap] FAIL  ${failures.length}/${checks.length} 失败`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
