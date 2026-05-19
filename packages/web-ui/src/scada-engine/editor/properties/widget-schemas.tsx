// SP-FX-6: per-widget-type property schemas. One per batch-1 widget type.

import React from 'react';
import type { WidgetPropertySchema } from './property-schema';

// SP-FX-48.5: basic shape schemas. Rect / ellipse / text — geometry + fill +
// stroke so PropertyPanel exposes editable position/size and visual style
// instead of showing "无属性面板".
const GEOMETRY_ENTRIES = [
  { key: 'x', label: 'X', type: 'number' as const, geometric: true },
  { key: 'y', label: 'Y', type: 'number' as const, geometric: true },
  { key: 'w', label: '宽', type: 'number' as const, geometric: true, min: 0 },
  { key: 'h', label: '高', type: 'number' as const, geometric: true, min: 0 },
];

// SP-FX-48.12: shared FUXA-parity ranges[] + actions[] editor.
// Used by gauge-progress / pipe / tank / motor / valve / pump / compressor / bag.
// Schema-level UI binds to runtime-helpers.matchRange/applyActions.
function renderRangesAndActions(property: Record<string, unknown>, onChange: (patch: Record<string, unknown>) => void): JSX.Element {
  const ranges = Array.isArray((property as any).ranges)
    ? ((property as any).ranges as Array<{ min: number; max: number; color: string }>)
    : [];
  const actions = Array.isArray((property as any).actions)
    ? ((property as any).actions as Array<{ type: 'hide'|'show'|'blink'; range?: { min: number; max: number } }>)
    : [];
  return (
    <>
      <div data-section="ranges" className="mb-2">
        <p className="text-xs text-zinc-400 mb-1">值范围 ({ranges.length})</p>
        {ranges.map((r, i) => (
          <div key={i} className="flex items-center gap-1 mb-1 text-xs">
            <input type="number" value={r.min}
              className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1"
              onChange={(e) => {
                const next = ranges.slice(); next[i] = { ...r, min: Number(e.target.value) };
                onChange({ ranges: next });
              }} />
            <span>→</span>
            <input type="number" value={r.max}
              className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1"
              onChange={(e) => {
                const next = ranges.slice(); next[i] = { ...r, max: Number(e.target.value) };
                onChange({ ranges: next });
              }} />
            <input type="color" value={r.color ?? '#22c55e'}
              className="w-6 h-6 bg-transparent border-0"
              onChange={(e) => {
                const next = ranges.slice(); next[i] = { ...r, color: e.target.value };
                onChange({ ranges: next });
              }} />
            <button className="text-red-400 hover:text-red-300 ml-auto"
              onClick={() => { const next = ranges.slice(); next.splice(i, 1); onChange({ ranges: next }); }}
            >×</button>
          </div>
        ))}
        <button className="text-xs text-blue-400 underline"
          onClick={() => onChange({ ranges: [...ranges, { min: 0, max: 1, color: '#22c55e' }] })}
        >+ 添加范围</button>
      </div>
      <div data-section="actions">
        <p className="text-xs text-zinc-400 mb-1">动作 ({actions.length})</p>
        {actions.map((a, i) => (
          <div key={i} className="flex items-center gap-1 mb-1 text-xs">
            <select value={a.type}
              className="bg-zinc-800 border border-zinc-700 rounded px-1"
              onChange={(e) => {
                const next = actions.slice(); next[i] = { ...a, type: e.target.value as any };
                onChange({ actions: next });
              }}>
              <option value="hide">隐藏</option>
              <option value="show">显示</option>
              <option value="blink">闪烁</option>
            </select>
            <input type="number" placeholder="min" value={a.range?.min ?? 0}
              className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1"
              onChange={(e) => {
                const next = actions.slice();
                next[i] = { ...a, range: { min: Number(e.target.value), max: a.range?.max ?? 0 } };
                onChange({ actions: next });
              }} />
            <span>→</span>
            <input type="number" placeholder="max" value={a.range?.max ?? 0}
              className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1"
              onChange={(e) => {
                const next = actions.slice();
                next[i] = { ...a, range: { min: a.range?.min ?? 0, max: Number(e.target.value) } };
                onChange({ actions: next });
              }} />
            <button className="text-red-400 hover:text-red-300 ml-auto"
              onClick={() => { const next = actions.slice(); next.splice(i, 1); onChange({ actions: next }); }}
            >×</button>
          </div>
        ))}
        <button className="text-xs text-blue-400 underline"
          onClick={() => onChange({ actions: [...actions, { type: 'blink', range: { min: 0, max: 1 } }] })}
        >+ 添加动作</button>
      </div>
    </>
  );
}

