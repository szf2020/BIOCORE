// scripts/healthcheck.mjs
// Docker healthcheck probe — exits 0 if /api/v1/admin/health/liveness returns 200.
// Used by docker-compose biocore-server service. Non-zero exit triggers Docker restart.
//
// 由 T24 (Sprint 4 Track A 加固) 添加。当前 admin/health/liveness 端点
// 在 T36 加上前会返回 404，此 script 退化为"端口 reachable" 探针。
import http from 'node:http';

const HOST = process.env.HEALTHCHECK_HOST ?? 'localhost';
const PORT = process.env.HEALTHCHECK_PORT ?? process.env.PORT ?? '3001';
const PATH = process.env.HEALTHCHECK_PATH ?? '/api/v1/admin/health/liveness';
const TIMEOUT_MS = Number(process.env.HEALTHCHECK_TIMEOUT_MS ?? 5_000);

const url = `http://${HOST}:${PORT}${PATH}`;
const req = http.get(url, { timeout: TIMEOUT_MS }, (res) => {
  // 200 = healthy. 404 = endpoint not yet implemented (pre-T36) — accept as port-up signal.
  if (res.statusCode === 200 || res.statusCode === 404) process.exit(0);
  console.error('[healthcheck] non-200/404 status:', res.statusCode);
  process.exit(1);
});
req.on('error', (e) => {
  console.error('[healthcheck] request error:', e.message);
  process.exit(1);
});
req.on('timeout', () => {
  req.destroy();
  console.error('[healthcheck] timeout after', TIMEOUT_MS, 'ms');
  process.exit(1);
});
