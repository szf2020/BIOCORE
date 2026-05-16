import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SvgChart } from '../SvgChart';

vi.mock('@/hooks/useTagHistory', () => ({
  useTagHistory: vi.fn(() => ({
    points: [
      { t: 0, v: 1 },
      { t: 1, v: 2 },
      { t: 2, v: 3 },
      { t: 3, v: 4 },
    ],
    isStale: false,
  })),
}));

import { useTagHistory } from '@/hooks/useTagHistory';
const useTagHistoryMock = useTagHistory as unknown as ReturnType<typeof vi.fn>;

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgChart', () => {
  beforeEach(() => {
    useTagHistoryMock.mockReset();
    useTagHistoryMock.mockReturnValue({
      points: [
        { t: 0, v: 1 },
        { t: 1, v: 2 },
        { t: 2, v: 3 },
        { t: 3, v: 4 },
      ],
      isStale: false,
    });
  });

  it('renders one rect per history point', () => {
    const { container } = renderInSvg(<SvgChart width={200} height={100} tagName="F01.TEMP" />);
    expect(container.querySelectorAll('rect').length).toBe(4);
  });

  it('renders no rects but applies opacity-50 when history is empty and stale', () => {
    useTagHistoryMock.mockReturnValue({ points: [], isStale: true });
    const { container } = renderInSvg(<SvgChart width={200} height={100} tagName="F01.TEMP" />);
    expect(container.querySelectorAll('rect').length).toBe(0);
    const g = container.querySelector('g');
    expect(g?.getAttribute('class')).toContain('opacity-50');
  });
});