export const rectSchema: WidgetPropertySchema = {
  entries: [
    { key: 'fill', label: '填充色', type: 'color', allowNone: true },
    { key: 'stroke', label: '边框色', type: 'color', allowNone: true },
    ...GEOMETRY_ENTRIES,
  ],
};

export const ellipseSchema: WidgetPropertySchema = {
  entries: [
    { key: 'fill', label: '填充色', type: 'color', allowNone: true },
    { key: 'stroke', label: '边框色', type: 'color', allowNone: true },
    ...GEOMETRY_ENTRIES,
  ],
};

export const textSchema: WidgetPropertySchema = {
  entries: [
    { key: 'text', label: '文字内容', type: 'text', placeholder: '文本' },
    { key: 'color', label: '文字颜色', type: 'color', allowNone: true },
    ...GEOMETRY_ENTRIES,
  ],
};

export const lineSchema: WidgetPropertySchema = {
  entries: [
    { key: 'stroke', label: '线条颜色', type: 'color', allowNone: true },
    { key: 'strokeWidth', label: '线条粗细', type: 'number', min: 1, max: 20, step: 1 },
    ...GEOMETRY_ENTRIES,
  ],
};

export const valueSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'label', label: '标签文字', type: 'text', placeholder: '可留空' },
    { key: 'format', label: '格式字符串', type: 'text', placeholder: '{value} °C' },
    { key: 'decimals', label: '小数位', type: 'number', min: 0, max: 6, step: 1 },
    { key: 'color', label: '文字颜色', type: 'color', allowNone: true },
    { key: 'bgColor', label: '背景色', type: 'color', allowNone: true },
    { key: 'unit', label: '单位', type: 'text', placeholder: '°C / rpm / %' },
    { key: 'tooltip', label: '提示文本', type: 'textarea', rows: 2 },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

