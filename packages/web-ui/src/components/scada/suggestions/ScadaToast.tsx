'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';

const TOAST_TTL_MS = 5000;
const STACK_MAX = 3;

interface ToastItem { id: number; suggestionId: number | string; msg: string; }

export function ScadaToast() {
  const [stack, setStack] = useState<ToastItem[]>([]);
  const latest = useRealtimeStore((s) => s.aiSuggestions[0]);
  const seenIdsRef = useRef<Set<number | string>>(new Set());

  useEffect(() => {
    if (!latest) return;
    const src = (latest as any).source_module;
    if (src !== 'scada') return;
    if (seenIdsRef.current.has(latest.id)) return;
    seenIdsRef.current.add(latest.id);

    const item: ToastItem = {
      id: Date.now() + Math.random(),
      suggestionId: latest.id,
      msg: `新写意图: ${(latest as any).target_param ?? '—'} = ${(latest as any).suggested_value ?? '—'}`,
    };
    setStack((s) => [item, ...s].slice(0, STACK_MAX));
    const timer = setTimeout(() => {
      setStack((s) => s.filter((x) => x.id !== item.id));
    }, TOAST_TTL_MS);
    return () => clearTimeout(timer);
  }, [latest?.id]);

  if (stack.length === 0) return null;
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1100, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {stack.map((t) => (
        <div key={t.id} className="bg-white border-l-4 border-yellow-500 shadow-lg p-3 rounded text-sm" style={{ minWidth: 280 }}>
          <div className="text-xs text-yellow-700 font-semibold mb-1">SCADA 建议 #{t.suggestionId}</div>
          <div className="text-gray-700">{t.msg}</div>
          <div className="text-right mt-1">
            <a href="/scada/suggestions" className="text-xs text-blue-600 hover:underline">查看</a>
          </div>
        </div>
      ))}
    </div>
  );
}
