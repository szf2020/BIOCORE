import type { FuxaWidget } from '../models';

export interface GaugeValue {
  value: number | string | boolean | null;
  isStale: boolean;
}

export interface GaugeContext {
  parentGroup: SVGGElement;
  readValue: (tagId: string) => GaugeValue;
  canvasSize: { width: number; height: number };
  mode: 'editor' | 'runtime';
  onWriteIntent?: (intent: { tag: string; value: unknown; widgetId: string }) => void;
}

export interface GaugePropChange {
  key: string;
  value: unknown;
  nextWidget: FuxaWidget;
}

export interface GaugeClickContext {
  widget: FuxaWidget;
  ctx: GaugeContext;
}

export interface GaugeBase {
  onMount(widget: FuxaWidget, ctx: GaugeContext): void;
  onUnmount(): void;
  onProcess(value: GaugeValue): void;
  onPropertyChange(change: GaugePropChange): void;
  onResize(w: number, h: number): void;
  onClick?(event: MouseEvent, ctx: GaugeClickContext): void;
}

export type GetSignalsFn = (widget: FuxaWidget) => string[];

export interface GaugeMeta {
  widgetType: string;
  create: () => GaugeBase;
  getSignals: GetSignalsFn;
  /** semver-like 版本号, 默认 '1.0.0' */
  version?: string;
}

export interface GaugeReplaceEvent {
  widgetType: string;
  oldMeta: GaugeMeta;
  newMeta: GaugeMeta;
  timestamp: number;
}
