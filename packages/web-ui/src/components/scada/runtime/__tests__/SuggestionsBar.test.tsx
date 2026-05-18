import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ScadaSuggestion } from '@/api/scada';

vi.mock('@/api/scada', () => ({
  fetchScadaSuggestions: vi.fn(),
  acceptSuggestion: vi.fn(),
  rejectSuggestion: vi.fn(),
}));

import * as scadaApi from '@/api/scada';
import { SuggestionsBar } from '../SuggestionsBar';

function makeSuggestion(overrides: Partial<ScadaSuggestion> = {}): ScadaSuggestion {
  return {
    id: 1,
    batch_id: 'b1',
    suggestion_type: 'setpoint',
    source_module: 'scada',
    target_param: 'tank_temp',
    current_value: 70,
    suggested_value: 72.5,
    confidence: 0.9,
    reasoning: JSON.stringify({ view_id: 'view-abc', widget_id: 'w1', reason: '温度偏高', value: 72.5 }),
    status: 'pending',
    created_at: '2026-05-18T00:00:00Z',
    expires_at: null,
    decided_by: null,
    decided_at: null,
    ...overrides,
  };
}

describe('SuggestionsBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([]);
    vi.mocked(scadaApi.acceptSuggestion).mockResolvedValue({ success: true });
    vi.mocked(scadaApi.rejectSuggestion).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('T1: showSuggestions=false 时不渲染任何内容', () => {
    const { container } = render(
      <SuggestionsBar viewId="view-abc" reactorId="F01" showSuggestions={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('T2: 空状态显示暂无待处理建议', async () => {
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => {
      expect(screen.getByTestId('suggestions-bar-header')).toBeDefined();
    });
    expect(screen.getByText(/暂无待处理建议/)).toBeDefined();
  });

  it('T3: 渲染 pending suggestions 列表', async () => {
    const s = makeSuggestion({ id: 42 });
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([s]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => {
      expect(screen.getByText('tank_temp')).toBeDefined();
    });
    expect(screen.getByText('72.5')).toBeDefined();
  });

  it('T4: 点击接受按钮调用 acceptSuggestion(id)', async () => {
    const s = makeSuggestion({ id: 42 });
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([s]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => expect(screen.getByTestId('accept-42')).toBeDefined());
    fireEvent.click(screen.getByTestId('accept-42'));
    await waitFor(() => {
      expect(scadaApi.acceptSuggestion).toHaveBeenCalledWith(42);
    });
  });

  it('T5: 点击拒绝按钮调用 rejectSuggestion(id)', async () => {
    const s = makeSuggestion({ id: 43 });
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([s]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => expect(screen.getByTestId('reject-43')).toBeDefined());
    fireEvent.click(screen.getByTestId('reject-43'));
    await waitFor(() => {
      expect(scadaApi.rejectSuggestion).toHaveBeenCalledWith(43);
    });
  });

  it('T6: 收折/展开 toggle', async () => {
    const s = makeSuggestion({ id: 1 });
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([s]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => expect(screen.getByTestId('suggestions-bar-header')).toBeDefined());

    expect(screen.getByTestId('suggestions-bar-list')).toBeDefined();

    fireEvent.click(screen.getByTestId('suggestions-bar-toggle'));
    await waitFor(() => {
      expect(screen.queryByTestId('suggestions-bar-list')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('suggestions-bar-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId('suggestions-bar-list')).toBeDefined();
    });
  });

  it('T7: viewId 过滤 — 仅显示 view_id 匹配的 suggestion', async () => {
    const match = makeSuggestion({ id: 10, target_param: 'match_param' });
    const noMatch = makeSuggestion({
      id: 11,
      target_param: 'other_param',
      reasoning: JSON.stringify({ view_id: 'other-view', widget_id: 'w2', reason: 'x', value: 1 }),
    });
    vi.mocked(scadaApi.fetchScadaSuggestions).mockResolvedValue([match, noMatch]);
    render(<SuggestionsBar viewId="view-abc" reactorId="F01" />);
    await waitFor(() => expect(screen.getByText('match_param')).toBeDefined());
    expect(screen.queryByText('other_param')).toBeNull();
  });
});
