// SP-FX-10 T9: RED tests for HtmlSelectGauge (foreignObject select + WriteIntent).
// HTML select element, onChange triggers ctx.onWriteIntent in runtime mode only.
import { describe, it, expect, vi } from 'vitest';
import type { GaugeContext } from '../../../gauge-base';
import type { FuxaWidget } from '../../../../models';

const makeWidget = (overrides: Partial<FuxaWidget> = {}): FuxaWidget => ({
  id: 'w-select1',
  type: 'svg-ext-html_select',
  x: 10,
  y: 20,
  w: 120,
  h: 30,
  property: {
    variableId: 'r1.recipe-step',
    options: [
      { value: 'a', label: '步骤 A' },
      { value: 'b', label: '步骤 B' },
      { value: 'c', label: '步骤 C' },
    ],
    placeholder: '请选择...',
  },
  ...overrides,
} as unknown as FuxaWidget);

const makeCtx = (mode: 'editor' | 'runtime' = 'editor'): GaugeContext & { onWriteIntent: ReturnType<typeof vi.fn> } => {
  const onWriteIntent = vi.fn();
  return {
    parentGroup: document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement,
    readValue: vi.fn().mockReturnValue({ value: null, isStale: false }),
    canvasSize: { width: 800, height: 600 },
    mode,
    onWriteIntent,
  };
};

describe('HtmlSelectGauge', () => {
  it('onMount creates foreignObject + select with injected option elements', async () => {
    const { htmlSelectMeta } = await import('../../../controls/batch4/html-select');
    const ctx = makeCtx();
    const gauge = htmlSelectMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const fo = ctx.parentGroup.querySelector('foreignObject');
    expect(fo).toBeTruthy();
    const select = fo?.querySelector('select');
    expect(select).toBeTruthy();
    const options = select?.querySelectorAll('option');
    // 3 options + 1 placeholder
    expect(options?.length).toBeGreaterThanOrEqual(3);
  });

  it('onProcess with value="b" syncs select.value to "b"', async () => {
    const { htmlSelectMeta } = await import('../../../controls/batch4/html-select');
    const ctx = makeCtx('runtime');
    const gauge = htmlSelectMeta.create();
    gauge.onMount(makeWidget(), ctx);
    gauge.onProcess({ value: 'b', isStale: false });
    const select = ctx.parentGroup.querySelector('foreignObject select') as HTMLSelectElement | null;
    expect(select?.value).toBe('b');
  });

  it('onChange in runtime mode calls ctx.onWriteIntent with tag and value', async () => {
    const { htmlSelectMeta } = await import('../../../controls/batch4/html-select');
    const ctx = makeCtx('runtime');
    const gauge = htmlSelectMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const select = ctx.parentGroup.querySelector('foreignObject select') as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    // Manually set value and fire change event
    select!.value = 'c';
    select!.dispatchEvent(new Event('change'));
    expect(ctx.onWriteIntent).toHaveBeenCalledOnce();
    expect(ctx.onWriteIntent).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'r1.recipe-step', value: 'c', widgetId: 'w-select1' })
    );
  });

  it('onChange in editor mode does NOT call ctx.onWriteIntent', async () => {
    const { htmlSelectMeta } = await import('../../../controls/batch4/html-select');
    const ctx = makeCtx('editor');
    const gauge = htmlSelectMeta.create();
    gauge.onMount(makeWidget(), ctx);
    const select = ctx.parentGroup.querySelector('foreignObject select') as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    select!.value = 'a';
    select!.dispatchEvent(new Event('change'));
    expect(ctx.onWriteIntent).not.toHaveBeenCalled();
  });

  it('onUnmount removes foreignObject and is idempotent', async () => {
    const { htmlSelectMeta } = await import('../../../controls/batch4/html-select');
    const ctx = makeCtx();
    const gauge = htmlSelectMeta.create();
    gauge.onMount(makeWidget(), ctx);
    expect(ctx.parentGroup.childElementCount).toBe(1);
    gauge.onUnmount();
    expect(ctx.parentGroup.childElementCount).toBe(0);
    expect(() => gauge.onUnmount()).not.toThrow();
  });
});
