// Pre-import 环境变量加载 — 必须是 index.ts 的第一个 import
// 防止下游模块 (如 plc-bridge.ts) 在 .env 加载前就读 process.env.MOCK_PLC
// 等常量, 导致开发环境 MOCK_PLC 不生效

import { readFileSync } from 'fs';
import { resolve } from 'path';

(function loadEnvEarly() {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
    resolve(__dirname, '../../../.env'),
  ];
  for (const p of candidates) {
    try {
      const text = readFileSync(p, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (!(key in process.env)) process.env[key] = value;
      }
      process.stdout.write(`[ENV] Pre-load .env from ${p}\n`);
      return;
    } catch { /* try next */ }
  }
})();
