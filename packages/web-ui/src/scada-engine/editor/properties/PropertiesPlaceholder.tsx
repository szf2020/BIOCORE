// SP-FX-4: right panel — readonly widget fields placeholder.
// SP-FX-5/6 will replace this with editable per-widget property panels.

import React from 'react';
import { useEditorStore } from '../../services/editor-store';

export function PropertiesPlaceholder(): JSX.Element {
  const selection = useEditorStore((s) => s.selection);
  const items = useEditorStore((s) => s.currentView?.items);

  const baseClass = 'w-[250px] flex-shrink-0 border-l border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-100 overflow-y-auto';

  if (!items || selection.length === 0) {
    return <aside data-panel="properties" className={baseClass}><p>未选中</p></aside>;
  }
  if (selection.length >= 2) {
    return <aside data-panel="properties" className={baseClass}><p>已选 {selection.length} 个 (批量)</p></aside>;
  }
  const w = items[selection[0]];
  if (!w) {
    return <aside data-panel="properties" className={baseClass}><p>组件已删</p></aside>;
  }

  const r = (w as { rotate?: number }).rotate ?? 0;
  return (
    <aside data-panel="properties" className={baseClass}>
      <dl className="space-y-1">
        <Row k="id" v={w.id} />
        <Row k="type" v={w.type} />
        <Row k="x" v={String((w as { x?: number }).x ?? 0)} />
        <Row k="y" v={String((w as { y?: number }).y ?? 0)} />
        <Row k="w" v={String((w as { w?: number }).w ?? 0)} />
        <Row k="h" v={String((w as { h?: number }).h ?? 0)} />
        <Row k="rotate" v={String(r)} />
      </dl>
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <div data-field={k} className="flex gap-2">
      <dt className="w-12 text-zinc-400">{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}
