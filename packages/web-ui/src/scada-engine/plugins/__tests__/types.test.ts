// SP-FX-45: BiocorePlugin type 验证测试 (duck-type runtime guards)
import { describe, it, expect } from 'vitest';
import type { BiocorePlugin } from '../types';

function isBiocorePlugin(v: unknown): v is BiocorePlugin {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p['id'] === 'string' &&
    typeof p['name'] === 'string' &&
    typeof p['version'] === 'string' &&
    Array.isArray(p['widgets'])
  );
}

describe('BiocorePlugin type contract', () => {
  it('1. 合法最小 plugin 通过 guard', () => {
    const minimal: BiocorePlugin = {
      id: 'com.test.widget',
      name: 'Test Widget',
      version: '1.0.0',
      widgets: [],
    };
    expect(isBiocorePlugin(minimal)).toBe(true);
  });

  it('2. 缺少必填字段 id 时 guard 返回 false', () => {
    const bad = { name: 'Missing ID', version: '1.0.0', widgets: [] };
    expect(isBiocorePlugin(bad)).toBe(false);
  });

  it('3. 完整 plugin 含可选字段通过 guard', () => {
    const full: BiocorePlugin = {
      id: 'com.test.full',
      name: 'Full Plugin',
      version: '2.0.0',
      widgets: [],
      propertySchemas: [],
      dictionaries: {
        zh: { 'key': '值' },
        en: { 'key': 'value' },
      },
      onLoad: () => {},
      onUnload: () => {},
    };
    expect(isBiocorePlugin(full)).toBe(true);
  });

  it('4. null / 非对象值返回 false', () => {
    expect(isBiocorePlugin(null)).toBe(false);
    expect(isBiocorePlugin(42)).toBe(false);
    expect(isBiocorePlugin('string')).toBe(false);
  });
});
