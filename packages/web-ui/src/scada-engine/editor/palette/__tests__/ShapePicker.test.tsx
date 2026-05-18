import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShapePicker } from '../ShapePicker';
import { SHAPE_CATALOG } from '../shape-catalog';

describe('ShapePicker', () => {
  it('renders one cell per catalog entry when search empty', () => {
    render(<ShapePicker />);
    const grid = document.querySelector('[data-panel="shape-picker"] ul') as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.querySelectorAll('li').length).toBe(SHAPE_CATALOG.length);
  });

  it('renders a search input', () => {
    render(<ShapePicker />);
    expect(screen.getByPlaceholderText('搜索形状...')).toBeInTheDocument();
  });

  it('search filters by id or label substring (case-insensitive)', () => {
    render(<ShapePicker />);
    const input = screen.getByPlaceholderText('搜索形状...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tank' } });
    const grid = document.querySelector('[data-panel="shape-picker"] ul');
    expect(grid).toBeTruthy();
    const cells = (grid as HTMLElement).querySelectorAll('li');
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((li) => {
      const id = li.getAttribute('data-palette-shape') ?? '';
      expect(id.toLowerCase().includes('tank')).toBe(true);
    });
  });

  it('empty filter result shows 无匹配 placeholder', () => {
    render(<ShapePicker />);
    const input = screen.getByPlaceholderText('搜索形状...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'zzzzznotexist' } });
    expect(screen.getByText('无匹配')).toBeInTheDocument();
  });

  it('dragstart sets palette-shape data with JSON id+src', () => {
    render(<ShapePicker />);
    const li = document.querySelector('[data-palette-shape]') as HTMLElement;
    expect(li).toBeTruthy();
    const setData = vi.fn();
    let stored = '';
    const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        setData: (k: string, v: string) => { setData(k, v); stored = v; },
        get effectAllowed() { return ''; },
        set effectAllowed(_v) {},
      },
    });
    li.dispatchEvent(event);
    expect(setData).toHaveBeenCalledWith('palette-shape', expect.any(String));
    expect(stored).toMatch(/^\{"id":".+","src":".+"\}$/);
  });

  it('clearing search restores full list', () => {
    render(<ShapePicker />);
    const input = screen.getByPlaceholderText('搜索形状...') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tank' } });
    fireEvent.change(input, { target: { value: '' } });
    const grid = document.querySelector('[data-panel="shape-picker"] ul') as HTMLElement;
    expect(grid.querySelectorAll('li').length).toBe(SHAPE_CATALOG.length);
  });
});
