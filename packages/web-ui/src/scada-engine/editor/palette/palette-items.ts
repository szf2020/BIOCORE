// SP-FX-4: palette item registry + widget factory for drag-onto-canvas.

import type { FuxaWidget } from '../../models/widget';

export type PaletteItemType = 'rect' | 'ellipse' | 'text' | 'line' | 'pencil' | 'path' | 'shape';

export type DrawToolType = 'pencil' | 'path' | 'ellipse-draw';

export interface PaletteItem {
  id: PaletteItemType;
  label: string;
  defaultW: number;
  defaultH: number;
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { id: 'rect',    label: '矩形', defaultW: 100, defaultH: 60 },
  { id: 'ellipse', label: '椭圆', defaultW: 80,  defaultH: 80 },
  { id: 'text',    label: '文本', defaultW: 120, defaultH: 30 },
  { id: 'line',    label: '直线', defaultW: 120, defaultH: 2 },
];

// SP-FX-48.17: Drawing tools — click to activate, draw on canvas with mouse.
// Pencil = freehand drag; Path = click-segments; Ellipse-draw = drag bbox.
export interface DrawToolItem {
  id: DrawToolType;
  label: string;
  shortcut?: string;
}

export const DRAW_TOOL_ITEMS: DrawToolItem[] = [
  { id: 'pencil',       label: '铅笔', shortcut: 'P' },
  { id: 'ellipse-draw', label: '椭圆工具' },
  { id: 'path',         label: '折线' },
];

export function makeWidget(
  type: PaletteItemType,
  pt: { x: number; y: number },
  gridSize: number,
): FuxaWidget {
  const item = PALETTE_ITEMS.find((i) => i.id === type);
  const defaultW = item?.defaultW ?? 80;
  const defaultH = item?.defaultH ?? 60;
  const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
  const step = gridSize > 0 ? gridSize : 1;
  return {
    id,
    type,
    property: {},
    x: Math.round(pt.x / step) * step,
    y: Math.round(pt.y / step) * step,
    w: defaultW,
    h: defaultH,
  } as FuxaWidget;
}

// SP-FX-48.17: Build pencil/path widget from drawn point list.
// Points are absolute canvas coords; bbox computed to set x/y/w/h.
export function makeDrawnWidget(
  type: 'pencil' | 'path',
  points: number[],
): FuxaWidget | null {
  if (points.length < 4) return null; // need at least 2 points
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const x = Math.floor(minX);
  const y = Math.floor(minY);
  const w = Math.max(2, Math.ceil(maxX - minX));
  const h = Math.max(2, Math.ceil(maxY - minY));
  const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
  return {
    id,
    type,
    property: { points, stroke: '#111827', strokeWidth: 2, fill: 'none' },
    x,
    y,
    w,
    h,
  } as FuxaWidget;
}

// SP-FX-FF.42: 部分 FUXA shape 自带预设动画 (eli/elica 扇叶默认旋转 — 复刻
// FUXA palette 行为)。用户可在 PropertyPanel 调整 rotateSpeed 或置 0 停止。
const SHAPE_DEFAULT_PROPERTY: Record<string, Record<string, unknown>> = {
  // SP-FX-FF.43: eli 形状现为 14-blade turbine (复刻 FUXA);blade rect 没有
  // explicit fill,继承 prop.fill — 默认深色 + stroke 同色给经典 FUXA 外观。
  eli: { rotateSpeed: 60, fill: '#1e293b', stroke: '#1e293b' },
};

// SP-FX-48.20: Build shape widget referencing FUXA shape-catalog entry.
// Renders via canvas-svg case 'shape' which uses shape.content[] paths.
// Widget bbox = shape natural bbox * 2 (FUXA defaults to 2x scaling).
export function makeShapeWidget(
  shapeName: string,
  shapeBBox: { w: number; h: number },
  pt: { x: number; y: number },
  gridSize: number,
): FuxaWidget {
  const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
  const step = gridSize > 0 ? gridSize : 1;
  const scale = 2; // FUXA palette default — shapes drawn at 2x natural size for visibility
  return {
    id,
    type: 'shape',
    property: {
      shapeName,
      fill: 'none',
      stroke: '#1e293b',
      strokeWidth: 1.5,
      ...(SHAPE_DEFAULT_PROPERTY[shapeName] ?? {}),
    },
    x: Math.round(pt.x / step) * step,
    y: Math.round(pt.y / step) * step,
    w: Math.max(20, Math.round((shapeBBox.w * scale) / step) * step),
    h: Math.max(20, Math.round((shapeBBox.h * scale) / step) * step),
  } as FuxaWidget;
}

