import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateRangePickerDialog } from '../DateRangePickerDialog';

const today = new Date('2026-05-17T00:00:00Z');
const tomorrow = new Date('2026-05-18T00:00:00Z');

describe('DateRangePickerDialog', () => {
  it('returns null when isOpen=false', () => {
    const { container } = render(
      <DateRangePickerDialog isOpen={false} onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog when isOpen=true', () => {
    render(
      <DateRangePickerDialog isOpen onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('confirm fires onConfirm({from,to})', () => {
    const onConfirm = vi.fn();
    render(
      <DateRangePickerDialog
        isOpen
        initialValue={{ from: today, to: tomorrow }}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const arg = onConfirm.mock.calls[0][0];
    expect(arg.from).toBeInstanceOf(Date);
    expect(arg.to).toBeInstanceOf(Date);
    expect(arg.from.getTime()).toBeLessThanOrEqual(arg.to.getTime());
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    render(
      <DateRangePickerDialog isOpen onClose={onClose} onConfirm={() => {}} />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('from > to disables confirm button', () => {
    render(
      <DateRangePickerDialog
        isOpen
        initialValue={{ from: tomorrow, to: today }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('确认')).toBeDisabled();
  });

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn();
    render(
      <DateRangePickerDialog isOpen onClose={onClose} onConfirm={() => {}} />,
    );
    const backdrop = document.querySelector('[data-backdrop]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
