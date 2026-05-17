import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/lib/auth', () => ({
  apiFetch: vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve({ valid: true }) } as any),
  ),
}));

import { ConditionExpressionEditor } from '../ConditionExpressionEditor';

describe('ConditionExpressionEditor SP-RG-2 H-5: debounce uses latest onChange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the NEWEST onChange when re-rendered with new handler before debounce elapses', async () => {
    const onChangeA = vi.fn();
    const onChangeB = vi.fn();

    const { rerender } = render(
      <ConditionExpressionEditor value="OD600 > 5" onChange={onChangeA} />,
    );
    // 1) user typed into draft → triggers debounce useEffect with onChangeA in closure
    const ta = screen.getByPlaceholderText(/例如/) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'OD600 > 6' } });

    // 2) parent re-renders with new onChange but SAME value prop
    //    (simulates switching to a different branch node whose expression happens to match draft).
    //    Without the useRef fix, draft is unchanged across this re-render so the
    //    debounce effect does NOT re-run; the pending setTimeout still captures onChangeA.
    rerender(<ConditionExpressionEditor value="OD600 > 5" onChange={onChangeB} />);

    // 3) advance debounce timer + flush apiFetch microtask
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(onChangeA).not.toHaveBeenCalled();
    expect(onChangeB).toHaveBeenCalledTimes(1);
    expect(onChangeB).toHaveBeenCalledWith('OD600 > 6', true);
  });
});
