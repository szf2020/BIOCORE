'use client';
import React from 'react';
import { WIDGET_REGISTRY } from '@/widgets/registry';

export function WidgetPalette() {
  const keys = Object.keys(WIDGET_REGISTRY) as Array<keyof typeof WIDGET_REGISTRY>;
  return (
    <div className="p-3 space-y-2 overflow-y-auto bg-white border-r" style={{ width: 180 }}>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">控件</h3>
      {keys.map(k => {
        const entry = WIDGET_REGISTRY[k];
        return (
          <div
            key={k}
            data-widget-type={k}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/x-scada-widget-type', k)}
            className="px-3 py-2 border rounded bg-white cursor-grab text-sm hover:bg-gray-50 select-none"
          >
            {entry.displayName}
          </div>
        );
      })}
    </div>
  );
}
