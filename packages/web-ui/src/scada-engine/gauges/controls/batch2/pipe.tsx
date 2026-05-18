// SP-FX-6.2: PipeGauge — SVG pipe visualization with action-range color control.
// FUXA equivalent: svg-ext-pipe
// Animation (clockwise/anticlockwise) deferred to SP-FX-8.

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

interface PipeAction {
  variableId: string;
  range: { min: number; max: number };
  options?: { fillA?: string; fillB?: string };
  type: string;
}

interface PipeProperty {
  variableId?: string;
  options?: { pipe?: string; content?: string };
  actions?: PipeAction[];
}

const DEFAULT_PIPE_COLOR = '#E79180';

class PipeGauge implements GaugeBase {
  private bgRect: SVGRectElement | null = null;
  private pipeEl: SVGLineElement | null = null;
  private widget!: FuxaWidget;
  private defaultColor = DEFAULT_PIPE_COLOR;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 120;
    const h = (widget as any).h ?? 20;
    const prop = widget.property as PipeProperty;
    const pipeColor = prop.options?.pipe ?? DEFAULT_PIPE_COLOR;
    this.defaultColor = pipeColor;

    // Background rect
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(x));
    bg.setAttribute('y', String(y));
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', prop.options?.content ?? '#DADADA');
    bg.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(bg);
    this.bgRect = bg;

    // Pipe line visual
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(x));
    line.setAttribute('y1', String(y + h / 2));
    line.setAttribute('x2', String(x + w));
    line.setAttribute('y2', String(y + h / 2));
    line.setAttribute('stroke', pipeColor);
    line.setAttribute('stroke-width', String(Math.max(2, h * 0.4)));
    line.setAttribute('data-pipe', 'true');
    ctx.parentGroup.appendChild(line);
    this.pipeEl = line;
  }

  onUnmount(): void {
    this.bgRect?.remove();
    this.pipeEl?.remove();
    this.bgRect = null;
    this.pipeEl = null;
  }

  onProcess(value: GaugeValue): void {
    if (!this.pipeEl) return;
    if (value.isStale || value.value === null) {
      this.pipeEl.setAttribute('stroke', this.defaultColor);
      return;
    }
    const prop = this.widget.property as PipeProperty;
    const tagId = prop.variableId ?? '';
    let numVal = parseFloat(String(value.value));
    if (Number.isNaN(numVal)) numVal = 0;

    const matched = (prop.actions ?? []).find(
      (a) => a.variableId === tagId && a.range.min <= numVal && a.range.max >= numVal
    );
    this.pipeEl.setAttribute('stroke', matched?.options?.fillA ?? this.defaultColor);
  }

  onPropertyChange(change: GaugePropChange): void {
    this.widget = change.nextWidget;
    const prop = this.widget.property as PipeProperty;
    const pipeColor = prop.options?.pipe ?? DEFAULT_PIPE_COLOR;
    this.defaultColor = pipeColor;
    if (this.pipeEl) {
      this.pipeEl.setAttribute('stroke', pipeColor);
    }
    if (this.bgRect && prop.options?.content) {
      this.bgRect.setAttribute('fill', prop.options.content);
    }
  }

  onResize(w: number, h: number): void {
    if (!this.bgRect || !this.pipeEl) return;
    const x = (this.widget as any).x ?? 0;
    const y = (this.widget as any).y ?? 0;
    this.bgRect.setAttribute('width', String(w));
    this.bgRect.setAttribute('height', String(h));
    this.pipeEl.setAttribute('x2', String(x + w));
    this.pipeEl.setAttribute('y1', String(y + h / 2));
    this.pipeEl.setAttribute('y2', String(y + h / 2));
    this.pipeEl.setAttribute('stroke-width', String(Math.max(2, h * 0.4)));
  }
}

export const pipeMeta: GaugeMeta = {
  widgetType: 'svg-ext-pipe',
  create: () => new PipeGauge(),
  getSignals: (w) => {
    const p = w.property as PipeProperty;
    const ids: string[] = [];
    if (p?.variableId) ids.push(p.variableId);
    if (p?.actions) {
      p.actions.forEach(a => { if (a.variableId) ids.push(a.variableId); });
    }
    return [...new Set(ids)];
  },
};
