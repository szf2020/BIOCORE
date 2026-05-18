import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewListSearchBar } from '../ViewListSearchBar';

describe('ViewListSearchBar (SP-FX-21)', () => {
  const defaultProps = {
    q: '',
    sort: 'name_asc' as const,
    tags: [],
    availableTags: ['demo', 'prod'],
    onChange: vi.fn(),
  };

  beforeEach(() => {
    defaultProps.onChange = vi.fn();
  });

  it('renders search input with current q value', () => {
    render(<ViewListSearchBar {...defaultProps} q="hello" />);
    const input = screen.getByTestId('view-search-input') as HTMLInputElement;
    expect(input.value).toBe('hello');
  });

  it('renders sort select with current sort value', () => {
    render(<ViewListSearchBar {...defaultProps} sort="name_desc" />);
    const select = screen.getByTestId('view-sort-select') as HTMLSelectElement;
    expect(select.value).toBe('name_desc');
  });

  it('calls onChange with new q on input change', () => {
    render(<ViewListSearchBar {...defaultProps} />);
    fireEvent.change(screen.getByTestId('view-search-input'), { target: { value: 'alpha' } });
    expect(defaultProps.onChange).toHaveBeenCalledWith(expect.objectContaining({ q: 'alpha' }));
  });

  it('calls onChange with new sort on select change', () => {
    render(<ViewListSearchBar {...defaultProps} />);
    fireEvent.change(screen.getByTestId('view-sort-select'), { target: { value: 'mtime_desc' } });
    expect(defaultProps.onChange).toHaveBeenCalledWith(expect.objectContaining({ sort: 'mtime_desc' }));
  });

  it('renders tag chips for availableTags', () => {
    render(<ViewListSearchBar {...defaultProps} availableTags={['demo', 'prod']} />);
    expect(screen.getByTestId('tag-chip-demo')).toBeTruthy();
    expect(screen.getByTestId('tag-chip-prod')).toBeTruthy();
  });

  it('clicking a tag chip toggles it in onChange', () => {
    render(<ViewListSearchBar {...defaultProps} availableTags={['demo']} tags={[]} />);
    fireEvent.click(screen.getByTestId('tag-chip-demo'));
    expect(defaultProps.onChange).toHaveBeenCalledWith(expect.objectContaining({ tags: ['demo'] }));
  });

  it('renders empty without tag chips when no availableTags', () => {
    render(<ViewListSearchBar {...defaultProps} availableTags={[]} />);
    expect(screen.queryByTestId('tag-chip-demo')).toBeNull();
  });
});
