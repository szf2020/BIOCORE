import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewListToolbar } from '../ViewListToolbar';

describe('ViewListToolbar', () => {
  it('renders cards and list toggle buttons', () => {
    render(<ViewListToolbar viewMode="cards" onModeChange={vi.fn()} pageSize={12} onPageSizeChange={vi.fn()} />);
    expect(screen.getByTestId('view-mode-cards')).toBeTruthy();
    expect(screen.getByTestId('view-mode-list')).toBeTruthy();
  });

  it('cards button is active when viewMode=cards', () => {
    render(<ViewListToolbar viewMode="cards" onModeChange={vi.fn()} pageSize={12} onPageSizeChange={vi.fn()} />);
    const cardsBtn = screen.getByTestId('view-mode-cards');
    expect(cardsBtn.getAttribute('aria-pressed')).toBe('true');
    const listBtn = screen.getByTestId('view-mode-list');
    expect(listBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking list toggle calls onModeChange with "list"', () => {
    const onChange = vi.fn();
    render(<ViewListToolbar viewMode="cards" onModeChange={onChange} pageSize={12} onPageSizeChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('view-mode-list'));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('page-size select shows current value', () => {
    render(<ViewListToolbar viewMode="cards" onModeChange={vi.fn()} pageSize={24} onPageSizeChange={vi.fn()} />);
    const select = screen.getByTestId('page-size-select') as HTMLSelectElement;
    expect(select.value).toBe('24');
  });

  it('page-size change calls onPageSizeChange', () => {
    const onSizeChange = vi.fn();
    render(<ViewListToolbar viewMode="cards" onModeChange={vi.fn()} pageSize={12} onPageSizeChange={onSizeChange} />);
    fireEvent.change(screen.getByTestId('page-size-select'), { target: { value: '48' } });
    expect(onSizeChange).toHaveBeenCalledWith(48);
  });
});
