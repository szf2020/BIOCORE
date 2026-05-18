import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewCard } from '../ViewCard';
import type { ViewMeta } from '@/hooks/useViewList';

const baseView: ViewMeta = {
  view_id: 'v1',
  name: 'Plant Overview',
  is_template: 0,
  display_order: 0,
  updated_at: '2026-05-18T00:00:00.000Z',
};

describe('ViewCard', () => {
  it('renders view name', () => {
    render(<ViewCard view={baseView} onEdit={vi.fn()} onOpen={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('Plant Overview')).toBeTruthy();
  });

  it('shows placeholder when no svgcontent', () => {
    render(<ViewCard view={baseView} onEdit={vi.fn()} onOpen={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('view-card-thumbnail-placeholder')).toBeTruthy();
  });

  it('shows svg preview when svgcontent present', () => {
    const view = { ...baseView, svgcontent: '<rect x="0" y="0" width="10" height="10"/>' };
    render(<ViewCard view={view} onEdit={vi.fn()} onOpen={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('view-card-thumbnail-svg')).toBeTruthy();
  });

  it('edit button calls onEdit', () => {
    const onEdit = vi.fn();
    render(<ViewCard view={baseView} onEdit={onEdit} onOpen={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTestId('view-card-edit-btn'));
    expect(onEdit).toHaveBeenCalledWith('v1');
  });

  it('delete button calls onDelete', () => {
    const onDelete = vi.fn();
    render(<ViewCard view={baseView} onEdit={vi.fn()} onOpen={vi.fn()} onDuplicate={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('view-card-delete-btn'));
    expect(onDelete).toHaveBeenCalledWith(baseView);
  });

  it('duplicate button calls onDuplicate', () => {
    const onDuplicate = vi.fn();
    render(<ViewCard view={baseView} onEdit={vi.fn()} onOpen={vi.fn()} onDuplicate={onDuplicate} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTestId('view-card-duplicate-btn'));
    expect(onDuplicate).toHaveBeenCalledWith('v1');
  });

  it('open button calls onOpen', () => {
    const onOpen = vi.fn();
    render(<ViewCard view={baseView} onEdit={vi.fn()} onOpen={onOpen} onDuplicate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTestId('view-card-open-btn'));
    expect(onOpen).toHaveBeenCalledWith('v1');
  });

  it('has data-testid="view-card"', () => {
    render(<ViewCard view={baseView} onEdit={vi.fn()} onOpen={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('view-card')).toBeTruthy();
  });
});
