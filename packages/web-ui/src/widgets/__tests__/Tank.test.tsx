import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Tank } from '../Tank';

describe('Tank', () => {
  it('1. fillPct=0 → fill rect height 0', () => {
    const { container } = render(<Tank fillPct={0} width={100} height={200} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]');
    expect(fillRect).toBeTruthy();
    expect(Number(fillRect!.getAttribute('height'))).toBe(0);
  });

  it('2. fillPct=50 → fill height ≈ half of inner', () => {
    const { container } = render(<Tank fillPct={50} width={100} height={200} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]') as SVGRectElement;
    const fillH = Number(fillRect.getAttribute('height'));
    expect(fillH).toBeGreaterThan(80);
    expect(fillH).toBeLessThan(120);
  });

  it('3. fillPct=100 → fill height ≈ inner full', () => {
    const { container } = render(<Tank fillPct={100} width={100} height={200} />);
    const fillRect = container.querySelector('rect[data-testid="tank-fill"]') as SVGRectElement;
    const fillH = Number(fillRect.getAttribute('height'));
    expect(fillH).toBeGreaterThanOrEqual(180);
    expect(fillH).toBeLessThanOrEqual(200);
  });
});
