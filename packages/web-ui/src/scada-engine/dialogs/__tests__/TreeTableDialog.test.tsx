import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreeTableDialog, type TreeTableNode } from '../TreeTableDialog';

const tree: TreeTableNode[] = [
  {
    id: 'root',
    label: 'Root',
    children: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  },
];

describe('TreeTableDialog', () => {
  it('renders top-level nodes', () => {
    render(<TreeTableDialog isOpen tree={tree} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('Root')).toBeInTheDocument();
  });

  it('renders nested children when expanded', () => {
    render(<TreeTableDialog isOpen tree={tree} onClose={() => {}} onConfirm={() => {}} />);
    const expandBtn = screen.getByRole('button', { name: /▸|▾/ });
    fireEvent.click(expandBtn);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('click on leaf toggles selection', () => {
    const onConfirm = vi.fn();
    render(<TreeTableDialog isOpen tree={tree} onClose={() => {}} onConfirm={onConfirm} />);
    const expandBtn = screen.getByRole('button', { name: /▸|▾/ });
    fireEvent.click(expandBtn);
    const checkbox = screen.getByLabelText('A') as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith(['a']);
  });

  it('initialValue prepopulates selection', () => {
    const onConfirm = vi.fn();
    render(
      <TreeTableDialog
        isOpen
        tree={tree}
        initialValue={['b']}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith(['b']);
  });

  it('empty tree shows 无可选项', () => {
    render(<TreeTableDialog isOpen tree={[]} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('无可选项')).toBeInTheDocument();
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<TreeTableDialog isOpen tree={tree} onClose={onClose} onConfirm={() => {}} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
