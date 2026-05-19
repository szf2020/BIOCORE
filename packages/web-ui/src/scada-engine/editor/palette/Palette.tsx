// SP-FX-4: palette panel — basic shapes on top, gauges by category below.
// SP-FX-27: batch 2 gauge widgets section.
// SP-FX-48.12: FUXA-aligned categories (General/Animation/Shape/Proc.Eng) with
//   collapsible <details> sections matching FUXA's left sidebar layout.
// SP-FX-48.14: ShapePicker + 209-shape catalog removed entirely — gauge
//   widgets cover the same surface area.

import React from 'react';
import { PALETTE_ITEMS, GAUGE_PALETTE_ITEMS, PALETTE_CATEGORY_LABELS, DRAW_TOOL_ITEMS, type PaletteCategory } from './palette-items';
import { useEditorStore } from '../../services/editor-store';

const CATEGORY_ORDER: PaletteCategory[] = ['general', 'animation', 'shape', 'procEng'];

export function Palette(): JSX.Element {
  const drawTool = useEditorStore((s) => s.drawTool);
  return (
    <div data-panel="palette" className="w-[200px] flex-shrink-0 flex flex-col border-r border-zinc-700 bg-zinc-900 overflow-auto">
      <details open data-section="basic" className="border-b border-zinc-700">
        <summary className="px-2 py-1 text-xs uppercase tracking-wider text-zinc-400 cursor-pointer hover:text-zinc-200">Basic</summary>
        <ul className="p-2 space-y-1">
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
          <li className="border-t border-zinc-700 my-1" data-divider="tools" />
          {DRAW_TOOL_ITEMS.map((tool) => {
            const active = drawTool === tool.id;
            return (
              <li
                key={tool.id}
                data-palette-tool={tool.id}
                data-active={active ? 'true' : 'false'}
                onClick={() => {
                  const store = useEditorStore.getState();
                  if (store.drawTool === tool.id) store.cancelDraw();
                  else store.setDrawTool(tool.id);
                }}
                className={`cursor-pointer px-2 py-1 text-sm rounded ${active ? 'bg-blue-600 text-white' : 'text-zinc-100 hover:bg-zinc-800'}`}
              >
                {tool.label}{tool.shortcut ? <span className="ml-2 text-xs opacity-60">{tool.shortcut}</span> : null}
              </li>
            );
          })}
        </ul>
      </details>
      {CATEGORY_ORDER.map((cat) => {
        const items = GAUGE_PALETTE_ITEMS.filter((g) => g.category === cat);
        if (items.length === 0) return null;
        return (
          <details key={cat} open data-section={`gauges-${cat}`} className="border-b border-zinc-700">
            <summary className="px-2 py-1 text-xs uppercase tracking-wider text-zinc-400 cursor-pointer hover:text-zinc-200">
              {PALETTE_CATEGORY_LABELS[cat]}
            </summary>
            <ul className="p-2 space-y-1">
              {items.map((item) => (
                <li
                  key={item.widgetType}
                  draggable
                  data-palette-gauge={item.widgetType}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('palette-gauge', item.widgetType);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="cursor-grab px-2 py-1 text-sm text-zinc-100 hover:bg-zinc-800 rounded"
                >
                  {item.label}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
