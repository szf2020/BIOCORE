import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog (SP-FX-2)', () => {
  it('renders title and message when open', () => {
    render(<ConfirmDialog open title="确认下发" message="将温度设为 80°C ?" onConfirm={() => {}} />);
    expect(screen.getByText('确认下发')).toBeInTheDocument();
    expect(screen.getByText('将温度设为 80°C ?')).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    render(<ConfirmDialog open={false} title="x" message="y" onConfirm={() => {}} />);
    expect(screen.queryByText('x')).not.toBeInTheDocument();
  });

  it('clicking confirm triggers onConfirm', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open title="t" message="m" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /确认/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('clicking cancel triggers onCancel when provided', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="t" message="m" onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /取消/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders danger styling when danger=true', () => {
    render(<ConfirmDialog open title="t" message="m" danger onConfirm={() => {}} />);
    const confirmBtn = screen.getByRole('button', { name: /确认/i });
    expect(confirmBtn.className).toMatch(/destructive|red|danger/i);
  });
});
