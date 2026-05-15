'use client';
import React from 'react';
import type { ScadaView } from '@/api/scada';
import type { WidgetDef } from '@/widgets';
import { WIDGET_REGISTRY } from '@/widgets/registry';
import { generateWidgetId } from '@/hooks/useEditorState';
import { WidgetItem } from './WidgetItem';

export interface EditorCanvasProps {
  view: Pick<ScadaView, 'width' | 'height' | 'background'>;
  items: Record<string, WidgetDef>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (widget: WidgetDef) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
}

export function EditorCanvas({
  view, items, selectedId, onSelect, onAdd, onMove, onResize,
}: EditorCanvasProps) {
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Try both MIME types for compatibility
    let type = e.dataTransfer.getData('application/x-scada-widget-type');
    if (!type) type = e.dataTransfer.getData('text/plain');
    if (!type || !(WIDGET_REGISTRY as any)[type]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    const entry = (WIDGET_REGISTRY as any)[type];
    onAdd({
      id: generateWidgetId(type),
      type: type as any,
      x, y,
      w: 80, h: 80,
      props: entry.defaultProps(),
    } as WidgetDef);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onSelect(null);
  };

  return (
    <div
      data-testid="scada-edit-canvas"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onMouseDown={handleMouseDown}
      style={{
        position: 'relative',
        width: `${view.width}px`,
        height: `${view.height}px`,
        background: view.background,
        margin: '16px',
        overflow: 'hidden',
        boxShadow: '0 0 0 1px #e5e7eb',
      }}
    >
      {Object.values(items).map((item) => (
        <WidgetItem
          key={`${item.id}:${item.bindings?.length ?? 0}`}
          widget={item}
          isSelected={item.id === selectedId}
          onSelect={onSelect}
          onMove={onMove}
          onResize={onResize}
        />
      ))}
    </div>
  );
}
