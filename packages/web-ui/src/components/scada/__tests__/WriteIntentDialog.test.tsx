import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/api/scada', () => ({
  submitWriteIntent: vi.fn(async () => ({ success: true, suggestion_id: 42 })),
}));

import { WriteIntentDialog } from '../WriteIntentDialog';
import * as scada from '@/api/scada';

describe('WriteIntentDialog', () => {
  beforeEach(() => {
    vi.mocked(scada.submitWriteIntent).mockClear();
    vi.mocked(scada.submitWriteIntent).mockResolvedValue({ success: true, suggestion_id: 42 });
  });

  const pending = {
    widgetId: 'b1',
    action: 'open_suggest_dialog',
    payload: { tag: 'F01.SP-temp', value: 38 },
  };

  it('1. reason empty → submit button disabled', () => {
    render(<WriteIntentDialog open={true} pending={pending} viewId="v1" onClose={vi.fn()} />);
    const submit = screen.getByRole('button', { name: /提交/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('2. reason length <3 disabled, ≥3 enabled', () => {
    render(<WriteIntentDialog open={true} pending={pending} viewId="v1" onClose={vi.fn()} />);
    const submit = screen.getByRole('button', { name: /提交/ }) as HTMLButtonElement;
    const textarea = screen.getByRole('textbox', { name: /原因|reason/i }) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: 'aa' } });
    expect(submit.disabled).toBe(true);

    fireEvent.change(textarea, { target: { value: 'aaa' } });
    expect(submit.disabled).toBe(false);
  });

  it('3. submit → submitWriteIntent called with payload, onClose called on success', async () => {
    const onClose = vi.fn();
    render(<WriteIntentDialog open={true} pending={pending} viewId="v1" onClose={onClose} />);
    const textarea = screen.getByRole('textbox', { name: /原因|reason/i });
    fireEvent.change(textarea, { target: { value: '测试理由' } });
    const submit = screen.getByRole('button', { name: /提交/ });
    fireEvent.click(submit);

    await waitFor(() => expect(scada.submitWriteIntent).toHaveBeenCalledTimes(1));
    expect(scada.submitWriteIntent).toHaveBeenCalledWith({
      tag: 'F01.SP-temp',
      value: 38,
      reason: '测试理由',
      view_id: 'v1',
      widget_id: 'b1',
      batch_id: null,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
