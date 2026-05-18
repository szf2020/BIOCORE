import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NouiSlider } from '../NouiSlider';

describe('NouiSlider', () => {
  it('renders role=slider', () => {
    render(<NouiSlider value={50} min={0} max={100} onChange={() => {}} />);
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('aria-valuenow reflects value', () => {
    render(<NouiSlider value={42} min={0} max={100} onChange={() => {}} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '42');
  });

  it('change fires onChange with new number', () => {
    const onChange = vi.fn();
    render(<NouiSlider value={50} min={0} max={100} onChange={onChange} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } });
    expect(onChange).toHaveBeenCalledWith(70);
  });

  it('step rounding', () => {
    render(<NouiSlider value={50} min={0} max={100} step={10} onChange={() => {}} />);
    const el = screen.getByRole('slider') as HTMLInputElement;
    expect(el.step).toBe('10');
  });

  it('clamps value to max if above range', () => {
    render(<NouiSlider value={200} min={0} max={100} onChange={() => {}} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '100');
  });

  it('clamps value to min if below range', () => {
    render(<NouiSlider value={-50} min={0} max={100} onChange={() => {}} />);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '0');
  });

  it('step<=0 falls back to 1', () => {
    render(<NouiSlider value={50} min={0} max={100} step={0} onChange={() => {}} />);
    const el = screen.getByRole('slider') as HTMLInputElement;
    expect(el.step).toBe('1');
  });
});
