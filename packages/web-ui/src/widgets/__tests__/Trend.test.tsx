import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/components/charts/EChartsWrapper', () => {
  const EChartsWrapper = (props: any) => (
    <div data-testid="echarts" data-option={JSON.stringify(props.option)} />
  );
  return { __esModule: true, default: EChartsWrapper, EChartsWrapper };
});

vi.mock('@/hooks', () => ({
  useTagHistory: vi.fn(() => ({
    points: Array.from({ length: 5 }, (_, i) => ({ t: 1700000000000 + i * 1000, v: i + 1 })),
    isStale: false,
  })),
}));

import { Trend } from '../Trend';

describe('Trend', () => {
  it('1. series=[] → option.series length 0', () => {
    const { getByTestId } = render(<Trend series={[]} width={400} height={200} />);
    const node = getByTestId('echarts');
    const opt = JSON.parse(node.getAttribute('data-option')!);
    expect(opt.series).toBeDefined();
    expect(opt.series.length).toBe(0);
  });

  it('2. series=[{tag:"F01.AI-0"}] → option.series[0].data has 5 points', () => {
    const { getByTestId } = render(
      <Trend series={[{ tag: 'F01.AI-0' }]} width={400} height={200} />
    );
    const node = getByTestId('echarts');
    const opt = JSON.parse(node.getAttribute('data-option')!);
    expect(opt.series.length).toBe(1);
    expect(opt.series[0].data.length).toBe(5);
  });
});
