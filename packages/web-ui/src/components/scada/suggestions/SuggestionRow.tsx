'use client';
import React from 'react';
import type { ScadaSuggestion } from '@/api/scada';

const DISPATCH_LABELS: Record<string, string> = {
  pending_dispatch: '待下发',
  dispatching: '下发中',
  dispatched: '已下发',
  failed: '下发失败',
};

const DISPATCH_COLORS: Record<string, string> = {
  pending_dispatch: 'bg-yellow-100 text-yellow-700',
  dispatching: 'bg-blue-100 text-blue-700',
  dispatched: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

interface Props {
  suggestion: ScadaSuggestion;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
}

export function SuggestionRow({ suggestion, onAccept, onReject }: Props) {
  let meta: { reason?: string; view_id?: string; widget_id?: string; value?: unknown } = {};
  let isJson = false;
  if (suggestion.reasoning) {
    try {
      const parsed = JSON.parse(suggestion.reasoning);
      if (parsed && typeof parsed === 'object') {
        meta = parsed;
        isJson = true;
      }
    } catch {
      /* fallback to raw reasoning */
    }
  }

  const valueDisplay = suggestion.suggested_value ?? meta.value ?? '—';
  const reasonDisplay = isJson ? (meta.reason ?? '—') : (suggestion.reasoning ?? '—');

  return (
    <div className="border rounded p-3 bg-white space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono text-sm">{suggestion.target_param}</div>
        <div className="flex items-center gap-2">
          {suggestion.dispatch_status && DISPATCH_LABELS[suggestion.dispatch_status] && (
            <span
              title={suggestion.dispatch_error ?? undefined}
              className={`text-xs px-2 py-0.5 rounded ${DISPATCH_COLORS[suggestion.dispatch_status]}`}
            >
              {DISPATCH_LABELS[suggestion.dispatch_status]}
            </span>
          )}
          <span className="text-xs text-gray-400">#{suggestion.id} · {suggestion.created_at}</span>
        </div>
      </div>
      <div className="text-sm">
        <span className="text-gray-500">建议值: </span>
        <span className="font-mono">{String(valueDisplay)}</span>
      </div>
      <div className="text-xs text-gray-600">
        理由: {reasonDisplay}
      </div>
      {meta.view_id && (
        <div className="text-xs text-gray-500">
          来源:{' '}
          <a href={`/scada/${meta.view_id}`} className="text-blue-600 hover:underline">{meta.view_id}</a>
          {meta.widget_id && <> · widget <span className="font-mono">{meta.widget_id}</span></>}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => onReject(suggestion.id)}
          className="px-3 py-1 border rounded text-xs text-gray-700"
        >
          拒绝
        </button>
        <button
          type="button"
          onClick={() => onAccept(suggestion.id)}
          className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
        >
          接受
        </button>
      </div>
    </div>
  );
}
