import { EventEmitter } from 'events';
import type { GaugeMeta, GaugeBase, GaugeReplaceEvent } from './gauge-base';
import type { FuxaWidget } from '../models';

const DEFAULT_VERSION = '1.0.0';

export class GaugeRegistry {
  private map = new Map<string, GaugeMeta>();
  private emitter = new EventEmitter();

  register(meta: GaugeMeta, opts?: { replace?: boolean }): void {
    if (this.map.has(meta.widgetType)) {
      if (!opts?.replace) {
        throw new Error(`gauge already registered for type '${meta.widgetType}'`);
      }
      const oldMeta = this.map.get(meta.widgetType)!;
      this.map.set(meta.widgetType, meta);
      const event: GaugeReplaceEvent = {
        widgetType: meta.widgetType,
        oldMeta,
        newMeta: meta,
        timestamp: Date.now(),
      };
      this.emitter.emit('replaced', event);
      return;
    }
    this.map.set(meta.widgetType, meta);
  }

  getVersion(widgetType: string): string | undefined {
    const meta = this.map.get(widgetType);
    if (!meta) return undefined;
    return meta.version ?? DEFAULT_VERSION;
  }

  onReplace(callback: (event: GaugeReplaceEvent) => void): () => void {
    this.emitter.on('replaced', callback);
    return () => { this.emitter.off('replaced', callback); };
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
