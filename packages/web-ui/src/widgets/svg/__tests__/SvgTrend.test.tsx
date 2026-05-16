import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { SvgTrend } from '../SvgTrend';

vi.mock('@/hooks/useTagHistory', () => ({
  useTagHistory: vi.fn(() => ({
    points: [{ t: 0, v: 10 }, { t: 1000, v: 20 }, { t: 2000, v: 30 }],
    isStale: false,
  })),
}));

import { useTagHistory } from '@/hooks/useTagHistory';
const useTagHistoryMock = useTagHistory as unknown as ReturnType<typeof vi.fn>;

function renderInSvg(node: React.ReactNode) {
  return render(<svg>{node}</svg>);
}

describe('SvgTrend', () => {
  beforeEach(() => {
    useTagHistoryMock.mockReset();
    useTagHistoryMock.mockReturnValue({
      points: [{ t: 0, v: 10 }, { t: 1000, v: 20 }, { t: 2000, v: 30 }],
      isStale: false,
    });
  });

  it('renders polyline with one point per history sample', () => {
    const { container } = renderInSvg(<SvgTrend width={100} height={50} tagName="F01.TEMP" />);
    const poly = container.querySelector('polyline');
    expect(poly).not.toBeNull();
    expect((poly?.getAttribute('points') ?? '').trim().split(/\s+/).length).toBe(3);
  });

  it('renders empty polyline when history is empty', () => {
    useTagHistoryMock.mockReturnValue({ points: [], isStale: true });
    const { container } = renderInSvg(<SvgTrend width={100} height={50} tagName="F01.TEMP" />);
    expect(container.querySelector('polyline')?.getAttribute('points')).toBe('');
  });

  it('passes windowSec from config.windowSec', () => {
    renderInSvg(<SvgTrend width={100} height={50} tagName="F01.TEMP" config={{ windowSec: 30 }} />);
    expect(useTagHistoryMock).toHaveBeenCalledWith('F01.TEMP', { windowSec: 30 });
  });
});
