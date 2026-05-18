import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditNameDialog } from '../EditNameDialog';

describe('EditNameDialog', () => {
  it('returns null when isOpen=false', () => {
    const { container } = render(
      <EditNameDialog isOpen={false} onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with text input when isOpen=true', () => {
    render(<EditNameDialog isOpen onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('confirm fires onConfirm(string)', () => {
    const onConfirm = vi.fn();
    render(
      <EditNameDialog
        isOpen
        initialValue="hello"
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'world' } });
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith('world');
  });

  it('blank string disables confirm', () => {
    render(<EditNameDialog isOpen onClose={() => {}} onConfirm={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    expect(screen.getByText('确认')).toBeDisabled();
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<EditNameDialog isOpen onClose={onClose} onConfirm={() => {}} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
