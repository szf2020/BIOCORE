// SP-FX-48.7: HtmlSchedulerGauge — weekly time-slot calendar grid.
// FUXA equivalent: html-scheduler
// Property: schedules (Array<{day:0-6, startHour:0-23, endHour:1-24, label?:string}>).
// Renders as 7-day × 24-hour grid with highlighted blocks per entry.
// Note: BIOCore-internal widget — does NOT auto-write to PLC. Operators set
// schedules via the editor; runtime can subscribe via separate scheduler service.

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface ScheduleEntry {
  day: number;
  startHour: number;
  endHour: number;
  label?: string;
}

interface SchedulerProperty {
  schedules?: ScheduleEntry[];
  blockColor?: string;
  gridColor?: string;
  labelColor?: string;
}

const DAY_LABELS_ZH = ['日', '一', '二', '三', '四', '五', '六'];

function clampSchedule(s: ScheduleEntry): ScheduleEntry | null {
  if (!Number.isFinite(s.day) || s.day < 0 || s.day > 6) return null;
  if (!Number.isFinite(s.startHour) || !Number.isFinite(s.endHour)) return null;
  const startHour = Math.max(0, Math.min(24, Math.floor(s.startHour)));
  const endHour = Math.max(0, Math.min(24, Math.floor(s.endHour)));
  if (endHour <= startHour) return null;
  return { day: Math.floor(s.day), startHour, endHour, label: s.label };
}

class HtmlSchedulerGauge implements GaugeBase {
  private rootEl: SVGGElement | null = null;
  private widget!: FuxaWidget;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    root.setAttribute('data-widget-id', widget.id);
    this.rootEl = root;
    ctx.parentGroup.appendChild(root);
    this.render();
  }

  private render(): void {
    if (!this.rootEl) return;
    const widget = this.widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 480;
    const h = (widget as any).h ?? 200;
    const prop = (widget.property ?? {}) as SchedulerProperty;
    const blockColor = prop.blockColor ?? '#3b82f6';
    const gridColor = prop.gridColor ?? '#e5e7eb';
    const labelColor = prop.labelColor ?? '#475569';

    while (this.rootEl.firstChild) this.rootEl.removeChild(this.rootEl.firstChild);

    const labelW = 36;
    const labelH = 18;
    const gridX = x + labelW;
    const gridY = y + labelH;
    const gridW = Math.max(0, w - labelW);
    const gridH = Math.max(0, h - labelH);
    const colW = gridW / 24;
    const rowH = gridH / 7;

    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(x));
    bg.setAttribute('y', String(y));
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', '#ffffff');
    bg.setAttribute('stroke', gridColor);
    bg.setAttribute('stroke-width', '1');
    this.rootEl.appendChild(bg);

    for (let d = 0; d < 7; d++) {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', String(x + labelW / 2));
      t.setAttribute('y', String(gridY + d * rowH + rowH / 2 + 4));
      t.setAttribute('fill', labelColor);
      t.setAttribute('font-size', '11');
      t.setAttribute('text-anchor', 'middle');
      t.textContent = DAY_LABELS_ZH[d];
      this.rootEl.appendChild(t);
    }

    for (const hr of [0, 6, 12, 18]) {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', String(gridX + hr * colW + 2));
      t.setAttribute('y', String(y + 13));
      t.setAttribute('fill', labelColor);
      t.setAttribute('font-size', '10');
      t.textContent = String(hr).padStart(2, '0');
      this.rootEl.appendChild(t);
    }

    for (let hr = 0; hr <= 24; hr += 3) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(gridX + hr * colW));
      line.setAttribute('y1', String(gridY));
      line.setAttribute('x2', String(gridX + hr * colW));
      line.setAttribute('y2', String(gridY + gridH));
      line.setAttribute('stroke', gridColor);
      line.setAttribute('stroke-width', '0.5');
      this.rootEl.appendChild(line);
    }
    for (let d = 0; d <= 7; d++) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(gridX));
      line.setAttribute('y1', String(gridY + d * rowH));
      line.setAttribute('x2', String(gridX + gridW));
      line.setAttribute('y2', String(gridY + d * rowH));
      line.setAttribute('stroke', gridColor);
      line.setAttribute('stroke-width', '0.5');
      this.rootEl.appendChild(line);
    }

    const list = Array.isArray(prop.schedules) ? prop.schedules : [];
    for (const raw of list) {
      const s = clampSchedule(raw);
      if (!s) continue;
      const bx = gridX + s.startHour * colW;
      const by = gridY + s.day * rowH;
      const bw = (s.endHour - s.startHour) * colW;
      const bh = rowH;
      const blk = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      blk.setAttribute('x', String(bx));
      blk.setAttribute('y', String(by + 1));
      blk.setAttribute('width', String(bw));
      blk.setAttribute('height', String(Math.max(0, bh - 2)));
      blk.setAttribute('fill', blockColor);
      blk.setAttribute('fill-opacity', '0.7');
      blk.setAttribute('data-schedule-block', 'true');
      this.rootEl.appendChild(blk);
      if (s.label && bw > 32) {
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', String(bx + 4));
        t.setAttribute('y', String(by + rowH / 2 + 3));
        t.setAttribute('fill', '#ffffff');
        t.setAttribute('font-size', '10');
        t.textContent = s.label;
        this.rootEl.appendChild(t);
      }
    }
  }

  onUnmount(): void {
    this.rootEl?.remove();
    this.rootEl = null;
  }

  onProcess(_value: GaugeValue): void {
    // No-op: no live tag value
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    this.render();
  }

  onResize(_w: number, _h: number): void {
    this.render();
  }
}

export const htmlSchedulerMeta: GaugeMeta = {
  widgetType: 'svg-ext-html_scheduler',
  create: () => new HtmlSchedulerGauge(),
  getSignals: (_w) => [],
};
