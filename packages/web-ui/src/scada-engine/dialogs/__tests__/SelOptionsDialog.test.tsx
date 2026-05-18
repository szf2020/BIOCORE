import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelOptionsDialog } from '../SelOptionsDialog';

const opts = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
];

describe('SelOptionsDialog', () => {
  it('multi=true confirm returns string[]', () => {
    const onConfirm = vi.fn();
    render(
      <SelOptionsDialog
        isOpen
        options={opts}
        multi
        initialValue={['a']}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('Banana'));
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][0]).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('multi=false confirm returns single string', () => {
    const onConfirm = vi.fn();
    render(
      <SelOptionsDialog
        isOpen
        options={opts}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('Cherry'));
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith('c');
  });

  it('empty options shows 无可选项 placeholder', () => {
    render(
      <SelOptionsDialog
        isOpen
        options={[]}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('无可选项')).toBeInTheDocument();
  });

  it('clicking same option twice toggles in multi mode', () => {
    const onConfirm = vi.fn();
    render(
      <SelOptionsDialog
        isOpen
        options={opts}
        multi
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('Apple'));
    fireEvent.click(screen.getByText('Apple'));
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm.mock.calls[0][0]).toEqual([]);
  });

  it('confirm disabled with no selection (single mode)', () => {
    render(
      <SelOptionsDialog
        isOpen
        options={opts}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByText('确认')).toBeDisabled();
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(
      <SelOptionsDialog
        isOpen
        options={opts}
        onClose={onClose}
        onConfirm={() => {}}
      />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
