import React from 'react';
import { Tank } from './Tank';
import { Valve } from './Valve';
import { Pump } from './Pump';
import { Indicator } from './Indicator';
import { Trend } from './Trend';
import { Label } from './Label';
import { Button } from './Button';
import { Lamp } from './Lamp';

export interface PropSchema {
  type: 'number' | 'string' | 'boolean' | 'color' | 'select' | 'textarea';
  label: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
}

export interface WidgetEntry<P> {
  component: React.ComponentType<P & { width: number; height: number }>;
  defaultProps: () => P;
  displayName: string;
  propsSchema: Record<string, PropSchema>;
  bindableProps: string[];
  /** Discriminator: 'react' = legacy DOM widget renderer (default); 'svg' = SVG runtime (sub-project 1/8 onward). */
  kind?: 'svg' | 'react';
}

export const WIDGET_REGISTRY = {
  tank: {
    component: Tank,
    defaultProps: () => ({ fillPct: 50, max: 100, color: '#3b82f6' }),
    displayName: '罐体',
    propsSchema: {
      fillPct: { type: 'number', label: '液位 %', min: 0, max: 100 },
      max:     { type: 'number', label: 'Max', min: 1 },
      unit:    { type: 'string', label: '单位' },
      label:   { type: 'string', label: '标签' },
      color:   { type: 'color',  label: '颜色' },
    },
    bindableProps: ['fillPct', 'max'],
  },
  valve: {
    component: Valve,
    defaultProps: () => ({ open: false, colorOpen: '#22c55e', colorClosed: '#9ca3af' }),
    displayName: '阀门',
    propsSchema: {
      open:         { type: 'boolean', label: '开 (true=开)' },
      label:        { type: 'string',  label: '标签' },
      colorOpen:    { type: 'color',   label: '开色' },
      colorClosed:  { type: 'color',   label: '关色' },
    },
    bindableProps: ['open'],
  },
  pump: {
    component: Pump,
    defaultProps: () => ({ running: false, rate: 0, unit: 'rpm' }),
    displayName: '泵',
    propsSchema: {
      running: { type: 'boolean', label: '运行' },
      rate:    { type: 'number',  label: '速率' },
      unit:    { type: 'string',  label: '单位' },
      label:   { type: 'string',  label: '标签' },
    },
    bindableProps: ['running', 'rate'],
  },
  indicator: {
    component: Indicator,
    defaultProps: () => ({ value: null as number | string | null, unit: '', precision: 1 }),
    displayName: '数字表',
    propsSchema: {
      value:     { type: 'string', label: '当前值 (绑定后由 tag 注入)' },
      unit:      { type: 'string', label: '单位' },
      precision: { type: 'number', label: '小数位', min: 0, max: 6, step: 1 },
      label:     { type: 'string', label: '标签' },
      color:     { type: 'color',  label: '颜色' },
    },
    bindableProps: ['value'],
  },
  trend: {
    component: Trend,
    defaultProps: () => ({ series: [] as Array<{ tag: string; label?: string; color?: string }>, windowSec: 60 }),
    displayName: '趋势图',
    propsSchema: {
      windowSec: { type: 'number', label: '窗口秒', min: 10, max: 3600 },
      yMin:      { type: 'number', label: 'Y 最小' },
      yMax:      { type: 'number', label: 'Y 最大' },
      staleMs:   { type: 'number', label: '失效毫秒', min: 1000 },
    },
    bindableProps: [],
  },
  label: {
    component: Label,
    defaultProps: () => ({ text: '', fontSize: 14, align: 'left' as const }),
    displayName: '文本',
    propsSchema: {
      text:     { type: 'string',  label: '文本' },
      fontSize: { type: 'number',  label: '字号', min: 8, max: 64 },
      bold:     { type: 'boolean', label: '加粗' },
      align:    { type: 'select',  label: '对齐', options: [
        { value: 'left',   label: '左' },
        { value: 'center', label: '中' },
        { value: 'right',  label: '右' },
      ]},
      color:    { type: 'color',   label: '颜色' },
    },
    bindableProps: [],
  },
  button: {
    component: Button,
    defaultProps: () => ({ text: 'Action', color: '#3b82f6' }),
    displayName: '按钮',
    propsSchema: {
      text:   { type: 'string',   label: '文本' },
      action: { type: 'string',   label: 'action 类型' },
      color:  { type: 'color',    label: '颜色' },
    },
    bindableProps: [],
  },
  lamp: {
    component: Lamp,
    defaultProps: () => ({ on: false, colorOn: '#ef4444', colorOff: '#e5e7eb' }),
    displayName: '指示灯',
    propsSchema: {
      on:       { type: 'boolean', label: '亮' },
      blink:    { type: 'boolean', label: '闪烁' },
      colorOn:  { type: 'color',   label: '亮色' },
      colorOff: { type: 'color',   label: '灭色' },
      label:    { type: 'string',  label: '标签' },
    },
    bindableProps: ['on'],
  },
} as const;

export type WidgetRegistry = typeof WIDGET_REGISTRY;
