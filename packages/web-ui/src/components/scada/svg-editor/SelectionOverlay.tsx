// packages/web-ui/src/components/scada/svg-editor/SelectionOverlay.tsx
'use client';
import React from 'react';
import { useEditorStore } from './useEditorStore';
import type { AABB, ResizeHandleId } from './types';
import { svgPoint } from './transform-math';
import type { SvgWidgetItem } from '@/widgets/svg/types';

const HANDLE_SIZE = 8;
const HANDLE_HALF = HANDLE_SIZE / 2;
const ROTATION_OFFSET = 24;

const RESIZE_HANDLES: ResizeHandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function unionBbox(items: SvgWidgetItem[]): AABB | null {
  if (items.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    if (it.x < minX) minX = it.x;
    if (it.y < minY) minY = it.y;
    if (it.x + it.w > maxX) maxX = it.x + it.w;
    if (it.y + it.h > maxY) maxY = it.y + it.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function handleCenter(bbox: AABB, handle: ResizeHandleId): { cx: number; cy: number } {
  const cxMid = bbox.x + bbox.w / 2;
  const cyMid = bbox.y + bbox.h / 2;
  const left = bbox.x;
  const right = bbox.x + bbox.w;
  const top = bbox.y;
  const bottom = bbox.y + bbox.h;
  switch (handle) {
    case 'nw': return { cx: left, cy: top };
    case 'n':  return { cx: cxMid, cy: top };
    case 'ne': return { cx: right, cy: top };
    case 'e':  return { cx: right, cy: cyMid };
    case 'se': return { cx: right, cy: bottom };
    case 's':  return { cx: cxMid, cy: bottom };
    case 'sw': return { cx: left, cy: bottom };
    case 'w':  return { cx: left, cy: cyMid };
  }
}

export function SelectionOverlay() {
  const items = useEditorStore((s) => s.view.items);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const beginGesture = useEditorStore((s) => s.beginGesture);

  const selectedItems = items.filter((it) => selectedIds.has(it.id));
  if (selectedItems.length === 0) return null;

  const bbox = unionBbox(selectedItems);
  if (!bbox) return null;

  const startBboxes: Record<string, AABB> = {};
  const startRotations: Record<string, number> = {};
  for (const it of selectedItems) {
    startBboxes[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h };
    startRotations[it.id] = it.rotation ?? 0;
  }

  const onHandlePointerDown = (
    e: React.PointerEvent<SVGElement>,
    handle: ResizeHandleId | 'rotation',
  ) => {
    e.stopPropagation();
    const target = e.currentTarget as Element;
    try {
      (target as Element & { setPointerCapture?: (id: number) => void })
        .setPointerCapture?.(e.pointerId);
    } catch {
      // jsdom no-op
    }
    const svgEl = target.closest('svg') as SVGSVGElement | null;
    let start: { x: number; y: number };
    try {
      start = svgEl ? svgPoint(svgEl, e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
    } catch {
      start = { x: e.clientX, y: e.clientY };
    }
    beginGesture({
      type: handle === 'rotation' ? 'rotate' : 'resize',
      handle: handle === 'rotation' ? undefined : handle,
      startPoint: start,
      startBboxes,
      startRotations,
    });
  };

  const cxMid = bbox.x + bbox.w / 2;

  return (
    <g data-testid="selection-overlay">
      <rect
        data-testid="multi-bbox"
        x={bbox.x}
        y={bbox.y}
        width={bbox.w}
        height={bbox.h}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1}
        pointerEvents="none"
      />
      <line
        x1={cxMid}
        y1={bbox.y}
        x2={cxMid}
        y2={bbox.y - ROTATION_OFFSET}
        stroke="#3b82f6"
        strokeWidth={1}
        pointerEvents="none"
      />
      {RESIZE_HANDLES.map((h) => {
        const c = handleCenter(bbox, h);
        return (
          <rect
            key={h}
            data-handle={h}
            x={c.cx - HANDLE_HALF}
            y={c.cy - HANDLE_HALF}
            width={HANDLE_SIZE}
            height={HANDLE_SIZE}
            fill="#fff"
            stroke="#3b82f6"
            strokeWidth={1}
            style={{ cursor: `${h}-resize` }}
            onPointerDown={(e) => onHandlePointerDown(e, h)}
          />
        );
      })}
      <circle
        data-handle="rotation"
        cx={cxMid}
        cy={bbox.y - ROTATION_OFFSET}
        r={HANDLE_HALF}
        fill="#fff"
        stroke="#3b82f6"
        strokeWidth={1}
        style={{ cursor: 'grab' }}
        onPointerDown={(e) => onHandlePointerDown(e, 'rotation')}
      />
    </g>
  );
}
