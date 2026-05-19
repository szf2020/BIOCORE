// SP-FX-4: palette panel — basic shapes on top, gauges by category below.
// SP-FX-27: batch 2 gauge widgets section.
// SP-FX-48.12: FUXA-aligned categories (General/Animation/Shape/Proc.Eng) with
//   collapsible <details> sections matching FUXA's left sidebar layout.
// SP-FX-48.14: ShapePicker + 209-shape catalog removed entirely — gauge
//   widgets cover the same surface area.
// SP-FX-48.18: icon-grid layout — each item shows a lucide icon with native
//   `title` tooltip (matches FUXA's icon palette style).

import React from 'react';
import {
  Square, Circle, Type, Minus,
  Pencil, CircleDashed, Spline,
  Hash, RectangleHorizontal, TextCursorInput, Image as ImageIcon, ListOrdered,
  Lightbulb, BarChart3, ToggleLeft, SlidersHorizontal, ArrowRight, Package, BarChart2,
  SquareDashed,
  Container, Cog, Fan, Diamond, Disc,
  HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  PALETTE_ITEMS,
  GAUGE_PALETTE_ITEMS,
  PALETTE_CATEGORY_LABELS,
  DRAW_TOOL_ITEMS,
  type PaletteCategory,
  type PaletteItemType,
  type DrawToolType,
} from './palette-items';
import { useEditorStore } from '../../services/editor-store';
import { SHAPE_CATALOG, SHAPE_GROUP_LABELS, type ShapeGroup, type ShapeEntry } from '../shapes/shape-catalog';

const CATEGORY_ORDER: PaletteCategory[] = ['general', 'animation', 'shape', 'procEng'];

const BASIC_ICONS: Record<PaletteItemType, LucideIcon> = {
  rect: Square,
  ellipse: Circle,
  text: Type,
  line: Minus,
  pencil: Pencil,
  path: Spline,
};

const DRAW_ICONS: Record<DrawToolType, LucideIcon> = {
  pencil: Pencil,
  'ellipse-draw': CircleDashed,
  path: Spline,
};

const GAUGE_ICONS: Record<string, LucideIcon> = {
  'svg-ext-value': Hash,
  'svg-ext-html_button': RectangleHorizontal,
  'svg-ext-html_input': TextCursorInput,
  'svg-ext-html_img': ImageIcon,
  'svg-ext-html_select': ListOrdered,
  'svg-ext-gauge_semaphore': Lightbulb,
  'svg-ext-gauge_progress': BarChart3,
  'svg-ext-html_switch': ToggleLeft,
  'svg-ext-html_slider': SlidersHorizontal,
  'svg-ext-pipe': ArrowRight,
  'svg-ext-html_bag': Package,
  'svg-ext-html_graph': BarChart2,
  'svg-ext-panel': SquareDashed,
  'svg-ext-tank': Container,
  'svg-ext-motor': Cog,
  'svg-ext-compressor': Fan,
  'svg-ext-valve': Diamond,
  'svg-ext-pump': Disc,
};

function IconCell({ Icon, label, active = false }: { Icon: LucideIcon; label: string; active?: boolean }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 w-full h-full">
      <Icon size={20} className={active ? 'text-white' : 'text-zinc-200'} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

// SP-FX-48.20: thumbnail render for shape-catalog entries (SVG content[] array).
// Renders inline <svg viewBox> with stroke-only style for compact preview.
function ShapeThumb({ shape }: { shape: ShapeEntry }): JSX.Element {
  return (
    <svg
      viewBox={`${shape.bbox.x} ${shape.bbox.y} ${shape.bbox.w} ${shape.bbox.h}`}
      preserveAspectRatio="xMidYMid meet"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {shape.content.map((c, i) => {
        const Tag = c.type as keyof JSX.IntrinsicElements;
        const attrs: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(c.attr)) attrs[k] = v as string | number;
        return <Tag key={i} {...(attrs as Record<string, unknown>)} />;
      })}
    </svg>
  );
}

