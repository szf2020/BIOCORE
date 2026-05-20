// SP-FX-FF.8: comprehensive coverage — every gauge widget responds to the
// ColorPaletteBar wide patch by visibly changing at least one rendered color
// attribute. Each test mounts the widget, applies the wide color patch via
// onPropertyChange (matching the ColorPaletteBar flow), and asserts the DOM
// reflects the new color somewhere.

import { describe, it, expect, vi } from 'vitest';
import type { GaugeBase, GaugeContext, GaugeMeta } from '../gauge-base';
import type { FuxaWidget } from '../../models';

import { valueMeta, htmlButtonMeta, htmlInputMeta } from '../controls';
import {
  gaugeSemaphoreMeta, gaugeProgressMeta, htmlSwitchMeta, sliderMeta, pipeMeta,
} from '../controls/batch2';
import { tankMeta, htmlBagMeta, htmlGraphMeta, motorMeta, htmlImageMeta } from '../controls/batch3';
import { compressorMeta, valveMeta, pumpMeta, htmlSelectMeta } from '../controls/batch4';
import { panelMeta } from '../controls/batch5';

const COLOR = '#dc2626';
// jsdom normalizes inline-style colors to rgb(); accept either form.
const COLOR_RGB = 'rgb(220, 38, 38)';
const COLOR_FORMS = new Set<string>([COLOR, COLOR_RGB]);

const WIDE_PATCH = {
  fill: COLOR, color: COLOR, stroke: COLOR,
  bgColor: COLOR, fillColor: COLOR, borderColor: COLOR,
  barColor: COLOR, pipeColor: COLOR, tintColor: COLOR,
  bodyColor: COLOR, defaultColor: COLOR, lineColor: COLOR,
};

const makeGroup = () => document.createElementNS('http://www.w3.org/2000/svg', 'g') as SVGGElement;
const makeCtx = (mode: 'editor' | 'runtime' = 'editor'): GaugeContext => ({
  parentGroup: makeGroup(),
  readValue: vi.fn().mockReturnValue({ value: null, isStale: true }),
  canvasSize: { width: 800, height: 600 },
  mode,
  onWriteIntent: vi.fn(),
});

function walkColor(parent: SVGGElement): boolean {
  const nodes = Array.from(parent.querySelectorAll<Element>('*'));
  for (const n of nodes) {
    if (COLOR_FORMS.has(n.getAttribute('fill') ?? '')) return true;
    if (COLOR_FORMS.has(n.getAttribute('stroke') ?? '')) return true;
    const style = (n as HTMLElement).style;
    if (style) {
      if (COLOR_FORMS.has(style.backgroundColor)) return true;
      if (COLOR_FORMS.has(style.color)) return true;
      if (COLOR_FORMS.has(style.borderColor)) return true;
      if (COLOR_FORMS.has(style.outlineColor)) return true;
      // CSS accent-color isn't always in the style typings — use index access.
      if (COLOR_FORMS.has((style as unknown as Record<string, string>)['accentColor'] ?? '')) return true;
      // Inline `outline: 2px solid #...` shorthand may not split out outlineColor
      // reliably in jsdom; do a substring sanity check.
      const outline = (style as unknown as Record<string, string>)['outline'] ?? '';
      if (outline.toLowerCase().includes(COLOR.toLowerCase())) return true;
    }
  }
  return false;
}

/**
 * Simulates the canvas-svg upsert flow when a gauge widget property changes:
 * snapshot-diff triggers a full unmount + recreate, so onMount runs again
 * with the new property. We test that pathway (matches editor behavior) in
 * addition to onPropertyChange so widgets that only react via re-mount are
 * still considered "responsive".
 */
function applyAndAssertViaRemount(meta: GaugeMeta, type: string, initialProp: Record<string, unknown> = {}): boolean {
  const ctx = makeCtx();
  const baseWidget = { id: 'w1', type, property: initialProp, x: 0, y: 0, w: 100, h: 60 } as FuxaWidget;
  const g1 = meta.create();
  g1.onMount(baseWidget, ctx);
  // Try onPropertyChange path first (cheap)
  const nextWidget = { ...baseWidget, property: { ...initialProp, ...WIDE_PATCH } } as FuxaWidget;
  g1.onPropertyChange({ key: 'color', value: COLOR, nextWidget });
  if (walkColor(ctx.parentGroup)) return true;
  // Fall back to full re-mount path (matches canvas-svg snapshot-diff flow)
  g1.onUnmount();
  while (ctx.parentGroup.firstChild) ctx.parentGroup.removeChild(ctx.parentGroup.firstChild);
  const g2 = meta.create();
  g2.onMount(nextWidget, ctx);
  return walkColor(ctx.parentGroup);
}

describe('SP-FX-FF.8 wide-color-patch coverage (re-mount flow)', () => {
  const cases: Array<[string, GaugeMeta, string, Record<string, unknown>?]> = [
    ['svg-ext-value', valueMeta, 'svg-ext-value', {}],
    ['svg-ext-html_button', htmlButtonMeta, 'svg-ext-html_button', { label: 'Btn' }],
    ['svg-ext-html_img', htmlImageMeta, 'svg-ext-html_img', { src: 'about:blank' }],
    ['svg-ext-gauge_progress', gaugeProgressMeta, 'svg-ext-gauge_progress', {}],
    ['svg-ext-pipe', pipeMeta, 'svg-ext-pipe', {}],
    ['svg-ext-tank', tankMeta, 'svg-ext-tank', {}],
    ['svg-ext-panel', panelMeta, 'svg-ext-panel', {}],
    ['svg-ext-html_bag', htmlBagMeta, 'svg-ext-html_bag', {}],
    ['svg-ext-motor', motorMeta, 'svg-ext-motor', {}],
    ['svg-ext-compressor', compressorMeta, 'svg-ext-compressor', {}],
    ['svg-ext-pump', pumpMeta, 'svg-ext-pump', {}],
    ['svg-ext-html_graph', htmlGraphMeta, 'svg-ext-html_graph', {}],
    ['svg-ext-html_input', htmlInputMeta, 'svg-ext-html_input', { variableId: 'r1.AI-0' }],
    ['svg-ext-html_select', htmlSelectMeta, 'svg-ext-html_select', {}],
    ['svg-ext-html_switch', htmlSwitchMeta, 'svg-ext-html_switch', {}],
    ['svg-ext-html_slider', sliderMeta, 'svg-ext-html_slider', {}],
    ['svg-ext-gauge_semaphore', gaugeSemaphoreMeta, 'svg-ext-gauge_semaphore', {}],
    ['svg-ext-valve', valveMeta, 'svg-ext-valve', {}],
  ];

  for (const [label, meta, type, initial] of cases) {
    it(`${label} reacts to wide color patch via re-mount path`, () => {
      expect(applyAndAssertViaRemount(meta, type, initial ?? {})).toBe(true);
    });
  }
});
