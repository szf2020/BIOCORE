'use client';
import React, { useState, useEffect } from 'react';
import { submitWriteIntent } from '@/api/scada';
import type { PendingIntent } from './ViewActionRouter';

const MIN_REASON_LEN = 3;

export function WriteIntentDialog({
  open,
  pending,
  viewId,
  onClose,
}: {
  open: boolean;
  pending: PendingIntent | null;
  viewId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setErr(null);
      setSubmitting(false);
    }
  }, [open, pending?.widgetId]);

  if (!open || !pending) return null;

  const payload = pending.payload ?? {};
  const tag: string = payload.tag ?? pending.action ?? '';
  const value = payload.value ?? null;
  const reasonOk = reason.trim().length >= MIN_REASON_LEN;

  const handleSubmit = async () => {
    if (!reasonOk || submitting) return;
    setSubmitting(true);
    setErr(null);
    try {
      const r = await submitWriteIntent({
        tag,
        value,
        reason: reason.trim(),
        view_id: viewId,
        widget_id: pending.widgetId,
        batch_id: payload.batch_id ?? null,
      });
      console.log(`[scada] write intent submitted, suggestion #${r.suggestion_id}`);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'submit_failed');
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="write-intent-dialog"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', padding: 24, borderRadius: 8, minWidth: 420, maxWidth: 560 }}
        className="space-y-3"
      >
        <h2 className="text-lg font-semibold">确认写意图</h2>
        <div className="text-sm text-gray-600 space-y-1">
          <div>Widget: <code>{pending.widgetId}</code></div>
          <div>Tag: <code>{tag}</code></div>
          <div>Value: <code>{value === null ? 'null' : String(value)}</code></div>
        </div>
        <div>
          <label htmlFor="wid-reason" className="block text-sm font-medium mb-1">原因 (Reason, ≥3 字符)</label>
          <textarea
            id="wid-reason"
            aria-label="原因 reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            className="w-full border rounded p-2 text-sm"
          />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border rounded text-sm"
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!reasonOk || submitting}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            {submitting ? '提交中…' : '提交'}
          </button>
        </div>
      </div>
    </div>
  );
}
