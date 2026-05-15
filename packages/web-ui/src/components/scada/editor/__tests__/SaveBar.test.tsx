import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/api/scada', () => ({
  updateView: vi.fn(async () => ({ success: true, updated_at: '2026-05-15T13:00:00Z' })),
  fetchView: vi.fn(async () => ({})),
}));

import { SaveBar } from '../SaveBar';
import * as scada from '@/api/scada';

function baseState(): any {
  return {
    items: { t1: { id: 't1', type: 'tank', x: 0, y: 0, w: 80, h: 200, props: {} } },
    selectedId: null,
    baselineUpdatedAt: '2026-05-15T00:00:00Z',
    dirty: false,
  };
}

describe('SaveBar', () => {
  beforeEach(() => {
    vi.mocked(scada.updateView).mockClear();
    vi.mocked(scada.updateView).mockResolvedValue({ success: true, updated_at: '2026-05-15T13:00:00Z' });
  });

  it('1. dirty=false → save button disabled', () => {
    render(<SaveBar state={baseState()} viewId="v1" dispatch={vi.fn()} />);
    const btn = screen.getByRole('button', { name: /保存/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('2. dirty=true + click save → updateView called, dispatch markSaved', async () => {
    const dispatch = vi.fn();
    render(<SaveBar state={{ ...baseState(), dirty: true }} viewId="v1" dispatch={dispatch} />);
    const btn = screen.getByRole('button', { name: /保存/ });
    fireEvent.click(btn);

    await waitFor(() => expect(scada.updateView).toHaveBeenCalledTimes(1));
    expect(scada.updateView).toHaveBeenCalledWith('v1', {
      items: baseState().items,
      expected_updated_at: '2026-05-15T00:00:00Z',
    });
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'markSaved', updated_at: '2026-05-15T13:00:00Z' })
    );
  });
});
