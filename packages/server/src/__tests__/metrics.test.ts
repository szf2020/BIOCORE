/**
 * T1: MetricsRegistry 单元测试 (SP-FX-28)
 *
 * TDD RED-first: 先写测试，再实现 services/metrics.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsRegistry } from '../services/metrics';

describe('MetricsRegistry', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  // ─── Counter ────────────────────────────────────────────────

  it('counter.inc() 累加，初始为 0', () => {
    const c = registry.counter('http_requests_total');
    expect(c.get()).toBe(0);
    c.inc();
    expect(c.get()).toBe(1);
    c.inc();
    expect(c.get()).toBe(2);
  });

  it('counter 支持 labels，不同 label 组合独立计数', () => {
    const c = registry.counter('http_requests_total');
    c.inc({ method: 'GET', status: '200' });
    c.inc({ method: 'POST', status: '201' });
    c.inc({ method: 'GET', status: '200' });
    expect(c.get({ method: 'GET', status: '200' })).toBe(2);
    expect(c.get({ method: 'POST', status: '201' })).toBe(1);
  });

  // ─── Histogram ──────────────────────────────────────────────

  it('histogram.observe() 记录 sum + count', () => {
    const h = registry.histogram('http_request_duration_seconds');
    h.observe(0.3);
    h.observe(1.2);
    const snap = h.snapshot();
    expect(snap.count).toBe(2);
    expect(snap.sum).toBeCloseTo(1.5);
  });

  it('histogram.observe() 正确分类 buckets', () => {
    const h = registry.histogram('http_request_duration_seconds');
    h.observe(0.03);  // ≤ 0.05 bucket
    h.observe(0.2);   // ≤ 0.5 bucket
    h.observe(3.0);   // ≤ 5 bucket
    const snap = h.snapshot();
    // buckets: 0.01, 0.05, 0.1, 0.5, 1, 5
    expect(snap.buckets[0.05]).toBe(1);  // 0.03 进入 ≤0.05
    expect(snap.buckets[0.5]).toBe(2);   // 0.03 + 0.2 累计
    expect(snap.buckets[5]).toBe(3);     // 全部累计
  });

  // ─── Gauge ──────────────────────────────────────────────────

  it('gauge.set() 可任意设置，覆盖旧值', () => {
    const g = registry.gauge('websocket_connections_active');
    g.set(5);
    expect(g.get()).toBe(5);
    g.set(3);
    expect(g.get()).toBe(3);
  });

  // ─── Prometheus text format ──────────────────────────────────

  it('serialize() 输出符合 Prometheus text format', () => {
    const c = registry.counter('test_counter', 'A test counter');
    c.inc({ env: 'prod' });
    c.inc({ env: 'prod' });

    const output = registry.serialize();
    expect(output).toContain('# HELP test_counter A test counter');
    expect(output).toContain('# TYPE test_counter counter');
    expect(output).toContain('test_counter{env="prod"} 2');
  });

  it('serialize() histogram 输出 _bucket _sum _count', () => {
    const h = registry.histogram('req_duration_seconds', 'Request duration');
    h.observe(0.05);

    const output = registry.serialize();
    expect(output).toContain('# HELP req_duration_seconds Request duration');
    expect(output).toContain('# TYPE req_duration_seconds histogram');
    expect(output).toMatch(/req_duration_seconds_bucket\{le="0\.05"\} \d+/);
    expect(output).toContain('req_duration_seconds_sum');
    expect(output).toContain('req_duration_seconds_count');
  });

  it('同名 counter 调用多次返回同一实例', () => {
    const c1 = registry.counter('same_counter');
    const c2 = registry.counter('same_counter');
    c1.inc();
    expect(c2.get()).toBe(1);
  });
});
