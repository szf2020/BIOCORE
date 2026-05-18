'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { updateView, fetchView } from '@/api/scada';
import type { EditorState, EditorAction } from '@/hooks/useEditorState';
import { useLocale } from '@/i18n/useLocale';

export interface SaveBarProps {
  state: EditorState;
  viewId: string;
  dispatch: React.Dispatch<EditorAction>;
}

export function SaveBar({ state, viewId, dispatch }: SaveBarProps) {
  const { t } = useLocale();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    if (!state.dirty || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await updateView(viewId, {
        items: state.items,
        expected_updated_at: state.baselineUpdatedAt,
      });
      dispatch({ type: 'markSaved', updated_at: r.updated_at });
      console.log('[scada-editor] saved', r.updated_at);
    } catch (e: any) {
      if (e?.message === 'concurrent_update') {
        if (confirm(t('save-bar.discard'))) {
          try {
            const fresh = await fetchView(viewId);
            dispatch({ type: 'loadFromServer', view: fresh });
          } catch (err2: any) {
            setErr(err2?.message || 'reload_failed');
          }
        }
      } else {
        setErr(e?.message || 'save_failed');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between border-b bg-white px-4 py-2">
      <div className="flex items-center gap-3 text-sm">
        <Link href={`/scada/${viewId}`} className="text-blue-600 hover:underline">← {t('editor-shell.back')}</Link>
        <span className="text-gray-400">/</span>
        <span className="font-mono text-sm text-gray-600">{viewId}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-500">
          {state.dirty ? `● ${t('save-bar.save')}` : `✓ ${t('save-bar.saved')}`}
        </span>
        {err && <span className="text-sm text-red-600">{err}</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={!state.dirty || saving}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
        >
          {saving ? t('save-bar.saving') : t('save-bar.save')}
        </button>
      </div>
    </div>
  );
}
