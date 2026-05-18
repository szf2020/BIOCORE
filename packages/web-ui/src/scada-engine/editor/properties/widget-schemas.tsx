// SP-FX-6: per-widget-type property schemas. One per batch-1 widget type.

import React from 'react';
import type { WidgetPropertySchema } from './property-schema';

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
      { value: 'number', label: '数值' }, { value: 'text', label: '文本' },
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

export const htmlChartSchema: WidgetPropertySchema = {
  entries: [
    { key: 'title', label: '图表标题', type: 'text', placeholder: '趋势图' },
    { key: 'timeRangeSeconds', label: '时间范围 (秒)', type: 'number', min: 10, max: 3600, step: 10 },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
  renderCustomSection: (property, onChange) => {
    const variableIds = Array.isArray((property as any).variableIds)
      ? ((property as any).variableIds as string[])
      : [];
    return (
      <div data-section="chart-series">
        <p className="text-xs text-zinc-400 mb-1">Series Tags（逗号分隔）</p>
        <textarea
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs w-full resize-none"
          rows={3}
          value={variableIds.join(', ')}
          placeholder="reactor1.AI-0, reactor1.AI-1"
          onChange={(e) => {
            const ids = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
            onChange({ variableIds: ids });
          }}
        />
      </div>
    );
  },
};

export const htmlTableSchema: WidgetPropertySchema = {
  entries: [
    { key: 'title', label: '表格标题', type: 'text', placeholder: '数据表' },
    { key: 'x', label: 'X', type: 'number', geometric: true },
    { key: 'y', label: 'Y', type: 'number', geometric: true },
    { key: 'w', label: '宽', type: 'number', geometric: true, min: 0 },
    { key: 'h', label: '高', type: 'number', geometric: true, min: 0 },
  ],
  renderCustomSection: (property, onChange) => {
    const rows = Array.isArray((property as any)?.options?.rows)
      ? ((property as any).options.rows as any[])
      : [];
    return (
      <div data-section="table-columns">
        <p className="text-xs text-zinc-400 mb-1">行数：{rows.length}</p>
        <button
          className="text-xs text-blue-400 underline"
          onClick={() => {
            const newRow = { cells: [{ type: 'label', value: '' }, { type: 'variable', variableId: '' }] };
            onChange({ options: { ...((property as any).options ?? {}), rows: [...rows, newRow] } });
          }}
        >
          + 添加行
        </button>
      </div>
    );
  },
};

/** Lookup map: widget.type → WidgetPropertySchema */
export const WIDGET_SCHEMAS: Record<string, WidgetPropertySchema> = {
  'svg-ext-value': valueSchema,
  'svg-ext-html_button': htmlButtonSchema,
  'svg-ext-html_input': htmlInputSchema,
  'svg-ext-html_chart': htmlChartSchema,
  'svg-ext-own_ctrl-table': htmlTableSchema,
};
