// ============================================================
// trace.ts — trace_id 注入中间件
//
// 给所有请求注入 trace_id (从 X-Trace-Id header 读取, 无则生成 8 字节 hex):
//   - req.trace_id 供后续中间件/handler 使用
//   - 响应头 X-Trace-Id 让客户端能拿到 trace_id (跨系统排错关联)
//
// 此中间件应该在所有其他中间件之前注册, 确保 trace_id 全程可用
// ============================================================

import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

// trace_id 格式白名单: 仅允许 alphanumeric + - + _ (最长 64 字符)
// 防止客户端注入特殊字符污染日志或 header
const TRACE_ID_RE = /^[a-zA-Z0-9\-_]{1,64}$/;

export function traceMw(req: any, res: Response, next: NextFunction): void {
  const raw = req.headers['x-trace-id'];
  // HTTP 允许多个同名 header, Express 会解析为 string[]; 只取第一个
  const incoming = Array.isArray(raw) ? raw[0] : raw;
  const traceId = (typeof incoming === 'string' && TRACE_ID_RE.test(incoming))
    ? incoming
    : randomBytes(8).toString('hex');
  req.trace_id = traceId;
  res.setHeader('X-Trace-Id', traceId);
  next();
}
