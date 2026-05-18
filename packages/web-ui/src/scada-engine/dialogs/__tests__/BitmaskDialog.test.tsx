import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BitmaskDialog } from '../BitmaskDialog';

describe('BitmaskDialog', () => {
  it('renders 8 checkboxes by default', () => {
    render(<BitmaskDialog isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
  });

  it('renders N checkboxes when bits prop set', () => {
    render(<BitmaskDialog isOpen bits={4} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  });

  it('toggling bits updates onConfirm value (LSB = bit 0)', () => {
    const onConfirm = vi.fn();
    render(<BitmaskDialog isOpen bits={4} onClose={() => {}} onConfirm={onConfirm} />);
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[2]);
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith(5);
  });

  it('initialValue prepopulates bits', () => {
    render(
      <BitmaskDialog
        isOpen
        bits={4}
        initialValue={6}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes[0].checked).toBe(false);
    expect(boxes[1].checked).toBe(true);
    expect(boxes[2].checked).toBe(true);
    expect(boxes[3].checked).toBe(false);
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<BitmaskDialog isOpen onClose={onClose} onConfirm={() => {}} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
