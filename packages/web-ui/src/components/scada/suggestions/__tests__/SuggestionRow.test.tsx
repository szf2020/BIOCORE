import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionRow } from '../SuggestionRow';

const baseSuggestion: any = {
  id: 7,
  batch_id: 'b1',
  suggestion_type: 'widget_button',
  source_module: 'scada',
  target_param: 'F01.SP-temp',
  current_value: null,
  suggested_value: 38,
  confidence: null,
  reasoning: JSON.stringify({ reason: '测试 reason', view_id: 'demo_v1', widget_id: 'btn-1', value: 38 }),
  status: 'pending',
  created_at: '2026-05-15T00:00:00Z',
  expires_at: null,
  decided_by: null,
  decided_at: null,
};

describe('SuggestionRow', () => {
  it('renders target_param + suggested_value + reasoning JSON meta + widget link', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(<SuggestionRow suggestion={baseSuggestion} onAccept={onAccept} onReject={onReject} />);
    expect(screen.getByText('F01.SP-temp')).toBeTruthy();
    expect(screen.getByText('38')).toBeTruthy();
    expect(screen.getByText(/测试 reason/)).toBeTruthy();
    const link = screen.getByText('demo_v1') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/scada/demo_v1');
    expect(screen.getByText(/btn-1/)).toBeTruthy();

    fireEvent.click(screen.getByText('接受'));
    expect(onAccept).toHaveBeenCalledWith(7);
    fireEvent.click(screen.getByText('拒绝'));
    expect(onReject).toHaveBeenCalledWith(7);
  });

  it('falls back to raw reasoning when reasoning is non-JSON', () => {
    render(
      <SuggestionRow
        suggestion={{ ...baseSuggestion, reasoning: '原始文本说明' }}
        onAccept={() => {}}
        onReject={() => {}}
      />
    );
    expect(screen.getByText(/原始文本说明/)).toBeTruthy();
  });
});
