/**
 * SP-FX-37 — 生产 structured logger
 *
 * 零外部依赖，纯 Node.js 实现。
 *
 * 行为:
 *   NODE_ENV=test       → 完全静默
 *   NODE_ENV=production → JSON lines to process.stdout
 *   其它               → 带前缀的 console
 *
 * Level 过滤: LOG_LEVEL env (默认 'info')
 *   error > warn > info > debug
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface Logger {
  error(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  if (raw in LEVEL_RANK) return raw as LogLevel;
  return 'info';
}

function isEnabled(msgLevel: LogLevel, threshold: LogLevel): boolean {
  return LEVEL_RANK[msgLevel] <= LEVEL_RANK[threshold];
}

/** 工厂函数，每次调用读取当前 env (便于测试动态切换) */
export function createLogger(): Logger {
  const env = process.env.NODE_ENV ?? 'development';
  const threshold = resolveLevel();

  if (env === 'test') {
    // 完全静默
    return {
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
    };
  }

  if (env === 'production') {
    const write = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => {
      if (!isEnabled(level, threshold)) return;
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        msg,
        pid: process.pid,
        ...(meta ?? {}),
      });
      process.stdout.write(line + '\n');
    };
    return {
      error: (msg, meta) => write('error', msg, meta),
      warn: (msg, meta) => write('warn', msg, meta),
      info: (msg, meta) => write('info', msg, meta),
      debug: (msg, meta) => write('debug', msg, meta),
    };
  }

  // 开发模式: 带前缀的 console
  const prefix = (level: LogLevel) => `[${level.toUpperCase()}]`;
  return {
    error: (msg, meta) => {
      if (!isEnabled('error', threshold)) return;
      console.error(prefix('error'), msg, meta ?? '');
    },
    warn: (msg, meta) => {
      if (!isEnabled('warn', threshold)) return;
      console.warn(prefix('warn'), msg, meta ?? '');
    },
    info: (msg, meta) => {
      if (!isEnabled('info', threshold)) return;
      console.log(prefix('info'), msg, meta ?? '');
    },
    debug: (msg, meta) => {
      if (!isEnabled('debug', threshold)) return;
      console.log(prefix('debug'), msg, meta ?? '');
    },
  };
}

/** 默认单例 logger (供直接 import 使用) */
export const logger = createLogger();
