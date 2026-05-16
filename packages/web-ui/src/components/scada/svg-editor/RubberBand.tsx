// packages/web-ui/src/components/scada/svg-editor/RubberBand.tsx
'use client';
import React from 'react';
import { useEditorStore } from './useEditorStore';

export function RubberBand() {
  const gesture = useEditorStore((s) => s.gesture);
  if (!gesture || gesture.type !== 'rubberband' || !gesture.rubberRect) return null;
  const r = gesture.rubberRect;
  return (
    <rect
      data-testid="rubber-band"
      x={r.x}
      y={r.y}
      width={r.w}
      height={r.h}
      fill="rgba(59, 130, 246, 0.1)"
      stroke="#3b82f6"
      strokeWidth={1}
      strokeDasharray="3,3"
      pointerEvents="none"
    />
  );
}
