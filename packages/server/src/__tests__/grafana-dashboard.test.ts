/**
 * SP-FX-38: Grafana dashboard JSON schema 验证
 *
 * 验证 grafana/dashboards/biocore-overview.json 满足 Grafana
 * dashboard 最小结构要求（非 RED/GREEN TDD，属静态 config 验证）。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// dashboard JSON 相对于 monorepo 根
const DASHBOARD_PATH = resolve(
  __dirname,
  '../../../../grafana/dashboards/biocore-overview.json',
);

describe('grafana/dashboards/biocore-overview.json (SP-FX-38)', () => {
  let dashboard: Record<string, unknown>;

  // 解析一次，所有 test 共用
  try {
    const raw = readFileSync(DASHBOARD_PATH, 'utf-8');
    dashboard = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    // 如果读取/解析失败，所有测试将在 expect 时报错
    dashboard = {};
  }

  it('T1: dashboard JSON 可以被 JSON.parse 解析，且 panels 数组不为空', () => {
    // arrange: 已在 describe 顶层解析
    // act: 检查 panels
    const panels = dashboard['panels'];
    // assert
    expect(Array.isArray(panels)).toBe(true);
    expect((panels as unknown[]).length).toBeGreaterThan(0);
  });

  it('T2: 每个非 row 类型的 panel 包含必要字段 id / type / title / gridPos / targets', () => {
    const panels = (dashboard['panels'] as Record<string, unknown>[]) ?? [];
    const dataPanels = panels.filter((p) => p['type'] !== 'row');

    for (const panel of dataPanels) {
      // id
      expect(typeof panel['id']).toBe('number');
      // type
      expect(typeof panel['type']).toBe('string');
      // title
      expect(typeof panel['title']).toBe('string');
      expect((panel['title'] as string).length).toBeGreaterThan(0);
      // gridPos
      const gridPos = panel['gridPos'] as Record<string, number>;
      expect(typeof gridPos).toBe('object');
      expect(typeof gridPos['h']).toBe('number');
      expect(typeof gridPos['w']).toBe('number');
      // targets (stat/timeseries panels must have targets)
      expect(Array.isArray(panel['targets'])).toBe(true);
      expect((panel['targets'] as unknown[]).length).toBeGreaterThan(0);
    }
  });
});
