'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { ensureBuiltinSvgWidgetsRegistered } from '@/widgets/svg';
import { SvgEditorCanvas } from '@/components/scada/svg-editor/SvgEditorCanvas';
import { useEditorStore } from '@/components/scada/svg-editor/useEditorStore';
import { useKeyboardShortcuts } from '@/components/scada/svg-editor/useKeyboardShortcuts';
import { WidgetLinkPanel } from '@/components/scada/pages/WidgetLinkPanel';
import { WidgetWriteIntentPanel } from '@/components/scada/pages/WidgetWriteIntentPanel';
import type { SvgViewJson } from '@/widgets/svg/types';

ensureBuiltinSvgWidgetsRegistered();

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; status: number; message: string }
  | { kind: 'ready'; updatedAt: string; projectId: string; isTemplate: number };

export default function Page() {
  const params = useParams<{ viewId: string }>();
  const search = useSearchParams();
  const reactorId = search?.get('reactor') ?? 'F01';
  const viewId = params?.viewId ?? '';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  const setView = useEditorStore((s) => s.loadView);
  const view = useEditorStore((s) => s.view);
  const gridSnap = useEditorStore((s) => s.gridSnap);
  const setGridSnap = useEditorStore((s) => s.setGridSnap);
  useKeyboardShortcuts();

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const r = await fetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, { credentials: 'include' });
      if (r.status === 401 || r.status === 403) { window.location.assign('/login'); return; }
      if (r.status === 404) { setState({ kind: 'error', status: 404, message: '画面不存在' }); return; }
      if (!r.ok) { setState({ kind: 'error', status: r.status, message: '服务器错误' }); return; }
      const body = (await r.json()) as { is_svg?: number; items?: unknown; updated_at?: string; project_id?: string; is_template?: number };
      if (body.is_svg !== 1) {
        setState({ kind: 'error', status: 400, message: '此画面不是 SVG 格式,不能在此编辑器编辑' });
        return;
      }
      setView(body.items as SvgViewJson);
      setState({
        kind: 'ready',
        updatedAt: body.updated_at ?? '',
        projectId: body.project_id ?? 'default',
        isTemplate: body.is_template ?? 0,
      });
    } catch {
      setState({ kind: 'error', status: 0, message: '无法加载画面' });
    }
  }, [viewId, setView]);

  useEffect(() => { void load(); }, [load]);

  const onSave = useCallback(async () => {
    if (state.kind !== 'ready') return;
    setSaving(true);
    try {
      const r = await fetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: view, expected_updated_at: state.updatedAt || null }),
      });
      if (r.status === 409) { alert('画面已被他人修改,请刷新后重试'); await load(); return; }
      if (!r.ok) { alert('保存失败'); return; }
      const body = (await r.json()) as { updated_at: string };
      setState({ ...state, updatedAt: body.updated_at });
    } finally {
      setSaving(false);
    }
  }, [state, viewId, view, load]);

  const toggleTemplate = useCallback(async () => {
    if (state.kind !== 'ready') return;
    const next = state.isTemplate ? 0 : 1;
    const r = await fetch(`/api/v1/scada/views/${encodeURIComponent(viewId)}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_template: next, expected_updated_at: state.updatedAt || null }),
    });
    if (r.status === 409) { alert('画面已被他人修改,请刷新后重试'); await load(); return; }
    if (!r.ok) { alert('操作失败'); return; }
    const body = (await r.json()) as { updated_at: string };
    setState({ ...state, isTemplate: next, updatedAt: body.updated_at });
  }, [state, viewId, load]);

  if (state.kind === 'loading') return <div style={{ padding: 16 }}>加载中…</div>;
  if (state.kind === 'error') return <div style={{ padding: 16, color: '#dc2626' }}>错误 ({state.status}): {state.message}</div>;

  return (
    <div style={{ padding: 16, display: 'flex', gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={onSave} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
          <button onClick={() => useEditorStore.getState().undo()}>撤销</button>
          <button onClick={() => useEditorStore.getState().redo()}>重做</button>
          <button
            data-testid="grid-snap-btn"
            aria-pressed={gridSnap}
            onClick={() => setGridSnap(!gridSnap)}
          >
            网格吸附: {gridSnap ? '开' : '关'}
          </button>
          <button onClick={toggleTemplate}>{state.isTemplate ? '取消模板' : '另存为模板'}</button>
        </div>
        <SvgEditorCanvas reactorId={reactorId} />
      </div>
      <aside style={{ width: 260, borderLeft: '1px solid #eee', paddingLeft: 12 }}>
        <h4 style={{ margin: '0 0 8px 0' }}>选中的组件</h4>
        <WidgetLinkPanel projectId={state.projectId} currentViewId={viewId} />
        <WidgetWriteIntentPanel />
      </aside>
    </div>
  );
}
