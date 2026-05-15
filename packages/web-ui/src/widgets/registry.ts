import React from 'react';
import { Tank } from './Tank';
import { Valve } from './Valve';
import { Pump } from './Pump';
import { Indicator } from './Indicator';
import { Trend } from './Trend';
import { Label } from './Label';
import { Button } from './Button';
import { Lamp } from './Lamp';

export interface WidgetEntry<P> {
  component: React.ComponentType<P & { width: number; height: number }>;
  defaultProps: () => P;
  displayName: string;
}

export const WIDGET_REGISTRY = {
  tank: {
    component: Tank,
    defaultProps: () => ({ fillPct: 50, max: 100, color: '#3b82f6' }),
    displayName: '罐体',
  },
  valve: {
    component: Valve,
    defaultProps: () => ({ open: false, colorOpen: '#22c55e', colorClosed: '#9ca3af' }),
    displayName: '阀门',
  },
  pump: {
    component: Pump,
    defaultProps: () => ({ running: false, rate: 0, unit: 'rpm' }),
    displayName: '泵',
  },
  indicator: {
    component: Indicator,
    defaultProps: () => ({ value: null as number | string | null, unit: '', precision: 1 }),
    displayName: '数字表',
  },
  trend: {
    component: Trend,
    defaultProps: () => ({ series: [] as Array<{ tag: string; label?: string; color?: string }>, windowSec: 60 }),
    displayName: '趋势图',
  },
  label: {
    component: Label,
    defaultProps: () => ({ text: '', fontSize: 14, align: 'left' as const }),
    displayName: '文本',
  },
  button: {
    component: Button,
    defaultProps: () => ({ text: 'Action', color: '#3b82f6' }),
    displayName: '按钮',
  },
  lamp: {
    component: Lamp,
    defaultProps: () => ({ on: false, colorOn: '#ef4444', colorOff: '#e5e7eb' }),
    displayName: '指示灯',
  },
} as const;

export type WidgetRegistry = typeof WIDGET_REGISTRY;
