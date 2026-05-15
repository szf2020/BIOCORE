import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Lamp } from '../Lamp';

describe('Lamp', () => {
  it('1. on=false → fill = colorOff', () => {
    const { container } = render(
      <Lamp on={false} colorOn="#ef4444" colorOff="#e5e7eb" width={40} height={40} />
    );
    const circle = container.querySelector('circle[data-testid="lamp"]');
    expect(circle?.getAttribute('fill')).toBe('#e5e7eb');
  });

  it('2. on=true → fill = colorOn', () => {
    const { container } = render(
      <Lamp on={true} colorOn="#ef4444" colorOff="#e5e7eb" width={40} height={40} />
    );
    const circle = container.querySelector('circle[data-testid="lamp"]');
    expect(circle?.getAttribute('fill')).toBe('#ef4444');
  });

  it('3. on=true + blink=true → wrapper has animate-pulse class', () => {
    const { container } = render(<Lamp on={true} blink={true} width={40} height={40} />);
    const wrapper = container.querySelector('[data-testid="lamp-wrapper"]');
    expect(wrapper?.className).toContain('animate-pulse');
  });
});
