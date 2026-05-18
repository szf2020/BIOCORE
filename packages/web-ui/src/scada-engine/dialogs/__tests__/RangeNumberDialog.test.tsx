import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RangeNumberDialog } from '../RangeNumberDialog';

describe('RangeNumberDialog', () => {
  it('renders min and max number inputs', () => {
    render(
      <RangeNumberDialog isOpen onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(screen.getByLabelText('最小值')).toBeInTheDocument();
    expect(screen.getByLabelText('最大值')).toBeInTheDocument();
  });

  it('confirm returns {min, max}', () => {
    const onConfirm = vi.fn();
    render(
      <RangeNumberDialog
        isOpen
        initialValue={{ min: 0, max: 10 }}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByLabelText('最小值'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('最大值'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith({ min: 3, max: 12 });
  });

  it('min > max disables confirm', () => {
    render(
      <RangeNumberDialog
        isOpen
        initialValue={{ min: 10, max: 0 }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('确认')).toBeDisabled();
  });

  it('initialValue prepopulates inputs', () => {
    render(
      <RangeNumberDialog
        isOpen
        initialValue={{ min: 5, max: 25 }}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect((screen.getByLabelText('最小值') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('最大值') as HTMLInputElement).value).toBe('25');
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(
      <RangeNumberDialog isOpen onClose={onClose} onConfirm={() => {}} />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