export const htmlButtonSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'label', label: '按钮文字', type: 'text', placeholder: '点击' },
    { key: 'bgColor', label: '背景色', type: 'color' },
    { key: 'textColor', label: '文字颜色', type: 'color' },
    { key: 'writeValue', label: '写入值', type: 'text', placeholder: '1' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

export const htmlInputSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'inputType', label: '输入类型', type: 'select', options: [
      { value: 'number', label: '数值' },
      { value: 'text', label: '文本' },
      { value: 'date', label: '日期' },
      { value: 'time', label: '时间' },
      { value: 'datetime-local', label: '日期时间' },
    ]},
    { key: 'placeholder', label: '占位文本', type: 'text', placeholder: '请输入' },
    { key: 'min', label: '最小值', type: 'number' },
    { key: 'max', label: '最大值', type: 'number' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

// SP-FX-6.2: Batch 2 schemas

export const gaugeSemaphoreSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'bitmask', label: '位掩码', type: 'number', min: 0 },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
  renderCustomSection: (property, onChange) => {
    const ranges = Array.isArray((property as any).ranges)
      ? ((property as any).ranges as Array<{ min: number; max: number; color: string }>)
      : [];
    const options = ((property as any).options ?? {}) as { semaphoreActions?: Array<{ type: 'hide'|'show'|'blink'; range?: { min: number; max: number } }> };
    const actions = Array.isArray(options.semaphoreActions) ? options.semaphoreActions : [];
    const setActions = (next: typeof actions) =>
      onChange({ options: { ...options, semaphoreActions: next } });
    return (
      <>
        <div data-section="semaphore-ranges" className="mb-2">
          <p className="text-xs text-zinc-400 mb-1">颜色范围 ({ranges.length} 条)</p>
          {ranges.map((r, i) => (
            <div key={i} className="flex items-center gap-1 mb-1 text-xs">
              <input
                type="number" value={r.min}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1"
                onChange={(e) => {
                  const next = ranges.slice(); next[i] = { ...r, min: Number(e.target.value) };
                  onChange({ ranges: next });
                }}
              />
              <span>→</span>
              <input
                type="number" value={r.max}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1"
                onChange={(e) => {
                  const next = ranges.slice(); next[i] = { ...r, max: Number(e.target.value) };
                  onChange({ ranges: next });
                }}
              />
              <input
                type="color" value={r.color}
                className="w-6 h-6 bg-transparent border-0"
                onChange={(e) => {
                  const next = ranges.slice(); next[i] = { ...r, color: e.target.value };
                  onChange({ ranges: next });
                }}
              />
              <button
                className="text-red-400 hover:text-red-300 ml-auto"
                onClick={() => {
                  const next = ranges.slice(); next.splice(i, 1);
                  onChange({ ranges: next });
                }}
              >×</button>
            </div>
          ))}
          <button
            className="text-xs text-blue-400 underline"
            onClick={() => onChange({ ranges: [...ranges, { min: 0, max: 1, color: '#22c55e' }] })}
          >+ 添加范围</button>
        </div>
        <div data-section="semaphore-actions">
          <p className="text-xs text-zinc-400 mb-1">动作 ({actions.length} 条)</p>
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-1 mb-1 text-xs">
              <select
                value={a.type}
                className="bg-zinc-800 border border-zinc-700 rounded px-1"
                onChange={(e) => {
                  const next = actions.slice(); next[i] = { ...a, type: e.target.value as any };
                  setActions(next);
                }}
              >
                <option value="hide">隐藏</option>
                <option value="show">显示</option>
                <option value="blink">闪烁</option>
              </select>
              <input
                type="number" placeholder="min" value={a.range?.min ?? 0}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1"
                onChange={(e) => {
                  const next = actions.slice();
                  next[i] = { ...a, range: { min: Number(e.target.value), max: a.range?.max ?? 0 } };
                  setActions(next);
                }}
              />
              <span>→</span>
              <input
                type="number" placeholder="max" value={a.range?.max ?? 0}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1"
                onChange={(e) => {
                  const next = actions.slice();
                  next[i] = { ...a, range: { min: a.range?.min ?? 0, max: Number(e.target.value) } };
                  setActions(next);
                }}
              />
              <button
                className="text-red-400 hover:text-red-300 ml-auto"
                onClick={() => { const next = actions.slice(); next.splice(i, 1); setActions(next); }}
              >×</button>
            </div>
          ))}
          <button
            className="text-xs text-blue-400 underline"
            onClick={() => setActions([...actions, { type: 'blink', range: { min: 0, max: 1 } }])}
          >+ 添加动作</button>
        </div>
      </>
    );
  },
};

export const gaugeProgressSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'min', label: '最小值', type: 'number' },
    { key: 'max', label: '最大值', type: 'number' },
    { key: 'barColor', label: '进度条颜色 (默认)', type: 'color' },
    { key: 'showLabel', label: '显示数值标签', type: 'boolean' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
  // SP-FX-48.12: ranges[] + actions[] editors (FUXA parity)
  renderCustomSection: (property, onChange) => renderRangesAndActions(property, onChange),
};

export const htmlSwitchSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'onValue', label: 'ON 值', type: 'text', placeholder: '1' },
    { key: 'offValue', label: 'OFF 值', type: 'text', placeholder: '0' },
    { key: 'onColor', label: 'ON 颜色', type: 'color' },
    { key: 'offColor', label: 'OFF 颜色', type: 'color' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

export const sliderSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'min', label: '最小值', type: 'number' },
    { key: 'max', label: '最大值', type: 'number' },
    { key: 'step', label: '步进值', type: 'number', min: 0 },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

