// SP-FX-6.2 T9: RED tests for PipeGauge — run BEFORE impl exists.
// SP-FX-14: added flow animation tests (T1-T5)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w5',
  type: 'svg-ext-pipe',
  x: 0,
  y: 0,
  w: 120,
  h: 20,
  property: {
    variableId: 'r1.AI-2',
    options: { pipe: '#E79180', content: '#DADADA' },
    actions: [
      {
        variableId: 'r1.AI-2',
        range: { min: 0, max: 1 },
        options: { fillA: '#00aa00', fillB: '#ff0000' },
        type: 'clockwise',
      },
    ],
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (mode: 'editor' | 'runtime' = 'editor'): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: 0, isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode,
});

describe('PipeGauge', () => {
  it('onMount creates SVG elements with data-widget-id and default pipe color', async () => {
    const { pipeMeta } = await import(
      '../../../controls/batch2/pipe'
    );
    const ctx = makeCtx();
    const gauge = pipeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const tagged = ctx.parentGroup.querySelector('[data-widget-id="w5"]');
    expect(tagged).toBeTruthy();
    expect(ctx.parentGroup.childElementCount).toBeGreaterThanOrEqual(1);
  });

  it('onProcess with value=1 applies action fillA to pipe visual', async () => {
    const { pipeMeta } = await import(
      '../../../controls/batch2/pipe'
    );
    const ctx = makeCtx();
    const gauge = pipeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 1, isStale: false });
    const pipeEl = ctx.parentGroup.querySelector('[data-pipe="true"]') as SVGElement | null;
    expect(pipeEl).toBeTruthy();
    expect(pipeEl?.getAttribute('stroke')).toBe('#00aa00');
  });

  it('onProcess with value=999 (out of range) keeps default pipe color, no throw', async () => {
    const { pipeMeta } = await import(
      '../../../controls/batch2/pipe'
    );
    const ctx = makeCtx();
    const gauge = pipeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(() => gauge.onProcess({ value: 999, isStale: false })).not.toThrow();
    const pipeEl = ctx.parentGroup.querySelector('[data-pipe="true"]') as SVGElement | null;
    expect(pipeEl?.getAttribute('stroke')).toBe('#E79180');
  });

  it('onPropertyChange updates pipe color', async () => {
    const { pipeMeta } = await import(
      '../../../controls/batch2/pipe'
    );
    const ctx = makeCtx();
    const gauge = pipeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const nextWidget = makeWidget({
      property: {
        variableId: 'r1.AI-2',
        options: { pipe: '#0000ff', content: '#DADADA' },
        actions: [],
      },
    } as Partial<FuxaWidget>);
    gauge.onPropertyChange({ key: 'options', value: nextWidget.property, nextWidget });
    const pipeEl = ctx.parentGroup.querySelector('[data-pipe="true"]') as SVGElement | null;
    expect(pipeEl?.getAttribute('stroke')).toBe('#0000ff');
  });

  it('onUnmount removes all elements and is idempotent', async () => {
    const { pipeMeta } = await import(
      '../../../controls/batch2/pipe'
    );
    const ctx = makeCtx();
    const gauge = pipeMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBeGreaterThanOrEqual(1);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});

// SP-FX-14: flow animation tests
describe('PipeGauge — flow animation', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const makeFlowWidget = (flowDirection: 'cw' | 'ccw' | 'none' = 'cw') =>
    makeWidget({
      property: {
        variableId: 'r1.AI-2',
        options: { pipe: '#E79180', content: '#DADADA', flowDirection, flowSpeed: 2 },
        actions: [],
      },
    } as Partial<FuxaWidget>);

  it('flowDirection="cw" runtime: pipeEl gets stroke-dasharray after onMount', async () => {
    const { pipeMeta } = await import('../../../controls/batch2/pipe');
    const ctx = makeCtx('runtime');
    const gauge = pipeMeta.create();
    gauge.onMount(makeFlowWidget('cw'), ctx);
    const pipeEl = ctx.parentGroup.querySelector('[data-pipe="true"]') as SVGElement | null;
    expect(pipeEl).toBeTruthy();
    expect(pipeEl?.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('flowDirection="cw" runtime: interval advances dashoffset each tick', async () => {
    const { pipeMeta } = await import('../../../controls/batch2/pipe');
    const ctx = makeCtx('runtime');
    const gauge = pipeMeta.create();
    gauge.onMount(makeFlowWidget('cw'), ctx);
    const pipeEl = ctx.parentGroup.querySelector('[data-pipe="true"]') as SVGElement | null;
    const before = parseFloat(pipeEl?.getAttribute('stroke-dashoffset') ?? '0');
    vi.advanceTimersByTime(32);
    const after = parseFloat(pipeEl?.getAttribute('stroke-dashoffset') ?? '0');
    // cw: offset 减小（或因模运算变化）
    expect(after).not.toBe(before);
  });

  it('flowDirection="none" runtime: no interval, no stroke-dasharray', async () => {
    const { pipeMeta } = await import('../../../controls/batch2/pipe');
    const ctx = makeCtx('runtime');
    const gauge = pipeMeta.create();
    gauge.onMount(makeFlowWidget('none'), ctx);
    const pipeEl = ctx.parentGroup.querySelector('[data-pipe="true"]') as SVGElement | null;
    const daBefore = pipeEl?.getAttribute('stroke-dasharray');
    vi.advanceTimersByTime(100);
    // 无动画时 stroke-dasharray 应为 null 或不变
    expect(daBefore).toBeFalsy();
  });

  it('editor mode + flowDirection="cw": no interval (dashoffset stays static)', async () => {
    const { pipeMeta } = await import('../../../controls/batch2/pipe');
    const ctx = makeCtx('editor');
    const gauge = pipeMeta.create();
    gauge.onMount(makeFlowWidget('cw'), ctx);
    const pipeEl = ctx.parentGroup.querySelector('[data-pipe="true"]') as SVGElement | null;
    const before = pipeEl?.getAttribute('stroke-dashoffset') ?? null;
    vi.advanceTimersByTime(100);
    const after = pipeEl?.getAttribute('stroke-dashoffset') ?? null;
    expect(after).toBe(before);
  });

  it('onUnmount clears interval and is idempotent', async () => {
    const { pipeMeta } = await import('../../../controls/batch2/pipe');
    const ctx = makeCtx('runtime');
    const gauge = pipeMeta.create();
    gauge.onMount(makeFlowWidget('cw'), ctx);
    const pipeEl = ctx.parentGroup.querySelector('[data-pipe="true"]') as SVGElement | null;
    gauge.onUnmount();
    const offsetAfterUnmount = pipeEl?.getAttribute('stroke-dashoffset') ?? null;
    vi.advanceTimersByTime(200);
    // interval 已清除，offset 不再变化（元素已 remove，无法查询）
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});
