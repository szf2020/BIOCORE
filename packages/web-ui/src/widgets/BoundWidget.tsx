'use client';
import React from 'react';
import { useTag } from '@/hooks';
import { WIDGET_REGISTRY } from './registry';
import { compileTransform } from './transform';
import type { WidgetDef, Binding } from './types';

export function BoundWidget({ widget }: { widget: WidgetDef }) {
  const entry = (WIDGET_REGISTRY as any)[widget.type];

  if (!entry) {
    return (
      <div
        style={{
          position: 'absolute',
          left: widget.x,
          top: widget.y,
          width: widget.w,
          height: widget.h,
          color: 'red',
          border: '1px dashed red',
          fontSize: 12,
          padding: 4,
        }}
      >
        Unknown widget: {widget.type}
      </div>
    );
  }

  const baseProps = { ...entry.defaultProps(), ...(widget as any).props };
  const boundProps = useBoundProps(baseProps, widget.bindings ?? []);

  const Component = entry.component as React.ComponentType<any>;
  return (
    <div
      style={{
        position: 'absolute',
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.h,
        transform: widget.rotation ? `rotate(${widget.rotation}deg)` : undefined,
      }}
    >
      <Component {...boundProps} widgetId={widget.id} width={widget.w} height={widget.h} />
    </div>
  );
}

function useBoundProps(base: Record<string, any>, bindings: Binding[]): Record<string, any> {
  const merged = { ...base };
  for (const b of bindings) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const snap = useTag(b.tag);
    const fn = b.transform ? compileTransform(b.transform) : (v: any) => v;
    let resolved: any;
    try {
      resolved = fn(snap.value);
    } catch {
      resolved = snap.value;
    }
    merged[b.prop] = resolved;
  }
  return merged;
}
