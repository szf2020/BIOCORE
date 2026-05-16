import { describe, it, expect, beforeEach } from 'vitest';
import { registerSvg, getSvgWidget, listSvgWidgets, _resetSvgRegistryForTests } from '../registry';
import type { SvgWidgetComponent } from '../types';

const DummyComp: SvgWidgetComponent = () => null;

describe('SVG widget registry', () => {
  beforeEach(() => {
    _resetSvgRegistryForTests();
  });

  it('returns the registration after registering', () => {
    registerSvg({ type: 'svg-foo', label: 'Foo', component: DummyComp });
    const reg = getSvgWidget('svg-foo');
    expect(reg?.type).toBe('svg-foo');
    expect(reg?.label).toBe('Foo');
    expect(reg?.component).toBe(DummyComp);
  });

  it('returns undefined for unknown type', () => {
    expect(getSvgWidget('unknown')).toBeUndefined();
  });

  it('listSvgWidgets returns all registered, sorted by type', () => {
    registerSvg({ type: 'svg-zeta', label: 'Z', component: DummyComp });
    registerSvg({ type: 'svg-alpha', label: 'A', component: DummyComp });
    const types = listSvgWidgets().map((r) => r.type);
    expect(types).toEqual(['svg-alpha', 'svg-zeta']);
  });

  it('throws on duplicate type', () => {
    registerSvg({ type: 'svg-dup', label: 'Dup', component: DummyComp });
    expect(() => registerSvg({ type: 'svg-dup', label: 'Dup2', component: DummyComp })).toThrow(
      /duplicate widget type/i,
    );
  });
});
