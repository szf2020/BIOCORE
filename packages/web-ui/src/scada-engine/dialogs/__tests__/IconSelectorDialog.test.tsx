import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconSelectorDialog, ICON_LIST } from '../IconSelectorDialog';

describe('IconSelectorDialog', () => {
  it('renders all icons by default', () => {
    render(<IconSelectorDialog isOpen onClose={() => {}} onConfirm={() => {}} />);
    const grid = document.querySelector('[data-dialog="icon-selector"] ul') as HTMLElement;
    expect(grid.querySelectorAll('li').length).toBe(ICON_LIST.length);
  });

  it('ICON_LIST has at least 50 entries', () => {
    expect(ICON_LIST.length).toBeGreaterThanOrEqual(50);
  });

  it('search filters by icon name (case-insensitive)', () => {
    render(<IconSelectorDialog isOpen onClose={() => {}} onConfirm={() => {}} />);
    const input = screen.getByPlaceholderText('搜索图标...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'home' } });
    const grid = document.querySelector('[data-dialog="icon-selector"] ul') as HTMLElement;
    const cells = grid.querySelectorAll('li');
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((li) => {
      expect((li.getAttribute('data-icon') ?? '').toLowerCase().includes('home')).toBe(true);
    });
  });

  it('clicking icon then confirm fires onConfirm(iconId)', () => {
    const onConfirm = vi.fn();
    render(<IconSelectorDialog isOpen onClose={() => {}} onConfirm={onConfirm} />);
    const first = document.querySelector('[data-dialog="icon-selector"] li[data-icon]') as HTMLElement;
    const iconId = first.getAttribute('data-icon');
    fireEvent.click(first);
    fireEvent.click(screen.getByText('确认'));
    expect(onConfirm).toHaveBeenCalledWith(iconId);
  });

  it('initialValue highlights the matching icon', () => {
    const id = ICON_LIST[2]!;
    render(
      <IconSelectorDialog
        isOpen
        initialValue={id}
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const cell = document.querySelector(`[data-icon="${id}"]`) as HTMLElement;
    expect(cell.getAttribute('data-selected')).toBe('true');
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<IconSelectorDialog isOpen onClose={onClose} onConfirm={() => {}} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
