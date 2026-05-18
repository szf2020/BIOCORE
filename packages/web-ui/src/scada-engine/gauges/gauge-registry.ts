import type { GaugeMeta, GaugeBase } from './gauge-base';
import type { FuxaWidget } from '../models';

export class GaugeRegistry {
  private map = new Map<string, GaugeMeta>();

  register(meta: GaugeMeta): void {
    if (this.map.has(meta.widgetType)) {
      throw new Error(`gauge already registered for type '${meta.widgetType}'`);
    }
    this.map.set(meta.widgetType, meta);
  }

  create(widget: FuxaWidget): GaugeBase | null {
    const meta = this.map.get(widget.type);
    return meta ? meta.create() : null;
  }

  getSignals(widget: FuxaWidget): string[] {
    const meta = this.map.get(widget.type);
    return meta ? meta.getSignals(widget) : [];
  }

  has(widgetType: string): boolean {
    return this.map.has(widgetType);
  }

  get size(): number {
    return this.map.size;
  }
}

export const gaugeRegistry = new GaugeRegistry();
