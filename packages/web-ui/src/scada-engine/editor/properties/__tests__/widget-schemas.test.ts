import { describe, it, expect } from 'vitest';
import {
  valueSchema, htmlButtonSchema, htmlInputSchema, htmlChartSchema, htmlTableSchema,
  gaugeSemaphoreSchema, gaugeProgressSchema, htmlSwitchSchema, sliderSchema, pipeSchema,
} from '../widget-schemas';

describe('widget-schemas', () => {
  it('all 5 batch-1 schemas export valid entries arrays with string keys and labels', () => {
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

  // SP-FX-6.2 batch 2 schema tests (+10)

  it('gaugeSemaphoreSchema has tag-ref variableId entry', () => {
    const entry = gaugeSemaphoreSchema.entries.find(e => e.key === 'variableId');
    expect(entry?.type).toBe('tag-ref');
  });

  it('gaugeSemaphoreSchema has geometric x/y/w/h entries and renderCustomSection', () => {
    const geoKeys = gaugeSemaphoreSchema.entries.filter(e => e.geometric).map(e => e.key);
    expect(geoKeys).toEqual(expect.arrayContaining(['x', 'y', 'w', 'h']));
    expect(typeof gaugeSemaphoreSchema.renderCustomSection).toBe('function');
  });

  it('gaugeProgressSchema has tag-ref variableId entry', () => {
    const entry = gaugeProgressSchema.entries.find(e => e.key === 'variableId');
    expect(entry?.type).toBe('tag-ref');
  });

  it('gaugeProgressSchema has geometric x/y/w/h entries', () => {
    const geoKeys = gaugeProgressSchema.entries.filter(e => e.geometric).map(e => e.key);
    expect(geoKeys).toEqual(expect.arrayContaining(['x', 'y', 'w', 'h']));
  });

  it('htmlSwitchSchema has tag-ref variableId entry', () => {
    const entry = htmlSwitchSchema.entries.find(e => e.key === 'variableId');
    expect(entry?.type).toBe('tag-ref');
  });

  it('htmlSwitchSchema has geometric x/y/w/h entries', () => {
    const geoKeys = htmlSwitchSchema.entries.filter(e => e.geometric).map(e => e.key);
    expect(geoKeys).toEqual(expect.arrayContaining(['x', 'y', 'w', 'h']));
  });

  it('sliderSchema has tag-ref variableId entry', () => {
    const entry = sliderSchema.entries.find(e => e.key === 'variableId');
    expect(entry?.type).toBe('tag-ref');
  });

  it('sliderSchema has geometric x/y/w/h entries', () => {
    const geoKeys = sliderSchema.entries.filter(e => e.geometric).map(e => e.key);
    expect(geoKeys).toEqual(expect.arrayContaining(['x', 'y', 'w', 'h']));
  });

  it('pipeSchema has tag-ref variableId entry', () => {
    const entry = pipeSchema.entries.find(e => e.key === 'variableId');
    expect(entry?.type).toBe('tag-ref');
  });

  it('pipeSchema has geometric x/y/w/h entries', () => {
    const geoKeys = pipeSchema.entries.filter(e => e.geometric).map(e => e.key);
    expect(geoKeys).toEqual(expect.arrayContaining(['x', 'y', 'w', 'h']));
  });
});
