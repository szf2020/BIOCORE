'use client';
import React, { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseFuxaView } from '@/scada-engine/models/hmi';
import { RuntimeShell } from '@/scada-engine/runtime/RuntimeShell';
import type { FuxaView } from '@/scada-engine/models';

type LoadState = 'loading' | 'ready' | 'error';

export default function ViewV2Page({
  params,
}: {
  params: { viewId: string };
}): JSX.Element {
  const sp = useSearchParams();
  const reactorId = sp?.get('reactor') ?? 'F01';
  const [state, setState] = useState<LoadState>('loading');
  const [view, setView] = useState<FuxaView | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetch(`/api/v1/fuxa-views/${params.viewId}`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: unknown) => {
        if (cancelled) return;
        const payload =
          (j as any)?.data?.payload ??
          (j as any)?.payload ??
          j;
        const parsed = parseFuxaView(
          typeof payload === 'string' ? payload : JSON.stringify(payload),
        );
        setView(parsed);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => { cancelled = true; };
  }, [params.viewId]);

  if (state === 'loading') {
    return <div className="p-8 text-zinc-400">加载中...</div>;
  }
  if (state === 'error' || !view) {
    return <div className="p-8 text-red-500">加载失败</div>;
  }
  return <RuntimeShell view={view} viewId={params.viewId} reactorId={reactorId} />;
}
