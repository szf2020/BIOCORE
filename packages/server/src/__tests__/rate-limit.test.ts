// rate-limit.test.ts — SP-FX-40
// TDD RED-first: 测试先于实现
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// 延迟 import 以便每次测试重置模块状态
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rateLimit: (config?: any) => import('express').RequestHandler;
let stopCleanup: () => void;

// ── helpers ────────────────────────────────────────────────
function makeReq(ip: string, path = '/api/v1/test'): Partial<Request> {
  return {
    ip,
    path,
    socket: { remoteAddress: ip } as never,
  };
}

interface ResCtx {
  res: Partial<Response>;
  statusCode: number | undefined;
  body: unknown;
  headers: Record<string, string | number>;
}

function makeRes(): ResCtx {
  const ctx: ResCtx = {
    res: {},
    statusCode: undefined,
    body: undefined,
    headers: {},
  };
  ctx.res = {
    status(code: number) {
      ctx.statusCode = code;
      return ctx.res as Response;
    },
    json(data: unknown) {
      ctx.body = data;
      return ctx.res as Response;
    },
    // Express Response.set 有多个重载，使用 any 避免 mock 类型冲突
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    set(name: any, value?: any) {
      if (typeof name === 'string' && value !== undefined) ctx.headers[name] = value;
      return ctx.res as Response;
    },
    setHeader(name: string, value: string | number) {
      ctx.headers[name] = value;
      return ctx.res as Response;
    },
  };
  return ctx;
}

// ── 测试 ──────────────────────────────────────────────────
describe('rateLimit middleware', () => {
  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../middlewares/rate-limit');
    rateLimit = mod.rateLimit;
    stopCleanup = mod.stopCleanup;
  });

  afterEach(() => {
    stopCleanup?.();
  });

  // T1: 低于 limit → next() 被调用
  it('T1: 低于 limit 时请求通过（调用 next）', async () => {
    const handler = rateLimit({ limit: 3, windowMs: 60_000 });
    const req = makeReq('1.1.1.1');
    const ctx = makeRes();
    const next = vi.fn();
    handler(req as Request, ctx.res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  // T2: 超过 limit → 429
  it('T2: 超过 limit 时返回 429', () => {
    const handler = rateLimit({ limit: 2, windowMs: 60_000 });
    const req = makeReq('2.2.2.2');
    const ctx = makeRes();
    const next = vi.fn();
    // 前 2 次应通过
    handler(req as Request, ctx.res as Response, next);
    handler(req as Request, ctx.res as Response, next);
    expect(next).toHaveBeenCalledTimes(2);
    // 第 3 次应被拦截
    handler(req as Request, ctx.res as Response, next);
    expect(ctx.statusCode).toBe(429);
    expect(next).toHaveBeenCalledTimes(2); // 没有再次调用 next
  });

  // T3: 不同 IP → 独立计数
  it('T3: 不同 IP 独立计数，互不影响', () => {
    const handler = rateLimit({ limit: 1, windowMs: 60_000 });
    const reqA = makeReq('10.0.0.1');
    const reqB = makeReq('10.0.0.2');
    const ctxA = makeRes();
    const ctxB = makeRes();
    const nextA = vi.fn();
    const nextB = vi.fn();
    // IP A 用完 limit
    handler(reqA as Request, ctxA.res as Response, nextA);
    expect(nextA).toHaveBeenCalledTimes(1);
    // IP B 应该独立，还能通过
    handler(reqB as Request, ctxB.res as Response, nextB);
    expect(nextB).toHaveBeenCalledTimes(1);
  });

  // T4: ip:path 策略 → 不同 path 独立计数
  it('T4: ip:path 策略下不同 path 独立计数', () => {
    const handler = rateLimit({ limit: 1, windowMs: 60_000, keyStrategy: 'ip:path' });
    const ip = '3.3.3.3';
    const reqA = makeReq(ip, '/api/v1/login');
    const reqB = makeReq(ip, '/api/v1/other');
    const ctxA = makeRes();
    const ctxB = makeRes();
    const nextA = vi.fn();
    const nextB = vi.fn();
    // /login 用完 limit
    handler(reqA as Request, ctxA.res as Response, nextA);
    expect(nextA).toHaveBeenCalledTimes(1);
    // /other 独立，还能通过
    handler(reqB as Request, ctxB.res as Response, nextB);
    expect(nextB).toHaveBeenCalledTimes(1);
  });

  // T5: 窗口重置后恢复
  it('T5: 窗口过期后计数重置，请求可再次通过', async () => {
    const handler = rateLimit({ limit: 1, windowMs: 50 }); // 50ms 窗口
    const req = makeReq('4.4.4.4');
    const ctx = makeRes();
    const next = vi.fn();
    // 用完 limit
    handler(req as Request, ctx.res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    // 超出 limit → 429
    handler(req as Request, ctx.res as Response, next);
    expect(ctx.statusCode).toBe(429);
    // 等窗口过期
    await new Promise(r => setTimeout(r, 60));
    // 重置后应该通过
    const ctx2 = makeRes();
    const next2 = vi.fn();
    handler(req as Request, ctx2.res as Response, next2);
    expect(next2).toHaveBeenCalledTimes(1);
  });

  // T6: stopCleanup 不抛异常（cleanup interval 可停止）
  it('T6: stopCleanup 可调用且不抛异常', () => {
    rateLimit({ windowMs: 60_000, limit: 100 });
    expect(() => stopCleanup()).not.toThrow();
  });

  // T7: skipPaths → 不计数，直接通过
  it('T7: skipPaths 内的路径不被计数，即使 limit=0 也通过', () => {
    const handler = rateLimit({ limit: 0, windowMs: 60_000, skipPaths: ['/health'] });
    const req = makeReq('5.5.5.5', '/health');
    const ctx = makeRes();
    const next = vi.fn();
    handler(req as Request, ctx.res as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.statusCode).toBeUndefined();
  });

  // T8: 429 body 格式 + Retry-After header
  it('T8: 429 响应包含正确的 error/retryAfter body 和 Retry-After header', () => {
    const handler = rateLimit({ limit: 0, windowMs: 60_000 }); // limit=0 → 立即拒绝
    const req = makeReq('6.6.6.6');
    const ctx = makeRes();
    const next = vi.fn();
    handler(req as Request, ctx.res as Response, next);
    expect(ctx.statusCode).toBe(429);
    expect(ctx.body).toMatchObject({
      error: 'Too many requests',
      retryAfter: expect.any(Number),
    });
    expect(ctx.headers['Retry-After']).toBeDefined();
  });
});
