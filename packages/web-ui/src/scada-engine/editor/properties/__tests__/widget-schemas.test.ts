import { describe, it, expect } from 'vitest';
import {
  valueSchema, htmlButtonSchema, htmlInputSchema, htmlChartSchema, htmlTableSchema,
  gaugeSemaphoreSchema, gaugeProgressSchema, htmlSwitchSchema, sliderSchema, pipeSchema,
  htmlBagSchema, htmlGraphSchema, tankSchema, motorSchema, htmlImageSchema,
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

  // SP-FX-9 batch 3 schema tests (+10)

  it('htmlBagSchema has tag-ref variableId entry and geometric x/y/w/h', () => {
    const entry = htmlBagSchema.entries.find(e => e.key === 'variableId');
    expect(entry?.type).toBe('tag-ref');
    const geoKeys = htmlBagSchema.entries.filter(e => e.geometric).map(e => e.key);
    expect(geoKeys).toEqual(expect.arrayContaining(['x', 'y', 'w', 'h']));
  });

  it('htmlBagSchema has shape select entry with circle and rect options', () => {
    const shapeEntry = htmlBagSchema.entries.find(e => e.key === 'shape');
    expect(shapeEntry?.type).toBe('select');
    const optionValues = (shapeEntry as any)?.options?.map((o: any) => o.value);
    expect(optionValues).toContain('circle');
    expect(optionValues).toContain('rect');
  });

  it('htmlGraphSchema has tag-ref variableId entry and geometric x/y/w/h', () => {
    const entry = htmlGraphSchema.entries.find(e => e.key === 'variableId');
    expect(entry?.type).toBe('tag-ref');
    const geoKeys = htmlGraphSchema.entries.filter(e => e.geometric).map(e => e.key);
    expect(geoKeys).toEqual(expect.arrayContaining(['x', 'y', 'w', 'h']));
  });

  it('htmlGraphSchema has maxPoints number entry', () => {
    const entry = htmlGraphSchema.entries.find(e => e.key === 'maxPoints');
    expect(entry?.type).toBe('number');
  });

  it('tankSchema has tag-ref variableId entry and geometric x/y/w/h', () => {
    const entry = tankSchema.entries.find(e => e.key === 'variableId');
    expect(entry?.type).toBe('tag-ref');
    const geoKeys = tankSchema.entries.filter(e => e.geometric).map(e => e.key);
    expect(geoKeys).toEqual(expect.arrayContaining(['x', 'y', 'w', 'h']));
  });

  it('tankSchema has fillColor and bgColor color entries', () => {
    const fillEntry = tankSchema.entries.find(e => e.key === 'fillColor');
    const bgEntry = tankSchema.entries.find(e => e.key === 'bgColor');
    expect(fillEntry?.type).toBe('color');
    expect(bgEntry?.type).toBe('color');
  });

  it('motorSchema has tag-ref variableId entry, geometric x/y/w/h, and renderCustomSection', () => {
    const entry = motorSchema.entries.find(e => e.key === 'variableId');
    expect(entry?.type).toBe('tag-ref');
    const geoKeys = motorSchema.entries.filter(e => e.geometric).map(e => e.key);
    expect(geoKeys).toEqual(expect.arrayContaining(['x', 'y', 'w', 'h']));
    expect(typeof motorSchema.renderCustomSection).toBe('function');
  });

  it('motorSchema renderCustomSection returns element with data-section="motor-states"', () => {
    const result = motorSchema.renderCustomSection!({}, () => {});
    expect(result).toBeTruthy();
    expect((result as any).props['data-section']).toBe('motor-states');
  });

  it('htmlImageSchema has src text entry, fit select entry, and geometric x/y/w/h', () => {
    const srcEntry = htmlImageSchema.entries.find(e => e.key === 'src');
    expect(srcEntry?.type).toBe('text');
    const fitEntry = htmlImageSchema.entries.find(e => e.key === 'fit');
    expect(fitEntry?.type).toBe('select');
    const geoKeys = htmlImageSchema.entries.filter(e => e.geometric).map(e => e.key);
    expect(geoKeys).toEqual(expect.arrayContaining(['x', 'y', 'w', 'h']));
  });

  it('WIDGET_SCHEMAS includes all 5 batch-3 widget types', async () => {
    const { WIDGET_SCHEMAS } = await import('../widget-schemas');
    expect(WIDGET_SCHEMAS['svg-ext-html_bag']).toBeDefined();
    expect(WIDGET_SCHEMAS['svg-ext-html_graph']).toBeDefined();
    expect(WIDGET_SCHEMAS['svg-ext-tank']).toBeDefined();
    expect(WIDGET_SCHEMAS['svg-ext-motor']).toBeDefined();
    expect(WIDGET_SCHEMAS['svg-ext-html_img']).toBeDefined();
  });
});
