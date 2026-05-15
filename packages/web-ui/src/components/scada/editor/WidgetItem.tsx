'use client';
import React from 'react';
import { BoundWidget } from '@/widgets';
import type { WidgetDef } from '@/widgets';

export interface WidgetItemProps {
  widget: WidgetDef;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
}

export function WidgetItem({ widget, isSelected, onSelect, onMove, onResize }: WidgetItemProps) {
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-handle]')) {
      return;
    }
    e.stopPropagation();
    onSelect(widget.id);

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = widget.x;
    const origY = widget.y;
    const onMoveDoc = (ev: MouseEvent) => {
      onMove(widget.id, origX + (ev.clientX - startX), origY + (ev.clientY - startY));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMoveDoc);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMoveDoc);
    document.addEventListener('mouseup', onUp);
  };

  const handleResizeDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = widget.w;
    const origH = widget.h;
    const onMoveDoc = (ev: MouseEvent) => {
      onResize(widget.id, origW + (ev.clientX - startX), origH + (ev.clientY - startY));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMoveDoc);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMoveDoc);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      data-testid="widget-item"
      data-id={widget.id}
      data-selected={isSelected ? '1' : '0'}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.h,
        outline: isSelected ? '2px solid #3b82f6' : 'none',
        outlineOffset: '-2px',
        cursor: 'move',
      }}
    >
      <BoundWidget widget={widget} />
      {isSelected && (
        <div
          data-handle="se"
          onMouseDown={handleResizeDown}
          style={{
            position: 'absolute',
            right: -5, bottom: -5,
            width: 10, height: 10,
            background: '#3b82f6',
            cursor: 'se-resize',
          }}
        />
      )}
    </div>
  );
}
