import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewPaginator } from '../ViewPaginator';

describe('ViewPaginator', () => {
  it('renders paginator container', () => {
    render(<ViewPaginator page={1} total={50} size={12} onPageChange={vi.fn()} onSizeChange={vi.fn()} />);
    expect(screen.getByTestId('paginator')).toBeTruthy();
  });

  it('prev button disabled on first page', () => {
    render(<ViewPaginator page={1} total={50} size={12} onPageChange={vi.fn()} onSizeChange={vi.fn()} />);
    const prevBtn = screen.getByTestId('prev-btn') as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
  });

  it('next button disabled on last page', () => {
    // total=50, size=12 → 5 pages (ceil(50/12)=5), page=5 is last
    render(<ViewPaginator page={5} total={50} size={12} onPageChange={vi.fn()} onSizeChange={vi.fn()} />);
    const nextBtn = screen.getByTestId('next-btn') as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);
  });

  it('clicking next calls onPageChange with page+1', () => {
    const onPageChange = vi.fn();
    render(<ViewPaginator page={2} total={50} size={12} onPageChange={onPageChange} onSizeChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('next-btn'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('clicking prev calls onPageChange with page-1', () => {
    const onPageChange = vi.fn();
    render(<ViewPaginator page={3} total={50} size={12} onPageChange={onPageChange} onSizeChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('prev-btn'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('shows max 7 page buttons', () => {
    // total=120, size=12 → 10 pages, should show only 7
    render(<ViewPaginator page={5} total={120} size={12} onPageChange={vi.fn()} onSizeChange={vi.fn()} />);
    const pageBtns = screen.getAllByTestId(/^page-btn-/);
    expect(pageBtns.length).toBeLessThanOrEqual(7);
  });

  it('page-size select shows current value', () => {
    render(<ViewPaginator page={1} total={50} size={24} onPageChange={vi.fn()} onSizeChange={vi.fn()} />);
    const select = screen.getByTestId('page-size-select') as HTMLSelectElement;
    expect(select.value).toBe('24');
  });

  it('page-size change calls onSizeChange', () => {
    const onSizeChange = vi.fn();
    render(<ViewPaginator page={1} total={50} size={12} onPageChange={vi.fn()} onSizeChange={onSizeChange} />);
    fireEvent.change(screen.getByTestId('page-size-select'), { target: { value: '48' } });
    expect(onSizeChange).toHaveBeenCalledWith(48);
  });

  it('clicking a numbered page button calls onPageChange', () => {
    const onPageChange = vi.fn();
    // total=50, size=12 → 5 pages, all visible
    render(<ViewPaginator page={1} total={50} size={12} onPageChange={onPageChange} onSizeChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('page-btn-3'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
