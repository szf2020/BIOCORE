// ============================================================
// response-wrapper.ts — V1 统一响应格式包装
//
// 拦截 res.json(body), 把任意 body 包装为:
//   { code: <0 或 HTTP状态码>, msg: 'ok' 或错误消息, data: <body 或 null>, trace_id: <req.trace_id> }
//
// 规则:
// 1. 已经是统一格式 (含 code+data+trace_id) 的对象直接发, 不二次包装
// 2. 错误响应 (statusCode >= 400): code = statusCode, msg = body.error || body.message, data = null
// 3. 成功响应: code = 0, msg = 'ok', data = body
//
// 此中间件只在 /api/v1/* 链中挂载, /api/* 旧路径保持原格式不变
// ============================================================

import type { Request, Response, NextFunction } from 'express';

export function v1ResponseWrapper(req: any, res: Response, next: NextFunction): void {
  const origJson = res.json.bind(res);
  res.json = (body: any) => {
    // 1. 已经是统一格式 → 直接发 (避免二次包装)
    if (body && typeof body === 'object' && 'code' in body && 'data' in body && 'trace_id' in body) {
      return origJson(body);
    }
    // 2. 错误响应
    if (res.statusCode >= 400) {
      const msg = (body && typeof body === 'object' && (body.error || body.message)) || 'Error';
      return origJson({
        code: res.statusCode,
        msg: String(msg),
        data: null,
        trace_id: req.trace_id,
      });
    }
    // 3. 成功响应
    return origJson({
      code: 0,
      msg: 'ok',
      data: body,
      trace_id: req.trace_id,
    });
  };
  next();
}
