'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchScadaSuggestions,
  acceptSuggestion as apiAccept,
  rejectSuggestion as apiReject,
  type ScadaSuggestion,
} from '@/api/scada';

// ---------------------------------------------------------------------------
// Helper: 判断 suggestion 是否属于当前 viewId
// reasoning 字段存 JSON { view_id, widget_id, reason, value }
// 若无 view_id 则宽松显示（不遗漏来源不明的建议）
// ---------------------------------------------------------------------------
function matchesView(s: ScadaSuggestion, viewId: string): boolean {
  try {
    const meta = JSON.parse(s.reasoning ?? '');
    if (meta && typeof meta === 'object' && 'view_id' in meta) {
      return meta.view_id === viewId;
    }
  } catch {
    /* not JSON — 宽松显示 */
  }
  return true;
}

// ---------------------------------------------------------------------------
// Hook: useSuggestionsBar — 独立 5s 轮询，乐观 remove
// ---------------------------------------------------------------------------
function useSuggestionsBar(viewId: string, pollIntervalMs = 5000) {
  const [suggestions, setSuggestions] = useState<ScadaSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await fetchScadaSuggestions();
      setSuggestions(all.filter((s) => matchesView(s, viewId)));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'fetch_failed');
    } finally {
      setLoading(false);
    }
  }, [viewId]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, pollIntervalMs);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [load, pollIntervalMs]);

  const accept = useCallback(async (id: number) => {
    await apiAccept(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const reject = useCallback(async (id: number) => {
    await apiReject(id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { suggestions, loading, error, accept, reject };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface SuggestionsBarProps {
  viewId: string;
  reactorId: string;
  showSuggestions?: boolean;
}

// ---------------------------------------------------------------------------
// SuggestionsBar
// ---------------------------------------------------------------------------
export function SuggestionsBar({ viewId, reactorId: _reactorId, showSuggestions = true }: SuggestionsBarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { suggestions, loading, error, accept, reject } = useSuggestionsBar(viewId);

  if (!showSuggestions) return null;

  const count = suggestions.length;
  const headerLabel = loading
    ? '加载中…'
    : error
      ? `错误: ${error}`
      : `AI 建议 (${count} 条)`;

  return (
    <div
      data-testid="suggestions-bar"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: 'rgba(255,255,255,0.97)',
        borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
        maxHeight: collapsed ? 44 : 320,
        overflow: 'hidden',
        transition: 'max-height 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        data-testid="suggestions-bar-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          cursor: 'pointer',
          userSelect: 'none',
          height: 44,
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>{headerLabel}</span>
        <button
          data-testid="suggestions-bar-toggle"
          type="button"
          onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
          aria-label={collapsed ? '展开' : '收起'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {/* List */}
      {!collapsed && (
        <div
          data-testid="suggestions-bar-list"
          style={{ overflowY: 'auto', maxHeight: 276, padding: '0 12px 8px' }}
        >
          {count === 0 && !loading && !error && (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: '8px 4px' }}>暂无待处理建议</div>
          )}
          {suggestions.map((s) => {
            let reason = s.reasoning ?? '—';
            let value: unknown = s.suggested_value ?? '—';
            try {
              const meta = JSON.parse(s.reasoning ?? '');
              if (meta && typeof meta === 'object') {
                if ('reason' in meta) reason = String(meta.reason ?? '—');
                if ('value' in meta) value = meta.value ?? s.suggested_value ?? '—';
              }
            } catch { /* use raw */ }

            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '6px 4px',
                  borderBottom: '1px solid #f3f4f6',
                  fontSize: 13,
                }}
              >
                <span style={{ color: '#6b7280', minWidth: 28 }}>#{s.id}</span>
                <span style={{ fontFamily: 'monospace', minWidth: 120, fontWeight: 500 }}>{s.target_param}</span>
                <span style={{ color: '#1d4ed8', minWidth: 48 }}>{String(value)}</span>
                <span style={{ flex: 1, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reason}</span>
                <button
                  data-testid={`reject-${s.id}`}
                  type="button"
                  onClick={() => reject(s.id)}
                  style={{ padding: '2px 10px', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', background: '#fff', fontSize: 12 }}
                >
                  拒绝
                </button>
                <button
                  data-testid={`accept-${s.id}`}
                  type="button"
                  onClick={() => accept(s.id)}
                  style={{ padding: '2px 10px', border: 'none', borderRadius: 4, cursor: 'pointer', background: '#2563eb', color: '#fff', fontSize: 12 }}
                >
                  接受
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
