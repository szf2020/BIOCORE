import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Pump } from '../Pump';

describe('Pump', () => {
  it('1. running=false → no animate-spin class', () => {
    const { container } = render(<Pump running={false} width={80} height={80} />);
    const fan = container.querySelector('[data-testid="pump-fan"]');
    expect(fan?.getAttribute('class')).not.toContain('animate-spin');
  });

  it('2. running=true → animate-spin class', () => {
    const { container } = render(<Pump running={true} width={80} height={80} />);
    const fan = container.querySelector('[data-testid="pump-fan"]');
    expect(fan?.getAttribute('class')).toContain('animate-spin');
  });

  it('3. rate=120 unit=rpm → renders "120 rpm"', () => {
    const { getByText } = render(<Pump rate={120} unit="rpm" width={80} height={80} />);
    expect(getByText('120 rpm')).toBeTruthy();
  });
});
