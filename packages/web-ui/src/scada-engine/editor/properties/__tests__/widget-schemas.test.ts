import { describe, it, expect } from 'vitest';
import { valueSchema, htmlButtonSchema, htmlInputSchema, htmlChartSchema, htmlTableSchema } from '../widget-schemas';

describe('widget-schemas', () => {
  it('all 5 schemas export valid entries arrays with string keys and labels', () => {
    const schemas = [valueSchema, htmlButtonSchema, htmlInputSchema, htmlChartSchema, htmlTableSchema];
    for (const schema of schemas) {
      expect(Array.isArray(schema.entries)).toBe(true);
      expect(schema.entries.length).toBeGreaterThan(0);
      for (const entry of schema.entries) {
        expect(typeof entry.key).toBe('string');
        expect(typeof entry.label).toBe('string');
        expect(typeof entry.type).toBe('string');
      }
    }
  });

  it('chart and table schemas include renderCustomSection; others do not', () => {
    expect(typeof htmlChartSchema.renderCustomSection).toBe('function');
    expect(typeof htmlTableSchema.renderCustomSection).toBe('function');
    expect(valueSchema.renderCustomSection).toBeUndefined();
    expect(htmlButtonSchema.renderCustomSection).toBeUndefined();
    expect(htmlInputSchema.renderCustomSection).toBeUndefined();
  });
});
