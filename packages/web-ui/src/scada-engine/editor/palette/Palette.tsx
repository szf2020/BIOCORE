// SP-FX-4 + SP-FX-5: palette panel — basic shapes on top, ShapePicker below.

import React from 'react';
import { PALETTE_ITEMS } from './palette-items';
import { ShapePicker } from './ShapePicker';

export function Palette(): JSX.Element {
  return (
    <div data-panel="palette" className="w-[200px] flex-shrink-0 flex flex-col border-r border-zinc-700 bg-zinc-900 overflow-hidden">
      <ul data-section="basic" className="p-2 space-y-1">
        {PALETTE_ITEMS.map((item) => (
          <li
            key={item.id}
            draggable
            data-palette-item={item.id}
            onDragStart={(e) => {
              e.dataTransfer.setData('palette-item', item.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            className="cursor-grab px-2 py-1 text-sm text-zinc-100 hover:bg-zinc-800 rounded"
          >
            {item.label}
          </li>
        ))}
      </ul>
      <ShapePicker />
    </div>
  );
}
