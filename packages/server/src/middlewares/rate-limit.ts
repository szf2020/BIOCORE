// rate-limit.ts — SP-FX-40
// in-memory 固定窗口计数器速率限制 middleware (零第三方依赖)
// 算法: Fixed Window Counter，key = ip 或 ip:path
import type { RequestHandler } from 'express';

export interface RateLimitConfig {
  /** 时间窗口 ms，默认 60_000 (1分钟) */
  windowMs?: number;
  /** 窗口内最大请求数，默认 100 */
  limit?: number;
  /** key 策略: 'ip' | 'ip:path'，默认 'ip' */
  keyStrategy?: 'ip' | 'ip:path';
  /** 跳过 rate-limit 的路径前缀列表 */
  skipPaths?: string[];
}

interface RateLimitEntry {
  count: number;
  resetAt: number; // unix ms
}

// 全局 Map（单例）
const store = new Map<string, RateLimitEntry>();

// cleanup interval handle（测试中需停止以避免 open handles）
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/** 停止 cleanup interval 并清空 store（测试用途） */
export function stopCleanup(): void {
  if (cleanupTimer !== null) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  store.clear();
}

/**
 * 创建 rate-limit Express middleware。
 * 工厂函数，每次调用返回共享 store 上操作的 handler。
 */
export function rateLimit(config?: RateLimitConfig): RequestHandler {
  const windowMs = config?.windowMs ?? 60_000;
  const limit = config?.limit ?? 100;
  const keyStrategy = config?.keyStrategy ?? 'ip';
  const skipPaths = config?.skipPaths ?? [];

  // 启动 cleanup（若未启动）
  if (cleanupTimer === null) {
    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (entry.resetAt <= now) {
          store.delete(key);
        }
      }
    }, 5 * 60_000); // 每 5 分钟清理过期 entry
    // 不阻止进程退出
    if (cleanupTimer.unref) cleanupTimer.unref();
  }

  return (req, res, next): void => {
    // skipPaths 检查
    if (skipPaths.some(prefix => req.path.startsWith(prefix))) {
      next();
      return;
    }

    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const key = keyStrategy === 'ip:path' ? `${ip}:${req.path}` : ip;
    const now = Date.now();

    let entry = store.get(key);

    // 窗口过期 → 重置
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    if (entry.count >= limit) {
      // 超出 limit → 429
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Too many requests',
        retryAfter,
      });
      return;
    }

    // 计数 +1 (immutable pattern: 替换 Map 条目)
    store.set(key, { count: entry.count + 1, resetAt: entry.resetAt });
    next();
  };
}

/** 默认全局配置 */
export const defaultRateLimitConfig: RateLimitConfig = {
  windowMs: 60_000,
  limit: 100,
  keyStrategy: 'ip',
  skipPaths: ['/health', '/liveness', '/metrics', '/api/v1/metrics'],
};
