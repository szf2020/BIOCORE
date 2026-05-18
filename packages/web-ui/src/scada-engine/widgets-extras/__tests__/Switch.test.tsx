import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Switch } from '../Switch';

describe('Switch', () => {
  it('renders role=switch', () => {
    render(<Switch checked={false} onChange={() => {}} />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('aria-checked reflects state', () => {
    const { rerender } = render(<Switch checked={false} onChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    rerender(<Switch checked onChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('click fires onChange(!checked)', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders labelOn / labelOff', () => {
    const { rerender } = render(
      <Switch checked={false} labelOn="ON" labelOff="OFF" onChange={() => {}} />,
    );
    expect(screen.getByText('OFF')).toBeInTheDocument();
    rerender(
      <Switch checked labelOn="ON" labelOff="OFF" onChange={() => {}} />,
    );
    expect(screen.getByText('ON')).toBeInTheDocument();
  });

  it('disabled blocks click', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} disabled onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
