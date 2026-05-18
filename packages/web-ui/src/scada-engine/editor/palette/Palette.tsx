// SP-FX-4: left palette panel — 3 basic shapes draggable onto canvas.

import React from 'react';
import { PALETTE_ITEMS } from './palette-items';

export function Palette(): JSX.Element {
  return (
    <ul
      data-panel="palette"
      className="w-[200px] flex-shrink-0 border-r border-zinc-700 bg-zinc-900 p-2 space-y-1 overflow-y-auto"
    >
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
  );
}
