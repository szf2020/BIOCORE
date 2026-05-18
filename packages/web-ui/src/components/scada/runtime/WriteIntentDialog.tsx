'use client';
import React, { useState } from 'react';
import { usePostWriteIntent } from '@/hooks/usePostWriteIntent';
import type { SvgWidgetItem } from '@/widgets/svg/types';
import { useLocale } from '@/i18n/useLocale';

interface Props {
  viewId: string;
  widget: SvgWidgetItem;
  onClose: () => void;
}

export function WriteIntentDialog({ viewId, widget, onClose }: Props) {
  const { t } = useLocale();
  const { post } = usePostWriteIntent();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wi = widget.writeIntent;
  const canSubmit = !submitting && reason.trim().length >= 3 && !!wi;

  async function onSubmit() {
    if (!canSubmit || !wi) return;
    setSubmitting(true);
    setError(null);
    try {
      await post({
        tag: wi.tag,
        value: wi.value ?? null,
        reason: reason.trim(),
        view_id: viewId,
        widget_id: widget.id,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="write-intent-dialog" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
    }}>
      <div style={{ background: '#fff', padding: 16, minWidth: 360, borderRadius: 4 }}>
        <h3 style={{ margin: '0 0 8px 0' }}>{t('write-intent-dialog.title')}</h3>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Tag</div>
          <div data-testid="write-intent-tag" style={{ fontFamily: 'monospace' }}>{wi?.tag ?? '-'}</div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Value</div>
          <div data-testid="write-intent-value" style={{ fontFamily: 'monospace' }}>{String(wi?.value ?? '-')}</div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>{t('write-intent-dialog.reason')}</label>
          <input
            data-testid="write-intent-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ width: '100%' }}
            autoFocus
            disabled={submitting}
          />
        </div>
        {error && <div data-testid="write-intent-error" style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{t('common.error')}: {error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={submitting}>{t('write-intent-dialog.cancel')}</button>
          <button
            data-testid="write-intent-submit"
            onClick={onSubmit}
            disabled={!canSubmit}
          >{submitting ? '...' : t('write-intent-dialog.confirm')}</button>
        </div>
      </div>
    </div>
  );
}
