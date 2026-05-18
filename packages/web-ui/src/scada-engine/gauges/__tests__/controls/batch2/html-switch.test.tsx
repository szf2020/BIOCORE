// SP-FX-6.2 T5: RED tests for HtmlSwitchGauge — run BEFORE impl exists.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w3',
  type: 'svg-ext-html_switch',
  x: 10,
  y: 20,
  w: 60,
  h: 30,
  property: {
    variableId: 'r1.DO-0',
    onValue: '1',
    offValue: '0',
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (mode: 'editor' | 'runtime' = 'editor'): GaugeContext => ({
  parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
  readValue: vi.fn().mockReturnValue({ value: '0', isStale: false }),
  canvasSize: { width: 800, height: 600 },
  mode,
  onWriteIntent: vi.fn(),
});

describe('HtmlSwitchGauge', () => {
  it('onMount creates foreignObject + checkbox with data-widget-id', async () => {
    const { htmlSwitchMeta } = await import(
      '../../../controls/batch2/html-switch'
    );
    const ctx = makeCtx();
    const gauge = htmlSwitchMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const fo = ctx.parentGroup.querySelector('foreignObject');
    expect(fo).toBeTruthy();
    const checkbox = ctx.parentGroup.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).toBeTruthy();
    expect(fo?.getAttribute('data-widget-id')).toBe('w3');
  });

  it('onProcess with value "1" sets checkbox.checked = true when onValue="1"', async () => {
    const { htmlSwitchMeta } = await import(
      '../../../controls/batch2/html-switch'
    );
    const ctx = makeCtx();
    const gauge = htmlSwitchMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '1', isStale: false });
    const checkbox = ctx.parentGroup.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('onProcess with value "0" sets checkbox.checked = false', async () => {
    const { htmlSwitchMeta } = await import(
      '../../../controls/batch2/html-switch'
    );
    const ctx = makeCtx();
    const gauge = htmlSwitchMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: '0', isStale: false });
    const checkbox = ctx.parentGroup.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('change event in runtime mode calls ctx.onWriteIntent with onValue', async () => {
    const { htmlSwitchMeta } = await import(
      '../../../controls/batch2/html-switch'
    );
    const ctx = makeCtx('runtime');
    const gauge = htmlSwitchMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const checkbox = ctx.parentGroup.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(ctx.onWriteIntent).toHaveBeenCalledWith({
      tag: 'r1.DO-0',
      value: '1',
      widgetId: 'w3',
    });
  });

  it('onUnmount removes foreignObject and is idempotent', async () => {
    const { htmlSwitchMeta } = await import(
      '../../../controls/batch2/html-switch'
    );
    const ctx = makeCtx();
    const gauge = htmlSwitchMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBe(1);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});

// SP-FX-14: bitmask mode tests
describe('HtmlSwitchGauge — bitmask mode', () => {
  const makeBitmaskWidget = (bitmask: number) =>
    makeWidget({
      property: {
        variableId: 'r1.DO-0',
        onValue: '1',
        offValue: '0',
        bitmask,
      },
    } as Partial<FuxaWidget>);

  it('bitmask=0, tag value=1: checkbox checked (bit 0 is set)', async () => {
    const { htmlSwitchMeta } = await import('../../../controls/batch2/html-switch');
    const ctx = makeCtx();
    const gauge = htmlSwitchMeta.create();
    gauge.onMount(makeBitmaskWidget(0), ctx);
    gauge.onProcess({ value: 1, isStale: false });
    const checkbox = ctx.parentGroup.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('bitmask=0, tag value=0: checkbox unchecked (bit 0 is clear)', async () => {
    const { htmlSwitchMeta } = await import('../../../controls/batch2/html-switch');
    const ctx = makeCtx();
    const gauge = htmlSwitchMeta.create();
    gauge.onMount(makeBitmaskWidget(0), ctx);
    gauge.onProcess({ value: 0, isStale: false });
    const checkbox = ctx.parentGroup.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('bitmask=1, tag value=2 (0b10): checkbox checked (bit 1 is set)', async () => {
    const { htmlSwitchMeta } = await import('../../../controls/batch2/html-switch');
    const ctx = makeCtx();
    const gauge = htmlSwitchMeta.create();
    gauge.onMount(makeBitmaskWidget(1), ctx);
    gauge.onProcess({ value: 2, isStale: false });
    const checkbox = ctx.parentGroup.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('bitmask=1, tag value=1 (0b01): checkbox unchecked (bit 1 is clear)', async () => {
    const { htmlSwitchMeta } = await import('../../../controls/batch2/html-switch');
    const ctx = makeCtx();
    const gauge = htmlSwitchMeta.create();
    gauge.onMount(makeBitmaskWidget(1), ctx);
    gauge.onProcess({ value: 1, isStale: false });
    const checkbox = ctx.parentGroup.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('bitmask=1 runtime: check=true fires onWriteIntent with bit 1 set in current value', async () => {
    const { htmlSwitchMeta } = await import('../../../controls/batch2/html-switch');
    const ctx = makeCtx('runtime');
    // readValue returns current tag = 4 (0b100), setting bit 1 → 6 (0b110)
    (ctx.readValue as ReturnType<typeof vi.fn>).mockReturnValue({ value: 4, isStale: false });
    const gauge = htmlSwitchMeta.create();
    gauge.onMount(makeBitmaskWidget(1), ctx);
    const checkbox = ctx.parentGroup.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(ctx.onWriteIntent).toHaveBeenCalledWith({
      tag: 'r1.DO-0',
      value: 6, // 4 | (1 << 1) = 4 | 2 = 6
      widgetId: 'w3',
    });
  });
});