// SP-FX-48.17: Build ellipse widget from drag bbox (px1,py1)->(px2,py2).
export function makeEllipseFromDrag(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  gridSize: number,
): FuxaWidget | null {
  const x = Math.min(p1.x, p2.x);
  const y = Math.min(p1.y, p2.y);
  const w = Math.abs(p2.x - p1.x);
  const h = Math.abs(p2.y - p1.y);
  if (w < 4 || h < 4) return null;
  const step = gridSize > 0 ? gridSize : 1;
  const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
  return {
    id,
    type: 'ellipse',
    property: {},
    x: Math.round(x / step) * step,
    y: Math.round(y / step) * step,
    w: Math.round(w / step) * step || step,
    h: Math.round(h / step) * step || step,
  } as FuxaWidget;
}

// SP-FX-27: Batch 2 gauge widget palette items.

// SP-FX-48.12: FUXA-aligned palette categories (General / Animation / Shape / Proc.Eng)
export type PaletteCategory = 'general' | 'animation' | 'shape' | 'procEng';

export interface GaugePaletteItem {
  widgetType: string;
  label: string;
  defaultW: number;
  defaultH: number;
  category: PaletteCategory;
}

export const GAUGE_PALETTE_ITEMS: GaugePaletteItem[] = [
  // General — HTML controls + media
  // SP-FX-FF.3: ordering — 数值显示(输出) + 输入框 相邻; 按钮后置; 图片/下拉收尾.
  // SP-FX-FF.13: smaller defaults per user feedback ("外框太大了").
  { widgetType: 'svg-ext-value',           label: '数值显示',  defaultW: 120, defaultH: 40,  category: 'general' },
  { widgetType: 'svg-ext-html_input',      label: '输入框',    defaultW: 120, defaultH: 40,  category: 'general' },
  { widgetType: 'svg-ext-html_button',     label: '按钮',      defaultW: 120, defaultH: 60,  category: 'general' },
  { widgetType: 'svg-ext-html_img',        label: '图片',      defaultW: 120, defaultH: 80,  category: 'general' },
  { widgetType: 'svg-ext-html_select',     label: '下拉选择',  defaultW: 160, defaultH: 50,  category: 'general' },
  // Animation — value-driven visual widgets
  { widgetType: 'svg-ext-gauge_semaphore', label: '信号灯',    defaultW: 60,  defaultH: 60,  category: 'animation' },
  { widgetType: 'svg-ext-gauge_progress',  label: '进度条',    defaultW: 40,  defaultH: 120, category: 'animation' },
  { widgetType: 'svg-ext-html_switch',     label: '开关',      defaultW: 120, defaultH: 40,  category: 'animation' },
  { widgetType: 'svg-ext-html_slider',     label: '滑块',      defaultW: 100, defaultH: 180, category: 'animation' },
  { widgetType: 'svg-ext-pipe',            label: '管道',      defaultW: 120, defaultH: 20,  category: 'animation' },
  { widgetType: 'svg-ext-html_graph',      label: '柱状图',    defaultW: 200, defaultH: 140, category: 'animation' },
  // Shape — passive containers
  // Proc. Eng. — industrial process equipment
  { widgetType: 'svg-ext-tank',            label: '罐体',      defaultW: 80,  defaultH: 140, category: 'procEng' },
  { widgetType: 'svg-ext-motor',           label: '电机',      defaultW: 80,  defaultH: 80,  category: 'procEng' },
  { widgetType: 'svg-ext-compressor',      label: '压缩机',    defaultW: 100, defaultH: 80,  category: 'procEng' },
  { widgetType: 'svg-ext-valve',           label: '阀门',      defaultW: 60,  defaultH: 60,  category: 'procEng' },
  { widgetType: 'svg-ext-pump',            label: '水泵',      defaultW: 80,  defaultH: 80,  category: 'procEng' },
];

export const PALETTE_CATEGORY_LABELS: Record<PaletteCategory, string> = {
  general: '通用',
  animation: '动画',
  shape: '外观',
  procEng: '工艺设备',
};

export function makeGaugeWidget(
  widgetType: string,
  pt: { x: number; y: number },
  gridSize: number,
): FuxaWidget {
  const item = GAUGE_PALETTE_ITEMS.find((i) => i.widgetType === widgetType);
  const defaultW = item?.defaultW ?? 80;
  const defaultH = item?.defaultH ?? 80;
  const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
  const step = gridSize > 0 ? gridSize : 1;
  return {
    id,
    type: widgetType,
    property: {},
    x: Math.round(pt.x / step) * step,
    y: Math.round(pt.y / step) * step,
    w: defaultW,
    h: defaultH,
  } as FuxaWidget;
}
