// ============================================================
// ws-timing-safe.test.ts — SP-FX-47 Part 3 (HIGH)
// 验证 WS API Key 比较使用 timingSafeEqual，防止 timing attack。
// ============================================================

import { describe, it, expect } from 'vitest';
import { safeCompareApiKeyHash } from '../ws-server';
import { hashApiKey } from '../middlewares/auth';

describe('safeCompareApiKeyHash — F-06 timing-safe API Key 比较', () => {
  it('正确 key hash → true', () => {
    const salt = 'testsalt';
    const rawKey = 'testkey123';
    const hash = hashApiKey(rawKey, salt);
    expect(safeCompareApiKeyHash(hash, hash)).toBe(true);
  });

  it('错误 key hash → false', () => {
    const hash = hashApiKey('correct-key', 'testsalt');
    const wrongHash = hashApiKey('wrong-key', 'testsalt');
    expect(safeCompareApiKeyHash(hash, wrongHash)).toBe(false);
  });

  it('长度不等时 → false，不抛 RangeError', () => {
    const validHash = 'a'.repeat(64); // SHA-256 hex = 64 chars
    const shortHash = 'b'.repeat(32); // 长度不等
    expect(() => safeCompareApiKeyHash(validHash, shortHash)).not.toThrow();
    expect(safeCompareApiKeyHash(validHash, shortHash)).toBe(false);
  });

  it('空字符串 → false', () => {
    const hash = hashApiKey('some-key', 'some-salt');
    expect(safeCompareApiKeyHash(hash, '')).toBe(false);
    expect(safeCompareApiKeyHash('', hash)).toBe(false);
  });
});