const SHAPE_GROUP_ORDER: ShapeGroup[] = ['basic', 'process', 'compressor', 'pumps', 'animation'];

export function Palette(): JSX.Element {
  const drawTool = useEditorStore((s) => s.drawTool);
  return (
    <div data-panel="palette" className="w-[148px] flex-shrink-0 flex flex-col border-r border-zinc-700 bg-zinc-900 overflow-auto">
      <details open data-section="basic" className="border-b border-zinc-700">
        <summary className="px-2 py-1 text-xs uppercase tracking-wider text-zinc-400 cursor-pointer hover:text-zinc-200">基础</summary>
        <ul className="p-2 grid grid-cols-3 gap-1">
          {PALETTE_ITEMS.map((item) => {
            const Icon = BASIC_ICONS[item.id] ?? HelpCircle;
            return (
              <li
                key={item.id}
                draggable
                data-palette-item={item.id}
                title={item.label}
                onDragStart={(e) => {
                  e.dataTransfer.setData('palette-item', item.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                className="cursor-grab flex items-center justify-center aspect-square text-zinc-100 hover:bg-zinc-800 rounded"
              >
                <IconCell Icon={Icon} label={item.label} />
              </li>
            );
          })}
          {DRAW_TOOL_ITEMS.map((tool) => {
            const Icon = DRAW_ICONS[tool.id] ?? HelpCircle;
            const active = drawTool === tool.id;
            return (
              <li
                key={tool.id}
                data-palette-tool={tool.id}
                data-active={active ? 'true' : 'false'}
                title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                onClick={() => {
                  const store = useEditorStore.getState();
                  if (store.drawTool === tool.id) store.cancelDraw();
                  else store.setDrawTool(tool.id);
                }}
                className={`cursor-pointer flex items-center justify-center aspect-square rounded ${active ? 'bg-blue-600' : 'hover:bg-zinc-800'}`}
              >
                <IconCell Icon={Icon} label={tool.label} active={active} />
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
            <ul className="p-2 grid grid-cols-3 gap-1">
              {items.map((item) => {
                const Icon = GAUGE_ICONS[item.widgetType] ?? HelpCircle;
                return (
                  <li
                    key={item.widgetType}
                    draggable
                    data-palette-gauge={item.widgetType}
                    title={item.label}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('palette-gauge', item.widgetType);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="cursor-grab flex items-center justify-center aspect-square text-zinc-100 hover:bg-zinc-800 rounded"
                  >
                    <IconCell Icon={Icon} label={item.label} />
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
      {/* SP-FX-48.20: FUXA shape library — 153 industrial shapes by group */}
      {SHAPE_GROUP_ORDER.map((grp) => {
        const items = SHAPE_CATALOG.filter((s) => s.group === grp);
        if (items.length === 0) return null;
        return (
          <details key={grp} data-section={`shapes-${grp}`} className="border-b border-zinc-700">
            <summary className="px-2 py-1 text-xs uppercase tracking-wider text-zinc-400 cursor-pointer hover:text-zinc-200">
              形状 · {SHAPE_GROUP_LABELS[grp]} <span className="ml-1 opacity-50">({items.length})</span>
            </summary>
            <ul className="p-2 grid grid-cols-3 gap-1 max-h-[280px] overflow-y-auto">
              {items.map((shape) => (
                <li
                  key={shape.name}
                  draggable
                  data-palette-shape={shape.name}
                  title={shape.name}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('palette-shape', shape.name);
                    e.dataTransfer.setData('palette-shape-bbox', `${shape.bbox.w},${shape.bbox.h}`);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="cursor-grab flex items-center justify-center aspect-square text-zinc-100 hover:bg-zinc-800 rounded"
                >
                  <ShapeThumb shape={shape} />
                  <span className="sr-only">{shape.name}</span>
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
