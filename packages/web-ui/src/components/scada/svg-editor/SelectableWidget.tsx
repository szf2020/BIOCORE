'use client';
import React, { useCallback } from 'react';
import { SvgWidgetInstance } from '@/components/scada/SvgWidgetInstance';
import type { SvgWidgetItem } from '@/widgets/svg/types';
import { useEditorStore } from './useEditorStore';

interface Props {
  instance: SvgWidgetItem;
  reactorId: string;
}

export function SelectableWidget({ instance, reactorId }: Props) {
  const select = useEditorStore((s) => s.select);
  const isSelected = useEditorStore((s) => s.selectedIds.has(instance.id));
  const previewAnimations = useEditorStore((s) => s.previewAnimations);

  const renderItem: SvgWidgetItem = previewAnimations
    ? instance
    : { ...instance, animations: undefined };

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    const mode = e.shiftKey ? 'toggle' : e.ctrlKey || e.metaKey ? 'add' : 'replace';
    select([instance.id], mode);
  }, [instance.id, select]);

  return (
    <g
      data-widget-id={instance.id}
      onPointerDown={handlePointerDown}
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