export const pipeSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'pipeColor', label: '管道颜色', type: 'color' },
    { key: 'contentColor', label: '内容颜色', type: 'color' },
    // SP-FX-48.9: expose runtime-supported flow animation options (impl reads property.options.flowDirection/flowSpeed)
    { key: 'flowDirection', label: '流向', type: 'select', options: [
      { value: 'none', label: '静止' },
      { value: 'cw', label: '正向 →' },
      { value: 'ccw', label: '反向 ←' },
    ]},
    { key: 'flowSpeed', label: '流速 (ms/frame)', type: 'number', min: 16, max: 1000, step: 16 },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

// SP-FX-9 Batch 3 schemas

export const htmlBagSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'onValue', label: 'ON 值', type: 'text', placeholder: '1' },
    { key: 'onColor', label: 'ON 颜色', type: 'color' },
    { key: 'offColor', label: 'OFF 颜色', type: 'color' },
    { key: 'shape', label: '形状', type: 'select', options: [
      { value: 'circle', label: '圆形' }, { value: 'rect', label: '矩形' },
    ]},
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

export const htmlGraphSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'maxPoints', label: '最大点数', type: 'number', min: 5, max: 600, step: 5 },
    { key: 'lineColor', label: '折线颜色', type: 'color' },
    { key: 'bgColor', label: '背景色', type: 'color' },
    { key: 'minVal', label: '最小值', type: 'number' },
    { key: 'maxVal', label: '最大值', type: 'number' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

export const tankSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'min', label: '最小值', type: 'number' },
    { key: 'max', label: '最大值', type: 'number' },
    { key: 'fillColor', label: '液体颜色', type: 'color' },
    { key: 'bgColor', label: '罐体颜色', type: 'color' },
    { key: 'showLabel', label: '显示数值', type: 'boolean' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

export const motorSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'defaultColor', label: '默认颜色', type: 'color' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
  renderCustomSection: (property, onChange) => {
    const states = Array.isArray((property as any).states)
      ? ((property as any).states as Array<{ value: string; color: string; label?: string }>)
      : [];
    return (
      <div data-section="motor-states">
        <p className="text-xs text-zinc-400 mb-1">状态映射 ({states.length} 条)</p>
        <button
          className="text-xs text-blue-400 underline"
          onClick={() => {
            onChange({ states: [...states, { value: '0', color: '#9ca3af', label: '' }] });
          }}
        >
          + 添加状态
        </button>
      </div>
    );
  },
};

export const htmlImageSchema: WidgetPropertySchema = {
  entries: [
    { key: 'src', label: '图片 URL', type: 'text', placeholder: 'https://...' },
    { key: 'variableId', label: '动态 Tag (可选)', type: 'tag-ref' },
    { key: 'fit', label: '填充方式', type: 'select', options: [
      { value: 'contain', label: 'contain' },
      { value: 'cover', label: 'cover' },
      { value: 'fill', label: 'fill' },
    ]},
    // SP-FX-48.10: optional color tint (mix-blend overlay)
    { key: 'tintColor', label: '色调叠加', type: 'color', allowNone: true },
    { key: 'tintOpacity', label: '叠加不透明度', type: 'number', min: 0, max: 1, step: 0.1 },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

// SP-FX-10 Batch 4 schemas

export const compressorSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'defaultColor', label: '默认颜色', type: 'color' },
    { key: 'bodyColor', label: '机壳颜色', type: 'color' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
  renderCustomSection: (property, onChange) => {
    const states = Array.isArray((property as any).states)
      ? ((property as any).states as Array<{ value: string; color: string; label?: string }>)
      : [];
    return (
      <div data-section="compressor-states">
        <p className="text-xs text-zinc-400 mb-1">状态映射 ({states.length} 条)</p>
        <button
          className="text-xs text-blue-400 underline"
          onClick={() => {
            onChange({ states: [...states, { value: '0', color: '#9ca3af', label: '' }] });
          }}
        >
          + 添加状态
        </button>
      </div>
    );
  },
};

export const valveSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'openValue', label: '开阀值', type: 'text', placeholder: '1' },
    { key: 'openColor', label: '开阀颜色', type: 'color' },
    { key: 'closedColor', label: '关阀颜色', type: 'color' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
};

