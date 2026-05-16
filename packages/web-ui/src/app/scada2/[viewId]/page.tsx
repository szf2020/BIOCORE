'use client';
import React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ScadaCanvas } from '@/components/scada/ScadaCanvas';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import type { SvgViewJson } from '@/widgets/svg/types';

ensureBuiltinSvgWidgetsRegistered();

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; status: number; message: string }
  | { kind: 'svg'; view: SvgViewJson }
  | { kind: 'legacy' };

export default function Page() {
  const params = useParams<{ viewId: string }>();
  const search = useSearchParams();
  const reactorId = search?.get('reactor') ?? 'F01';
  const viewId = params?.viewId ?? '';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const r = await fetch(`/api/scada/views/${encodeURIComponent(viewId)}`, {
        credentials: 'include',
      });
      if (r.status === 401 || r.status === 403) {
        window.location.assign('/login');
        return;
      }
      if (r.status === 404) {
        setState({ kind: 'error', status: 404, message: '画面不存在' });
        return;
      }
      if (!r.ok) {
        setState({ kind: 'error', status: r.status, message: '服务器错误' });
        return;
      }
      const body = (await r.json()) as { is_svg?: number; items?: unknown };
      if (body.is_svg === 1) {
        setState({ kind: 'svg', view: body.items as SvgViewJson });
      } else {
        setState({ kind: 'legacy' });
      }
    } catch {
      setState({ kind: 'error', status: 0, message: '无法加载画面' });
    }
  }, [viewId]);

  useEffect(() => {
    if (viewId) load();
  }, [viewId, load]);

  if (state.kind === 'loading') {
    return (
      <div role="status" className="p-6 text-slate-500">
        加载中…
      </div>
    );
  }
  if (state.kind === 'error') {
    if (state.status === 404) {
      return (
        <div className="p-6">
          <p>画面不存在</p>
          <a href="/scada" aria-label="返回 SCADA 列表">
            返回 /scada
          </a>
        </div>
      );
    }
    return (
      <div className="p-6">
        <p>{state.message}</p>
        <button onClick={load} className="mt-2 px-3 py-1 border rounded">
          重试
        </button>
      </div>
    );
  }
  if (state.kind === 'legacy') {
    return (
      <div className="p-6">
        <p>Legacy view — open via /scada/{viewId}</p>
      </div>
    );
  }
  return <ScadaCanvas view={state.view} reactorId={reactorId} />;
}
