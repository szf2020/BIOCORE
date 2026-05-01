import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../context-builder';

describe('ContextBuilder', () => {
  it('构建实时上下文', () => {
    const ctx = ContextBuilder.buildRealtimeContext(
      { TEMP_PV: 37.2, PH_PV: 6.8, DO_PV: 30 }, 'running', 'FED_BATCH', 5.5
    );
    expect(ctx).toContain('running');
    expect(ctx).toContain('37.20');
    expect(ctx).toContain('5.5');
  });

  it('构建批次上下文', () => {
    const ctx = ContextBuilder.buildBatchContext(
      { maxOD: 25, finalPH: 6.5 },
      ['DO spike at 8h'],
      ['RF-03 温度偏差']
    );
    expect(ctx).toContain('maxOD');
    expect(ctx).toContain('DO spike');
    expect(ctx).toContain('RF-03');
  });
});
