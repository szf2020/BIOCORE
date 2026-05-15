import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SuggestionList } from '../SuggestionList';

describe('SuggestionList', () => {
  it('shows empty state when no suggestions', () => {
    render(<SuggestionList suggestions={[]} onAccept={() => {}} onReject={() => {}} />);
    expect(screen.getByText(/暂无待处理 SCADA 建议/)).toBeTruthy();
  });

  it('renders N rows', () => {
    const list: any[] = [
      { id: 1, target_param: 'A', suggested_value: 1, reasoning: '{}' },
      { id: 2, target_param: 'B', suggested_value: 2, reasoning: '{}' },
      { id: 3, target_param: 'C', suggested_value: 3, reasoning: '{}' },
    ];
    render(<SuggestionList suggestions={list} onAccept={() => {}} onReject={() => {}} />);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('propagates accept callback', () => {
    const onAccept = vi.fn();
    const list: any[] = [{ id: 9, target_param: 'X', suggested_value: 1, reasoning: '{}' }];
    render(<SuggestionList suggestions={list} onAccept={onAccept} onReject={() => {}} />);
    fireEvent.click(screen.getByText('接受'));
    expect(onAccept).toHaveBeenCalledWith(9);
  });
});
