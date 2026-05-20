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
  Lightbulb, BarChart3, BatteryMedium, ToggleLeft, SlidersVertical,
  SquareDashed,
  Container, Cog, Fan, Diamond, Disc,
  HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// SP-FX-FF.23: inline pipe icon — 2 parallel L-shaped paths forming an elbow
// joint, matching FUXA's industrial-pipe glyph (top-view P&ID style).
const PipeIcon = (({ size = 20, className }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="square"
    strokeLinejoin="miter"
    className={className}
    aria-hidden="true"
  >
    {/* Outer pipe path: top → elbow → right */}
    <path d="M 4 3 L 4 13 L 21 13" />
    {/* Inner parallel pipe path (offset for "pipe wall") */}
    <path d="M 8 3 L 8 9 L 21 9" />
    {/* End caps at the open ends */}
    <line x1="3" y1="3" x2="9" y2="3" />
    <line x1="21" y1="8" x2="21" y2="14" />
  </svg>
)) as unknown as LucideIcon;
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
  // SP-FX-FF.20: half-battery visualizes "filled bar" better than 3-bar chart.
  'svg-ext-gauge_progress': BatteryMedium,
  'svg-ext-html_switch': ToggleLeft,
  // SP-FX-FF.21: vertical slider matches the vertical slider widget shape.
  'svg-ext-html_slider': SlidersVertical,
  // SP-FX-FF.22: custom horizontal pipe glyph — FUXA-style industrial pipe.
  'svg-ext-pipe': PipeIcon,
  // SP-FX-FF.21: 3-bar BarChart3 is the canonical "bar chart" silhouette.
  'svg-ext-html_graph': BarChart3,
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
  const armed = useEditorStore((s) => s.armedPlacement);
  // SP-FX-48.26: unified click-to-arm — clicking a palette icon toggles
  // armedPlacement; the next canvas click spawns the widget there. Drag still
  // works for users who prefer drag-drop.
  const toggleArmBasic = (id: string) => {
    const s = useEditorStore.getState();
    if (s.armedPlacement?.kind === 'basic' && s.armedPlacement.itemId === id) {
      s.clearArmedPlacement();
    } else {
      s.setArmedPlacement({ kind: 'basic', itemId: id });
    }
  };
  const toggleArmGauge = (widgetType: string) => {
    const s = useEditorStore.getState();
    if (s.armedPlacement?.kind === 'gauge' && s.armedPlacement.widgetType === widgetType) {
      s.clearArmedPlacement();
    } else {
      s.setArmedPlacement({ kind: 'gauge', widgetType });
    }
  };
  const toggleArmShape = (name: string, bbox: { w: number; h: number }) => {
    const s = useEditorStore.getState();
    if (s.armedPlacement?.kind === 'shape' && s.armedPlacement.shapeName === name) {
      s.clearArmedPlacement();
    } else {
      s.setArmedPlacement({ kind: 'shape', shapeName: name, bbox });
    }
  };
  const isArmedBasic = (id: string) => armed?.kind === 'basic' && armed.itemId === id;
  const isArmedGauge = (t: string) => armed?.kind === 'gauge' && armed.widgetType === t;
  const isArmedShape = (n: string) => armed?.kind === 'shape' && armed.shapeName === n;
  return (
    <div data-panel="palette" className="w-[148px] flex-shrink-0 flex flex-col border-r border-zinc-700 bg-zinc-900 overflow-auto">
      <details open data-section="basic" className="border-b border-zinc-700">
        <summary className="px-2 py-1 text-xs uppercase tracking-wider text-zinc-400 cursor-pointer hover:text-zinc-200">基础</summary>
        <ul className="p-2 grid grid-cols-3 gap-1">
          {PALETTE_ITEMS.map((item) => {
            const Icon = BASIC_ICONS[item.id] ?? HelpCircle;
            const active = isArmedBasic(item.id);
            return (
              <li
                key={item.id}
                draggable
                data-palette-item={item.id}
                data-active={active ? 'true' : 'false'}
                title={item.label}
                onDragStart={(e) => {
                  e.dataTransfer.setData('palette-item', item.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => toggleArmBasic(item.id)}
                className={`cursor-grab flex items-center justify-center aspect-square rounded ${active ? 'bg-blue-600' : 'text-zinc-100 hover:bg-zinc-800'}`}
              >
                <IconCell Icon={Icon} label={item.label} active={active} />
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
                const active = isArmedGauge(item.widgetType);
                return (
                  <li
                    key={item.widgetType}
                    draggable
                    data-palette-gauge={item.widgetType}
                    data-active={active ? 'true' : 'false'}
                    title={item.label}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('palette-gauge', item.widgetType);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => toggleArmGauge(item.widgetType)}
                    className={`cursor-grab flex items-center justify-center aspect-square rounded ${active ? 'bg-blue-600' : 'text-zinc-100 hover:bg-zinc-800'}`}
                  >
                    <IconCell Icon={Icon} label={item.label} active={active} />
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
              {items.map((shape) => {
                const active = isArmedShape(shape.name);
                return (
                  <li
                    key={shape.name}
                    draggable
                    data-palette-shape={shape.name}
                    data-active={active ? 'true' : 'false'}
                    title={shape.name}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('palette-shape', shape.name);
                      e.dataTransfer.setData('palette-shape-bbox', `${shape.bbox.w},${shape.bbox.h}`);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => toggleArmShape(shape.name, { w: shape.bbox.w, h: shape.bbox.h })}
                    className={`cursor-grab flex items-center justify-center aspect-square rounded ${active ? 'bg-blue-600' : 'text-zinc-100 hover:bg-zinc-800'}`}
                  >
                    <ShapeThumb shape={shape} />
                    <span className="sr-only">{shape.name}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
