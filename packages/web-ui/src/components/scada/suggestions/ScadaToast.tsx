'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';

const TOAST_TTL_MS = 5000;
const FAILED_TOAST_TTL_MS = 8000;
const STACK_MAX = 3;

type ToastVariant = 'created' | 'dispatch_failed';

interface ToastItem {
  id: number;
  suggestionId: number | string;
  msg: string;
  variant: ToastVariant;
}

const VARIANT_STYLE: Record<ToastVariant, { border: string; headerText: string; label: string }> = {
  created: { border: 'border-yellow-500', headerText: 'text-yellow-700', label: 'SCADA 建议' },
  dispatch_failed: { border: 'border-red-500', headerText: 'text-red-700', label: 'SCADA 下发失败' },
};

export function ScadaToast() {
  const [stack, setStack] = useState<ToastItem[]>([]);
  const latest = useRealtimeStore((s) => s.aiSuggestions[0]);
  // dedup separately per variant: 同一 suggestion 可推 created + dispatch_failed (2 toasts)
  const seenCreatedRef = useRef<Set<number | string>>(new Set());
  const seenFailedRef = useRef<Set<number | string>>(new Set());

  useEffect(() => {
    if (!latest) return;
    const l = latest as any;
    if (l.source_module !== 'scada') return;

    const isFailed = l.action === 'dispatch_failed';
    const seenRef = isFailed ? seenFailedRef : seenCreatedRef;
    if (seenRef.current.has(latest.id)) return;
    seenRef.current.add(latest.id);

    const variant: ToastVariant = isFailed ? 'dispatch_failed' : 'created';
    const tag = l.target_param ?? '—';
    const value = l.suggested_value ?? '—';
    const msg = isFailed
      ? `${tag} 下发失败: ${l.error ?? '未知原因'}`
      : `新写意图: ${tag} = ${value}`;
    const item: ToastItem = { id: Date.now() + Math.random(), suggestionId: latest.id, msg, variant };
    setStack((s) => [item, ...s].slice(0, STACK_MAX));
    const ttl = isFailed ? FAILED_TOAST_TTL_MS : TOAST_TTL_MS;
    const timer = setTimeout(() => {
      setStack((s) => s.filter((x) => x.id !== item.id));
    }, ttl);
    return () => clearTimeout(timer);
  }, [latest?.id, (latest as any)?.action]);

  if (stack.length === 0) return null;
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1100, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stack.map((t) => {
        const v = VARIANT_STYLE[t.variant];
        return (
          <div key={t.id} className={`bg-white border-l-4 ${v.border} shadow-lg p-3 rounded text-sm`} style={{ minWidth: 280 }}>
            <div className={`text-xs ${v.headerText} font-semibold mb-1`}>{v.label} #{t.suggestionId}</div>
            <div className="text-gray-700">{t.msg}</div>
            <div className="text-right mt-1">
              <a href="/scada/suggestions" className="text-xs text-blue-600 hover:underline">查看</a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
