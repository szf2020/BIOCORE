import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionRow } from '../SuggestionRow';

const base: any = {
  id: 1, batch_id: 'b1', suggestion_type: 'widget_button', source_module: 'scada',
  target_param: 'F01.SP-temp', current_value: null, suggested_value: 38,
  confidence: null, reasoning: '{}', status: 'accepted',
  created_at: '2026-05-15T00:00:00Z', expires_at: null,
  decided_by: 'admin', decided_at: '2026-05-15T00:01:00Z',
};

describe('SuggestionRow dispatch badge', () => {
  it('renders 已下发 badge when dispatch_status=dispatched', () => {
    render(<SuggestionRow suggestion={{ ...base, dispatch_status: 'dispatched' }} onAccept={() => {}} onReject={() => {}} />);
    expect(screen.getByText('已下发')).toBeTruthy();
  });

  it('renders 下发失败 badge with dispatch_error title when failed', () => {
    const { container } = render(<SuggestionRow suggestion={{ ...base, dispatch_status: 'failed', dispatch_error: 'PLC timeout' }} onAccept={() => {}} onReject={() => {}} />);
    expect(screen.getByText('下发失败')).toBeTruthy();
    const badge = container.querySelector('[title="PLC timeout"]');
    expect(badge).toBeTruthy();
  });

  it('failed row with onRetry shows 重新下发 button (replaces accept/reject)', () => {
    const onRetry = vi.fn();
    render(
      <SuggestionRow
        suggestion={{ ...base, dispatch_status: 'failed', dispatch_error: 'PLC offline' }}
        onAccept={() => {}}
        onReject={() => {}}
        onRetry={onRetry}
      />
    );
    expect(screen.queryByText('接受')).toBeNull();
    expect(screen.queryByText('拒绝')).toBeNull();
    fireEvent.click(screen.getByText('重新下发'));
    expect(onRetry).toHaveBeenCalledWith(base.id);
  });
});
