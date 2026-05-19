// SP-FX-4: palette item registry + widget factory for drag-onto-canvas.

import type { FuxaWidget } from '../../models/widget';

export type PaletteItemType = 'rect' | 'ellipse' | 'text' | 'line';

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

export function makeWidget(
  type: PaletteItemType,
  pt: { x: number; y: number },
  gridSize: number,
): FuxaWidget {
  const item = PALETTE_ITEMS.find((i) => i.id === type)!;
  const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
  const step = gridSize > 0 ? gridSize : 1;
  return {
    id,
    type,
    property: {},
    x: Math.round(pt.x / step) * step,
    y: Math.round(pt.y / step) * step,
    w: item.defaultW,
    h: item.defaultH,
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
  // General — HTML controls, charts, media, scheduler
  { widgetType: 'svg-ext-value',           label: '数值显示',  defaultW: 120, defaultH: 30,  category: 'general' },
  { widgetType: 'svg-ext-html_button',     label: '按钮',      defaultW: 100, defaultH: 36,  category: 'general' },
  { widgetType: 'svg-ext-html_input',      label: '输入框',    defaultW: 140, defaultH: 32,  category: 'general' },
  { widgetType: 'svg-ext-html_chart',      label: '折线图表',  defaultW: 320, defaultH: 200, category: 'general' },
  { widgetType: 'svg-ext-own_ctrl-table',  label: '表格',      defaultW: 280, defaultH: 160, category: 'general' },
  { widgetType: 'svg-ext-html_img',        label: '图片',      defaultW: 120, defaultH: 80,  category: 'general' },
  { widgetType: 'svg-ext-html_iframe',     label: '内嵌网页',  defaultW: 320, defaultH: 200, category: 'general' },
  { widgetType: 'svg-ext-html_video',      label: '视频',      defaultW: 320, defaultH: 180, category: 'general' },
  { widgetType: 'svg-ext-html_scheduler',  label: '日程表',    defaultW: 480, defaultH: 200, category: 'general' },
  { widgetType: 'svg-ext-html_select',     label: '下拉选择',  defaultW: 140, defaultH: 32,  category: 'general' },
  // Animation — value-driven visual widgets
  { widgetType: 'svg-ext-gauge_semaphore', label: '信号灯',    defaultW: 60,  defaultH: 60,  category: 'animation' },
  { widgetType: 'svg-ext-gauge_progress',  label: '进度条',    defaultW: 40,  defaultH: 120, category: 'animation' },
  { widgetType: 'svg-ext-html_switch',     label: '开关',      defaultW: 60,  defaultH: 30,  category: 'animation' },
  { widgetType: 'svg-ext-html_slider',     label: '滑块',      defaultW: 200, defaultH: 40,  category: 'animation' },
  { widgetType: 'svg-ext-pipe',            label: '管道',      defaultW: 120, defaultH: 20,  category: 'animation' },
  { widgetType: 'svg-ext-html_bag',        label: '袋装料',    defaultW: 60,  defaultH: 80,  category: 'animation' },
  { widgetType: 'svg-ext-html_graph',      label: '柱状图',    defaultW: 200, defaultH: 140, category: 'animation' },
  // Shape — passive containers
  { widgetType: 'svg-ext-panel',           label: '面板容器',  defaultW: 200, defaultH: 120, category: 'shape' },
  // Proc. Eng. — industrial process equipment
  { widgetType: 'svg-ext-tank',            label: '罐体',      defaultW: 80,  defaultH: 140, category: 'procEng' },
  { widgetType: 'svg-ext-motor',           label: '电机',      defaultW: 80,  defaultH: 80,  category: 'procEng' },
  { widgetType: 'svg-ext-compressor',      label: '压缩机',    defaultW: 100, defaultH: 80,  category: 'procEng' },
  { widgetType: 'svg-ext-valve',           label: '阀门',      defaultW: 60,  defaultH: 60,  category: 'procEng' },
  { widgetType: 'svg-ext-pump',            label: '水泵',      defaultW: 80,  defaultH: 80,  category: 'procEng' },
];

export const PALETTE_CATEGORY_LABELS: Record<PaletteCategory, string> = {
  general: 'General',
  animation: 'Animation',
  shape: 'Shape',
  procEng: 'Proc. Eng.',
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
