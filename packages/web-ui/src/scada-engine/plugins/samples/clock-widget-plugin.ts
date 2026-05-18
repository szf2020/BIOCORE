// SP-FX-45: Sample plugin — Clock widget (显示当前时间, 1s 自动 update)
// 此文件仅做示例，不自动注册。使用方需手动调用 registerPlugin(clockWidgetPlugin).
import type { GaugeBase, GaugeContext, GaugePropChange, GaugeValue } from '../../gauges/gauge-base';
import type { FuxaWidget } from '../../models/widget';
import type { BiocorePlugin } from '../types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 默认时间格式 (HH:mm:ss) */
const DEFAULT_FORMAT = 'HH:mm:ss';

function formatTime(fmt: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return fmt
    .replace('HH', pad(now.getHours()))
    .replace('mm', pad(now.getMinutes()))
    .replace('ss', pad(now.getSeconds()));
}

/**
 * ClockGauge — 纯展示，每秒更新当前时间.
 * 不订阅任何 tag，不写入 PLC.
 */
class ClockGauge implements GaugeBase {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private textEl: SVGTextElement | null = null;
  private fmt: string = DEFAULT_FORMAT;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.fmt = (widget.property as Record<string, unknown>)?.['format'] as string ?? DEFAULT_FORMAT;

    // 创建 SVG text 元素
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String((widget.w ?? 100) / 2));
    text.setAttribute('y', String((widget.h ?? 40) / 2 + 6));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '14');
    text.setAttribute('fill', '#e4e4e7');
    text.textContent = formatTime(this.fmt);
    ctx.parentGroup.appendChild(text);
    this.textEl = text;

    // 每秒更新
    this.intervalId = setInterval(() => {
      if (this.textEl) {
        this.textEl.textContent = formatTime(this.fmt);
      }
    }, 1000);
  }

  onUnmount(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.textEl = null;
  }

  onProcess(_value: GaugeValue): void {
    // 时钟不订阅 tag，忽略
  }

  onPropertyChange(change: GaugePropChange): void {
    if (change.key === 'format') {
      this.fmt = (change.value as string) ?? DEFAULT_FORMAT;
      if (this.textEl) {
        this.textEl.textContent = formatTime(this.fmt);
      }
    }
  }

  onResize(w: number, h: number): void {
    if (this.textEl) {
      this.textEl.setAttribute('x', String(w / 2));
      this.textEl.setAttribute('y', String(h / 2 + 6));
    }
  }
}

/**
 * BIOCore 示例 Plugin — 时钟 Widget.
 *
 * 使用方式:
 * ```ts
 * import { clockWidgetPlugin } from 'scada-engine/plugins/samples/clock-widget-plugin';
 * import { registerPlugin } from 'scada-engine/plugins/loader';
 * registerPlugin(clockWidgetPlugin);
 * ```
 */
export const clockWidgetPlugin: BiocorePlugin = {
  id: 'com.biocore.sample.clock',
  name: '时钟示例 Widget',
  version: '1.0.0',
  widgets: [
    {
      widgetType: 'sample-clock',
      create: () => new ClockGauge(),
      getSignals: () => [],
    },
  ],
  propertySchemas: [
    {
      entries: [
        {
          key: 'format',
          label: '时间格式',
          type: 'text',
          placeholder: 'HH:mm:ss',
        },
      ],
    },
  ],
  dictionaries: {
    zh: { 'sample.clock': '时钟' },
    en: { 'sample.clock': 'Clock' },
  },
};
