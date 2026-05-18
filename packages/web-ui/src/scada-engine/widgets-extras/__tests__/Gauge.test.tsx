import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Gauge } from '../Gauge';

describe('Gauge', () => {
  it('renders the numeric value text', () => {
    render(<Gauge value={42} min={0} max={100} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('clamps value above max to max', () => {
    render(<Gauge value={200} min={0} max={100} />);
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('clamps value below min to min', () => {
    render(<Gauge value={-10} min={0} max={100} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders label when provided', () => {
    render(<Gauge value={50} min={0} max={100} label="Temp" />);
    expect(screen.getByText('Temp')).toBeInTheDocument();
  });

  it('shows Invalid range when min>=max', () => {
    render(<Gauge value={50} min={100} max={0} />);
    expect(screen.getByText('Invalid range')).toBeInTheDocument();
  });

  it('applies threshold color to filled arc', () => {
    const { container } = render(
      <Gauge
        value={80}
        min={0}
        max={100}
        thresholds={[
          { value: 0, color: 'green' },
          { value: 75, color: 'red' },
        ]}
      />,
    );
    const arc = container.querySelector('[data-arc="value"]') as SVGPathElement;
    expect(arc).toBeTruthy();
    expect(arc.getAttribute('stroke')).toBe('red');
  });
});
