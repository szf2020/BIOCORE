'use client';
import React, { useCallback, useRef } from 'react';
import { SvgWidgetInstance } from '@/components/scada/SvgWidgetInstance';
import type { SvgWidgetItem } from '@/widgets/svg/types';
import { useEditorStore } from './useEditorStore';
import { svgPoint } from './transform-math';

const DRAG_THRESHOLD = 3;

interface Props {
  instance: SvgWidgetItem;
  reactorId: string;
}

function safeSvgPoint(svgEl: SVGSVGElement | null, clientX: number, clientY: number) {
  if (!svgEl) return { x: clientX, y: clientY };
  try {
    return svgPoint(svgEl, clientX, clientY);
  } catch {
    return { x: clientX, y: clientY };
  }
}

export function SelectableWidget({ instance, reactorId }: Props) {
  const isSelected = useEditorStore((s) => s.selectedIds.has(instance.id));
  const previewAnimations = useEditorStore((s) => s.previewAnimations);

  const startRef = useRef<{
    point: { x: number; y: number };
    bboxes: Record<string, { x: number; y: number; w: number; h: number }>;
  } | null>(null);
  const draggingRef = useRef(false);

  const renderItem: SvgWidgetItem = previewAnimations
    ? instance
    : { ...instance, animations: undefined };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      e.stopPropagation();
      const store = useEditorStore.getState();
      const mode = e.shiftKey ? 'toggle' : e.ctrlKey || e.metaKey ? 'add' : 'replace';

      const alreadySelected = store.selectedIds.has(instance.id);
      if (!alreadySelected || mode !== 'replace') {
        store.select([instance.id], mode);
      }

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // jsdom or unsupported — ignore
      }

      const svgEl = e.currentTarget.ownerSVGElement;
      const point = safeSvgPoint(svgEl, e.clientX, e.clientY);

      const after = useEditorStore.getState();
      const startBboxes: Record<string, { x: number; y: number; w: number; h: number }> = {};
      for (const it of after.view.items) {
        if (after.selectedIds.has(it.id)) {
          startBboxes[it.id] = { x: it.x, y: it.y, w: it.w, h: it.h };
        }
      }
      startRef.current = { point, bboxes: startBboxes };
      draggingRef.current = false;
    },
    [instance.id],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (!startRef.current) return;
    const svgEl = e.currentTarget.ownerSVGElement;
    const cur = safeSvgPoint(svgEl, e.clientX, e.clientY);
    const dx = cur.x - startRef.current.point.x;
    const dy = cur.y - startRef.current.point.y;
    const store = useEditorStore.getState();
    if (!draggingRef.current) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      store.beginGesture({
        type: 'move',
        startPoint: startRef.current.point,
        startBboxes: startRef.current.bboxes,
        startRotations: {},
      });
      draggingRef.current = true;
    }
    store.applyMove(dx, dy);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGGElement>) => {
    if (draggingRef.current) {
      useEditorStore.getState().endGesture();
    }
    startRef.current = null;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  return (
    <g
      data-widget-id={instance.id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: 'pointer' }}
    >
      <SvgWidgetInstance instance={renderItem} reactorId={reactorId} />
      {isSelected && (
        <rect
          x={instance.x}
          y={instance.y}
          width={instance.w}
          height={instance.h}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1}
          strokeDasharray="3,3"
          pointerEvents="none"
          data-testid={`selection-outline-${instance.id}`}
        />
      )}
    </g>
  );
}
