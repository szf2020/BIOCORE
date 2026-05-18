// SP-FX-11 T3: Verify all 20 widget metas can be registered in a fresh GaugeRegistry.
// Uses an isolated registry to avoid cross-test pollution with the global gaugeRegistry singleton.
// vi.mock('uplot') is hoisted before imports to prevent matchMedia errors from uPlot's module init.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('uplot', () => {
  const ctor = vi.fn().mockImplementation(() => ({ setData: vi.fn(), setSize: vi.fn(), destroy: vi.fn() }));
  return { default: ctor };
});
import { GaugeRegistry } from '../gauge-registry';

// Batch 1
import { valueMeta } from '../controls/value';
import { htmlButtonMeta } from '../controls/html-button';
import { htmlInputMeta } from '../controls/html-input';
import { htmlChartMeta } from '../controls/html-chart';
import { htmlTableMeta } from '../controls/html-table';

// Batch 2
import { gaugeSemaphoreMeta } from '../controls/batch2/gauge-semaphore';
import { gaugeProgressMeta } from '../controls/batch2/gauge-progress';
import { htmlSwitchMeta } from '../controls/batch2/html-switch';
import { sliderMeta } from '../controls/batch2/slider';
import { pipeMeta } from '../controls/batch2/pipe';

// Batch 3
import { htmlBagMeta } from '../controls/batch3/html-bag';
import { htmlGraphMeta } from '../controls/batch3/html-graph';
import { tankMeta } from '../controls/batch3/tank';
import { motorMeta } from '../controls/batch3/motor';
import { htmlImageMeta } from '../controls/batch3/html-image';

// Batch 4
import { htmlIframeMeta } from '../controls/batch4/html-iframe';
import { compressorMeta } from '../controls/batch4/compressor';
import { valveMeta } from '../controls/batch4/valve';
import { pumpMeta } from '../controls/batch4/pump';
import { htmlSelectMeta } from '../controls/batch4/html-select';

const ALL_METAS = [
  // Batch 1
  valueMeta, htmlButtonMeta, htmlInputMeta, htmlChartMeta, htmlTableMeta,
  // Batch 2
  gaugeSemaphoreMeta, gaugeProgressMeta, htmlSwitchMeta, sliderMeta, pipeMeta,
  // Batch 3
  htmlBagMeta, htmlGraphMeta, tankMeta, motorMeta, htmlImageMeta,
  // Batch 4
  htmlIframeMeta, compressorMeta, valveMeta, pumpMeta, htmlSelectMeta,
];

const EXPECTED_WIDGET_TYPES = [
  // Batch 1
  'svg-ext-value',
  'svg-ext-html_button',
  'svg-ext-html_input',
  'svg-ext-html_chart',
  'svg-ext-own_ctrl-table',
  // Batch 2
  'svg-ext-gauge_semaphore',
  'svg-ext-gauge_progress',
  'svg-ext-html_switch',
  'svg-ext-html_slider',
  'svg-ext-pipe',
  // Batch 3
  'svg-ext-html_bag',
  'svg-ext-html_graph',
  'svg-ext-tank',
  'svg-ext-motor',
  'svg-ext-html_img',
  // Batch 4
  'svg-ext-html_iframe',
  'svg-ext-compressor',
  'svg-ext-valve',
  'svg-ext-pump',
  'svg-ext-html_select',
];

describe('controls-all-registered (SP-FX-11)', () => {
  let registry: GaugeRegistry;

  beforeEach(() => {
    registry = new GaugeRegistry();
    for (const meta of ALL_METAS) {
      registry.register(meta);
    }
  });

  it('all 20 widget metas register — registry.size === 20', () => {
    expect(registry.size).toBe(20);
  });

  it.each(EXPECTED_WIDGET_TYPES)(
    'widgetType "%s" is registered and create() returns non-null',
    (widgetType) => {
      expect(registry.has(widgetType)).toBe(true);
      const gauge = registry.create({ id: 'w1', type: widgetType, property: {} } as any);
      expect(gauge).not.toBeNull();
    },
  );
});
