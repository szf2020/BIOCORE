import { describe, it, expect } from 'vitest';
import { WIDGET_REGISTRY } from '../registry';
import type { WidgetTypeKey } from '../types';

describe('WIDGET_REGISTRY', () => {
  it('1. 8 entries, each with component/defaultProps/displayName', () => {
    const keys: WidgetTypeKey[] = ['tank', 'valve', 'pump', 'indicator', 'trend', 'label', 'button', 'lamp'];
    expect(Object.keys(WIDGET_REGISTRY).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      const entry = WIDGET_REGISTRY[k];
      expect(entry).toBeDefined();
      expect(typeof entry.component).toBe('function');
      expect(typeof entry.defaultProps).toBe('function');
      expect(typeof entry.displayName).toBe('string');
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(typeof entry.defaultProps()).toBe('object');
    }
  });
});
