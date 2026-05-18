import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViewCardGrid } from '../ViewCardGrid';
import type { ViewMeta } from '@/hooks/useViewList';

const views: ViewMeta[] = [
  { view_id: 'v1', name: 'View 1', is_template: 0, display_order: 0 },
  { view_id: 'v2', name: 'View 2', is_template: 0, display_order: 1 },
  { view_id: 'v3', name: 'View 3', is_template: 0, display_order: 2 },
];

const noop = vi.fn();
const actions = { onEdit: noop, onOpen: noop, onDuplicate: noop, onDelete: noop };

describe('ViewCardGrid', () => {
  it('renders a card for each view', () => {
    render(<ViewCardGrid views={views} {...actions} />);
    expect(screen.getAllByTestId('view-card')).toHaveLength(3);
  });

  it('renders view names', () => {
    render(<ViewCardGrid views={views} {...actions} />);
    expect(screen.getByText('View 1')).toBeTruthy();
    expect(screen.getByText('View 2')).toBeTruthy();
    expect(screen.getByText('View 3')).toBeTruthy();
  });

  it('grid container has grid class', () => {
    const { container } = render(<ViewCardGrid views={views} {...actions} />);
    const grid = container.firstChild as HTMLElement;
    expect(grid.className).toContain('grid');
  });

  it('renders empty without error when no views', () => {
    const { container } = render(<ViewCardGrid views={[]} {...actions} />);
    expect(container.querySelectorAll('[data-testid="view-card"]')).toHaveLength(0);
  });
});
