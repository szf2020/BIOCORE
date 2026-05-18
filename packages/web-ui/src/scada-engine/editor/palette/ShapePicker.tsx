import React, { useState, useMemo } from 'react';
import { SHAPE_CATALOG, type PaletteShape } from './shape-catalog';

export function ShapePicker(): JSX.Element {
  const [q, setQ] = useState('');
  const filtered = useMemo<ReadonlyArray<PaletteShape>>(() => {
    if (!q.trim()) return SHAPE_CATALOG;
    const lo = q.toLowerCase();
    return SHAPE_CATALOG.filter(
      (s) => s.id.toLowerCase().includes(lo) || s.label.toLowerCase().includes(lo),
    );
  }, [q]);

  return (
    <div data-panel="shape-picker" className="flex flex-col flex-1 min-h-0 border-t border-zinc-700">
      <input
        data-input="shape-search"
        type="text"
        placeholder="搜索形状..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="m-2 px-2 py-1 text-sm bg-zinc-800 text-zinc-100 rounded"
      />
      {filtered.length === 0 ? (
        <p data-empty className="px-2 text-sm text-zinc-500">无匹配</p>
      ) : (
        <ul data-grid className="grid grid-cols-3 gap-1 p-2 overflow-y-auto">
          {filtered.map((shape) => (
            <li
              key={shape.id}
              draggable
              data-palette-shape={shape.id}
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  'palette-shape',
                  JSON.stringify({ id: shape.id, src: shape.src }),
                );
                e.dataTransfer.effectAllowed = 'copy';
              }}
              title={shape.label}
              className="cursor-grab aspect-square flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded"
            >
              <img src={shape.src} alt={shape.label} className="w-full h-full p-1" draggable={false} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