export const pumpSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'defaultColor', label: '默认颜色', type: 'color' },
    { key: 'bladeCount', label: '叶片数量', type: 'number', min: 2, max: 8, step: 1 },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
  renderCustomSection: (property, onChange) => {
    const states = Array.isArray((property as any).states)
      ? ((property as any).states as Array<{ value: string; color: string }>)
      : [];
    return (
      <div data-section="pump-states">
        <p className="text-xs text-zinc-400 mb-1">状态映射 ({states.length} 条)</p>
        <button
          className="text-xs text-blue-400 underline"
          onClick={() => {
            onChange({ states: [...states, { value: '0', color: '#9ca3af' }] });
          }}
        >
          + 添加状态
        </button>
      </div>
    );
  },
};

export const htmlSelectSchema: WidgetPropertySchema = {
  entries: [
    { key: 'variableId', label: '绑定 Tag', type: 'tag-ref' },
    { key: 'placeholder', label: '占位文本', type: 'text', placeholder: '请选择...' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
  renderCustomSection: (property, onChange) => {
    const options = Array.isArray((property as any).options)
      ? ((property as any).options as Array<{ value: string; label: string }>)
      : [];
    return (
      <div data-section="select-options">
        <p className="text-xs text-zinc-400 mb-1">选项列表 ({options.length} 条)</p>
        <button
          className="text-xs text-blue-400 underline"
          onClick={() => {
            onChange({ options: [...options, { value: '', label: '' }] });
          }}
        >
          + 添加选项
        </button>
      </div>
    );
  },
};

/** Lookup map: widget.type → WidgetPropertySchema */
// SP-FX-48.7: Batch 5 — FUXA parity (panel/video/scheduler)
export const panelSchema: WidgetPropertySchema = {
  entries: [
    { key: 'title', label: '标题', type: 'text', placeholder: '可留空' },
    // SP-FX-48.10: viewName placeholder for future embedded-view feature
    // (Currently informational only — full sub-view embed deferred per R11 boundary review.)
    { key: 'viewName', label: '嵌入视图 (预留)', type: 'text', placeholder: '视图 ID' },
    { key: 'bgColor', label: '背景色', type: 'color', allowNone: true },
    { key: 'borderColor', label: '边框色', type: 'color', allowNone: true },
    { key: 'borderWidth', label: '边框宽度', type: 'number', min: 0, max: 10, step: 1 },
    { key: 'titleColor', label: '标题颜色', type: 'color', allowNone: true },
    ...GEOMETRY_ENTRIES,
  ],
};

export const WIDGET_SCHEMAS: Record<string, WidgetPropertySchema> = {
  // SP-FX-48.5: basic shapes (geometry + style only)
  'rect': rectSchema,
  'ellipse': ellipseSchema,
  'text': textSchema,
  'line': lineSchema,
  // SP-FX-48.7: FUXA parity batch 5
  'svg-ext-panel': panelSchema,
  'svg-ext-value': valueSchema,
  'svg-ext-html_button': htmlButtonSchema,
  'svg-ext-html_input': htmlInputSchema,
  'svg-ext-gauge_semaphore': gaugeSemaphoreSchema,
  'svg-ext-gauge_progress': gaugeProgressSchema,
  'svg-ext-html_switch': htmlSwitchSchema,
  'svg-ext-html_slider': sliderSchema,
  'svg-ext-pipe': pipeSchema,
  // SP-FX-9 batch 3
  'svg-ext-html_bag': htmlBagSchema,
  'svg-ext-html_graph': htmlGraphSchema,
  'svg-ext-tank': tankSchema,
  'svg-ext-motor': motorSchema,
  'svg-ext-html_img': htmlImageSchema,
  // SP-FX-10 batch 4
  'svg-ext-compressor': compressorSchema,
  'svg-ext-valve': valveSchema,
  'svg-ext-pump': pumpSchema,
  'svg-ext-html_select': htmlSelectSchema,
};
