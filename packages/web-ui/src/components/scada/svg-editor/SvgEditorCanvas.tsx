// packages/web-ui/src/components/scada/svg-editor/SvgEditorCanvas.tsx
'use client';
import React, { useRef } from 'react';
import { useEditorStore } from './useEditorStore';
import { SelectableWidget } from './SelectableWidget';
import { SelectionOverlay } from './SelectionOverlay';
import { RubberBand } from './RubberBand';
import { svgPoint, intersects } from './transform-math';
import type { AABB } from './types';

interface Props {
  reactorId: string;
}

function safeSvgPoint(svgEl: SVGSVGElement | null, clientX: number, clientY: number): { x: number; y: number } {
  if (!svgEl) return { x: clientX, y: clientY };
  try {
    return svgPoint(svgEl, clientX, clientY);
  } catch {
    return { x: clientX, y: clientY };
  }
}

export function SvgEditorCanvas({ reactorId }: Props) {
  const view = useEditorStore((s) => s.view);
  const beginGesture = useEditorStore((s) => s.beginGesture);
  const endGesture = useEditorStore((s) => s.endGesture);
  const select = useEditorStore((s) => s.select);
  const items = view.items;
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget) return;
    const start = safeSvgPoint(svgRef.current, e.clientX, e.clientY);
    beginGesture({
      type: 'rubberband',
      startPoint: start,
      startBboxes: {},
      startRotations: {},
      rubberRect: { x: start.x, y: start.y, w: 0, h: 0 },
    });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = useEditorStore.getState().gesture;
    if (!g || g.type !== 'rubberband') return;
    const cur = safeSvgPoint(svgRef.current, e.clientX, e.clientY);
    const rect: AABB = {
      x: Math.min(g.startPoint.x, cur.x),
      y: Math.min(g.startPoint.y, cur.y),
      w: Math.abs(cur.x - g.startPoint.x),
      h: Math.abs(cur.y - g.startPoint.y),
    };
    useEditorStore.setState({ gesture: { ...g, rubberRect: rect } });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = useEditorStore.getState().gesture;
    if (!g || g.type !== 'rubberband' || !g.rubberRect) {
      endGesture();
      return;
    }
    const hits = items
      .filter((it) => intersects(g.rubberRect!, { x: it.x, y: it.y, w: it.w, h: it.h }))
      .map((it) => it.id);
    select(hits, e.shiftKey ? 'add' : 'replace');
    endGesture();
  };

  return (
    <svg
      ref={svgRef}
      width={view.width}
      height={view.height}
      viewBox={`0 0 ${view.width} ${view.height}`}
      style={{ background: view.background ?? '#fff', userSelect: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      data-testid="svg-editor-canvas"
    >
      <g data-testid="widgets-layer">
        {items.map((it) => (
          <SelectableWidget key={it.id} instance={it} reactorId={reactorId} />
        ))}
      </g>
      <SelectionOverlay />
      <RubberBand />
    </svg>
  );
}
