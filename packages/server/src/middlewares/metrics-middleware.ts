// ============================================================
// middlewares/metrics-middleware.ts — HTTP metrics 拦截 (SP-FX-28)
//
// 拦截所有 req/res, 计:
//   http_requests_total{method, path, status} — 请求计数
//   http_request_duration_seconds{method, path} — 请求延迟 histogram
//
// path 取 req.route?.path || req.path, 避免 raw URL cardinality 爆炸
// 使用 res.on('finish', ...) 确保在响应完成后计量
// ============================================================

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { MetricsRegistry } from '../services/metrics';

export function createMetricsMiddleware(registry: MetricsRegistry): RequestHandler {
  const requestsTotal = registry.counter(
    'http_requests_total',
    'Total number of HTTP requests',
  );
  const durationSeconds = registry.histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
  );

  return (req: Request, res: Response, next: NextFunction): void => {
    const startHr = process.hrtime.bigint();

    res.on('finish', () => {
      // 取 Express route pattern (避 raw URL cardinality 爆炸)
      // req.route 在 route handler 执行后才设置; finish 事件中可读取
      const path: string = (req as any).route?.path ?? req.path;
      const method = req.method;
      const status = String(res.statusCode);
      // hrtime.bigint() 返回纳秒, 转换为秒
      const durationSec = Number(process.hrtime.bigint() - startHr) / 1e9;

      requestsTotal.inc({ method, path, status });
      // 最小值 1μs 确保 sum > 0（避免 hrtime 极小时舍入为 0）
      durationSeconds.observe(Math.max(durationSec, 1e-6));
    });

    next();
  };
}
