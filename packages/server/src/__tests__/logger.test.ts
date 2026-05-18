/**
 * SP-FX-37 logger 测试
 *
 * TDD RED-first: 先写测试，再实现 services/logger.ts
 *
 * T1: level filter — debug 低于 warn 时不输出
 * T2: JSON format — 生产环境输出可解析 JSON
 * T3: silent in test env — NODE_ENV=test 不输出
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logger — level filter', () => {
  it('T1: LOG_LEVEL=warn 时 debug 消息不写入 stdout', async () => {
    const origLogLevel = process.env.LOG_LEVEL;
    const origNodeEnv = process.env.NODE_ENV;
    process.env.LOG_LEVEL = 'warn';
    process.env.NODE_ENV = 'production';

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // 动态 import 确保 env 变量在模块加载时生效
    vi.resetModules();
    const { createLogger } = await import('../services/logger');
    const logger = createLogger();
    logger.debug('这条不应该出现');

    expect(writeSpy).not.toHaveBeenCalled();

    process.env.LOG_LEVEL = origLogLevel;
    process.env.NODE_ENV = origNodeEnv;
  });
});

describe('logger — JSON format', () => {
  it('T2: 生产环境输出含 ts/level/msg 的 JSON', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origLogLevel = process.env.LOG_LEVEL;
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'info';

    const lines: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });

    vi.resetModules();
    const { createLogger } = await import('../services/logger');
    const logger = createLogger();
    logger.info('测试消息');

    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0].trim());
    expect(parsed).toMatchObject({ level: 'info', msg: '测试消息' });
    expect(typeof parsed.ts).toBe('string');

    process.env.NODE_ENV = origNodeEnv;
    process.env.LOG_LEVEL = origLogLevel;
  });
});

describe('logger — silent in test env', () => {
  it('T3: NODE_ENV=test 时不写入 stdout', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    vi.resetModules();
    const { createLogger } = await import('../services/logger');
    const logger = createLogger();
    logger.info('这条不应该出现');
    logger.error('这条也不应该出现');

    expect(writeSpy).not.toHaveBeenCalled();

    process.env.NODE_ENV = origNodeEnv;
  });
});
