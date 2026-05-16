// packages/web-ui/src/widgets/svg/__tests__/registry-builtins.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ensureBuiltinSvgWidgetsRegistered, listSvgWidgets } from '..';
import { _resetSvgRegistryForTests } from '../registry';

const EXPECTED_TYPES = [
  'svg-button', 'svg-chart', 'svg-gauge', 'svg-heater', 'svg-image',
  'svg-indicator', 'svg-input', 'svg-label', 'svg-lamp', 'svg-motor',
  'svg-pipe', 'svg-probe', 'svg-pump', 'svg-reactor', 'svg-rect',
  'svg-select', 'svg-sensor', 'svg-slider', 'svg-sparger', 'svg-stirrer',
  'svg-switch', 'svg-tank', 'svg-trend', 'svg-valve',
];

describe('SVG widget registry built-ins', () => {
  beforeEach(() => {
    _resetSvgRegistryForTests();
  });

  it('registers exactly 24 widgets after ensureBuiltinSvgWidgetsRegistered', () => {
    ensureBuiltinSvgWidgetsRegistered();
    expect(listSvgWidgets().length).toBe(24);
  });

  it('all expected type ids are present', () => {
    ensureBuiltinSvgWidgetsRegistered();
    const types = listSvgWidgets().map((r) => r.type).sort();
    expect(types).toEqual(EXPECTED_TYPES);
  });
});
