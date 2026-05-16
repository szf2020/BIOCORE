import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ScadaCanvas } from '../ScadaCanvas';
import { ensureBuiltinSvgWidgetsRegistered } from '../../../widgets/svg';
import { _resetSvgRegistryForTests } from '../../../widgets/svg/registry';
import {
  EMPTY_VIEW,
  SINGLE_RECT_VIEW,
  MULTI_ZINDEX_VIEW,
} from '../../../widgets/svg/__tests__/fixtures';

vi.mock('@/hooks/useTag', () => ({
  useTag: vi.fn(() => ({ value: undefined, isStale: false })),
}));

describe('ScadaCanvas', () => {
  beforeEach(() => {
    _resetSvgRegistryForTests();
    ensureBuiltinSvgWidgetsRegistered();
  });

  it('renders an <svg> with viewBox "0 0 W H"', () => {
    const { container } = render(<ScadaCanvas view={EMPTY_VIEW} reactorId="F01" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 800 600');
  });

  it('renders backing rect with view.background', () => {
    const view = { ...EMPTY_VIEW, background: '#eef' };
    const { container } = render(<ScadaCanvas view={view} reactorId="F01" />);
    const bg = container.querySelector('svg > rect');
    expect(bg?.getAttribute('fill')).toBe('#eef');
  });

  it('renders 3 groups (one per item) for MULTI_ZINDEX_VIEW', () => {
    const { container } = render(<ScadaCanvas view={MULTI_ZINDEX_VIEW} reactorId="F01" />);
    const groups = Array.from(container.querySelectorAll('svg > g'));
    expect(groups.length).toBe(3);
  });

  it('renders one widget per item (smoke for SINGLE_RECT_VIEW)', () => {
    const { container } = render(<ScadaCanvas view={SINGLE_RECT_VIEW} reactorId="F01" />);
    expect(container.querySelectorAll('svg > g').length).toBe(1);
    expect(container.querySelector('svg > g > rect')).not.toBeNull();
  });

  it('renders empty <svg> for empty items', () => {
    const { container } = render(<ScadaCanvas view={EMPTY_VIEW} reactorId="F01" />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelectorAll('svg > g').length).toBe(0);
  });

  it('renders ViewErrorDisplay when view.width is invalid', () => {
    const bad = { ...EMPTY_VIEW, width: 0 };
    const { container, getByRole } = render(
      <ScadaCanvas view={bad as unknown as typeof EMPTY_VIEW} reactorId="F01" />,
    );
    expect(container.querySelector('svg')).toBeNull();
    expect(getByRole('alert')).not.toBeNull();
  });
});
