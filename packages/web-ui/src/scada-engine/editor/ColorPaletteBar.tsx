// SP-FX-FF.5: FUXA-style color palette bar mounted at the bottom of the editor
// canvas. Left-click swatch → patches selected widget(s) property.fill +
// property.color (so both shape-like and text-like widgets pick up the color
// without needing per-type dispatch). The X swatch sets transparent.

import React from 'react';
import { useEditorStore } from '../services/editor-store';
import type { FuxaWidget } from '../models/widget';

// Pre-baked palette approximating FUXA's bottom strip: grayscale ramp followed
// by hue rows (blue → purple → magenta → red → orange → yellow → green → teal).
const PALETTE_COLORS: string[] = [
  // grayscale
  '#000000', '#1f2937', '#374151', '#4b5563', '#6b7280',
  '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#ffffff',
  // blues
  '#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd',
  // purples
  '#581c87', '#7e22ce', '#a855f7', '#c084fc',
  // magentas
  '#831843', '#be185d', '#db2777', '#ec4899', '#f472b6',
  // reds
  '#7f1d1d', '#b91c1c', '#dc2626', '#ef4444', '#f87171',
  // oranges
  '#7c2d12', '#c2410c', '#ea580c', '#f97316', '#fb923c',
  // yellows
  '#713f12', '#a16207', '#ca8a04', '#eab308', '#facc15',
  // greens
  '#14532d', '#15803d', '#22c55e', '#4ade80', '#86efac',
  // teals
  '#134e4a', '#0f766e', '#14b8a6', '#5eead4',
  // cyans
  '#155e75', '#0e7490', '#06b6d4', '#22d3ee',
];

export const TRANSPARENT_VALUE = 'transparent';

interface SwatchProps {
  color: string;
  title: string;
  onPick: (c: string) => void;
}

function Swatch({ color, title, onPick }: SwatchProps): JSX.Element {
  return (
    <button
      type="button"
      data-color={color}
      title={title}
      onClick={() => onPick(color)}
      style={{ background: color === TRANSPARENT_VALUE ? '#ffffff' : color }}
      className="w-5 h-5 border border-zinc-300 hover:border-zinc-700 flex-shrink-0"
    />
  );
}

export function ColorPaletteBar(): JSX.Element {
  const selection = useEditorStore((s) => s.selection);

  const apply = (color: string) => {
    const store = useEditorStore.getState();
    const view = store.currentView;
    if (!view || selection.length === 0) return;
    for (const id of selection) {
      const w = view.items[id] as FuxaWidget | undefined;
      if (!w) continue;
      const prop = (w.property ?? {}) as Record<string, unknown>;
      // Patch both 'fill' (shape widgets) and 'color' (text/value widgets) so
      // the same click works across widget types without dispatch.
      const nextProperty = { ...prop, fill: color, color };
      store.updateWidget(id, { property: nextProperty } as Partial<FuxaWidget>);
    }
  };

  return (
    <div
      data-panel="color-palette"
      className="flex items-center gap-1 px-2 py-1 bg-zinc-100 border-t border-zinc-300 select-none h-8 overflow-hidden"
    >
      <span data-color-zoom className="text-xs text-zinc-600 mr-1 w-12 shrink-0 tabular-nums">
        100 %
      </span>
      <button
        type="button"
        data-color={TRANSPARENT_VALUE}
        title="无填充"
        onClick={() => apply(TRANSPARENT_VALUE)}
        className="w-5 h-5 border border-zinc-400 bg-white text-red-600 text-xs leading-none flex items-center justify-center flex-shrink-0"
      >
        X
      </button>
      <div className="flex gap-px flex-1 overflow-x-auto">
        {PALETTE_COLORS.map((c) => (
          <Swatch key={c} color={c} title={c} onPick={apply} />
        ))}
      </div>
    </div>
  );
}

// Exported for tests
export const __PALETTE_COLORS = PALETTE_COLORS;
