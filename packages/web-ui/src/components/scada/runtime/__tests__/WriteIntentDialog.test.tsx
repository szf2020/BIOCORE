import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { WriteIntentDialog } from '../WriteIntentDialog';

const postMock = vi.fn();
vi.mock('@/hooks/usePostWriteIntent', () => ({
  usePostWriteIntent: () => ({ post: postMock }),
}));

beforeEach(() => { postMock.mockReset(); });

const widget = { id: 'w1', type: 'svg-button', x: 0, y: 0, w: 10, h: 10, writeIntent: { tag: 'tank.fill', value: true } } as any;

describe('WriteIntentDialog', () => {
  it('renders tag, value readonly and reason input', () => {
    render(<WriteIntentDialog viewId="v1" widget={widget} onClose={() => {}} />);
    expect(screen.getByTestId('write-intent-tag').textContent).toContain('tank.fill');
    expect(screen.getByTestId('write-intent-value').textContent).toContain('true');
    expect(screen.getByTestId('write-intent-reason')).toBeTruthy();
  });

  it('submit disabled until reason ≥ 3 chars', async () => {
    render(<WriteIntentDialog viewId="v1" widget={widget} onClose={() => {}} />);
    const submitBtn = screen.getByTestId('write-intent-submit') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    const input = screen.getByTestId('write-intent-reason') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'ab' } }); });
    expect(submitBtn.disabled).toBe(true);
    await act(async () => { fireEvent.change(input, { target: { value: 'abc' } }); });
    expect(submitBtn.disabled).toBe(false);
  });

  it('submit posts and calls onClose on success', async () => {
    postMock.mockResolvedValueOnce({ success: true, suggestion_id: 99 });
    const onClose = vi.fn();
    render(<WriteIntentDialog viewId="v1" widget={widget} onClose={onClose} />);
    const input = screen.getByTestId('write-intent-reason') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'reason ok' } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('write-intent-submit')); });
    await waitFor(() => expect(postMock).toHaveBeenCalledWith({
      tag: 'tank.fill', value: true, reason: 'reason ok', view_id: 'v1', widget_id: 'w1',
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('submit failure shows inline error and does NOT close', async () => {
    postMock.mockRejectedValueOnce(new Error('HTTP 409 (no_active_batch)'));
    const onClose = vi.fn();
    render(<WriteIntentDialog viewId="v1" widget={widget} onClose={onClose} />);
    const input = screen.getByTestId('write-intent-reason') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: 'reason ok' } }); });
    await act(async () => { fireEvent.click(screen.getByTestId('write-intent-submit')); });
    await waitFor(() => expect(screen.getByTestId('write-intent-error').textContent).toMatch(/no_active_batch/));
    expect(onClose).not.toHaveBeenCalled();
  });
});
