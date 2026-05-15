'use client';
import React from 'react';
import { BoundWidget } from '@/widgets';
import type { ScadaView } from '@/api/scada';

export function WidgetView({ view }: { view: ScadaView }) {
  const items = Object.values(view.items ?? {});
  return (
    <div
      data-testid="scada-canvas"
      style={{
        position: 'relative',
        width: `${view.width}px`,
        height: `${view.height}px`,
        background: view.background,
        overflow: 'hidden',
      }}
    >
      {items.map((item: any) => (
        <BoundWidget
          key={`${item.id}:${item.bindings?.length ?? 0}`}
          widget={item}
        />
      ))}
    </div>
  );
}
