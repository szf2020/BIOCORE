export type WidgetTypeKey = 'tank' | 'valve' | 'pump' | 'indicator' | 'trend' | 'label' | 'button' | 'lamp';

export interface Binding {
  tag: string;
  prop: string;
  transform?: string;
}

export interface BaseWidgetDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  bindings?: Binding[];
}

export interface TankDef extends BaseWidgetDef {
  type: 'tank';
  props: {
    fillPct?: number;
    max?: number;
    unit?: string;
    label?: string;
    color?: string;
  };
}

export interface ValveDef extends BaseWidgetDef {
  type: 'valve';
  props: {
    open?: boolean | number;
    label?: string;
    colorOpen?: string;
    colorClosed?: string;
  };
}

export interface PumpDef extends BaseWidgetDef {
  type: 'pump';
  props: {
    running?: boolean;
    rate?: number;
    unit?: string;
    label?: string;
  };
}

export interface IndicatorDef extends BaseWidgetDef {
  type: 'indicator';
  props: {
    value?: number | string | null;
    unit?: string;
    label?: string;
    precision?: number;
    color?: string;
  };
}

export interface TrendDef extends BaseWidgetDef {
  type: 'trend';
  props: {
    series: Array<{ tag: string; label?: string; color?: string }>;
    windowSec?: number;
    staleMs?: number;
    yMin?: number;
    yMax?: number;
  };
}

export interface LabelDef extends BaseWidgetDef {
  type: 'label';
  props: {
    text?: string;
    fontSize?: number;
    color?: string;
    bold?: boolean;
    align?: 'left' | 'center' | 'right';
  };
}

export interface ButtonDef extends BaseWidgetDef {
  type: 'button';
  props: {
    text?: string;
    action?: string;
    payload?: Record<string, any>;
    color?: string;
  };
}

export interface LampDef extends BaseWidgetDef {
  type: 'lamp';
  props: {
    on?: boolean;
    blink?: boolean;
    colorOn?: string;
    colorOff?: string;
    label?: string;
  };
}

export type WidgetDef =
  | TankDef | ValveDef | PumpDef | IndicatorDef
  | TrendDef | LabelDef | ButtonDef | LampDef;

export type ItemsJson = Record<string, WidgetDef>;
