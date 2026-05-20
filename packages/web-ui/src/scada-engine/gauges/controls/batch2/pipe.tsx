// SP-FX-6.2: PipeGauge — SVG pipe visualization with action-range color control.
// FUXA equivalent: svg-ext-pipe
// Animation (clockwise/anticlockwise) deferred to SP-FX-8.
// SP-FX-48.21 (phase 3): bitmask per action, 'hidecontent' action type,
// 'image' action type (SVG <image> overlay).

import type { GaugeBase, GaugeContext, GaugeMeta, GaugePropChange, GaugeValue } from '../../gauge-base';
import type { FuxaWidget } from '../../../models';

type PipeActionType = 'fillpipe' | 'hidecontent' | 'blink' | 'image';

interface PipeAction {
  variableId: string;
  range: { min: number; max: number };
  // SP-FX-48.21: optional bitmask — applies `numVal & bitmask` before range check
  bitmask?: number;
  options?: { fillA?: string; fillB?: string; image?: string; period?: number };
  type: PipeActionType | string;
}

interface PipeProperty {
  variableId?: string;
  // SP-FX-48.9: flat keys mirror nested options for schema-driven PropertyPanel
  flowDirection?: 'cw' | 'ccw' | 'none';
  flowSpeed?: number;
  pipeColor?: string;
  contentColor?: string;
  options?: {
    pipe?: string;
    content?: string;
    flowDirection?: 'cw' | 'ccw' | 'none';
    flowSpeed?: number;
  };
  actions?: PipeAction[];
}

const DEFAULT_PIPE_COLOR = '#E79180';

class PipeGauge implements GaugeBase {
  private bgRect: SVGRectElement | null = null;
  private pipeEl: SVGLineElement | null = null;
  private imageEl: SVGImageElement | null = null;
  private widget!: FuxaWidget;
  private defaultColor = DEFAULT_PIPE_COLOR;
  private flowInterval: ReturnType<typeof setInterval> | null = null;
  private blinkInterval: ReturnType<typeof setInterval> | null = null;
  private dashOffset = 0;
  private ctxMode: 'editor' | 'runtime' = 'editor';
  private parentGroup: SVGGElement | null = null;

  onMount(widget: FuxaWidget, ctx: GaugeContext): void {
    this.widget = widget;
    const x = (widget as any).x ?? 0;
    const y = (widget as any).y ?? 0;
    const w = (widget as any).w ?? 120;
    const h = (widget as any).h ?? 20;
    const prop = widget.property as PipeProperty;
    const pipeColor = (prop.pipeColor ?? prop.options?.pipe ?? DEFAULT_PIPE_COLOR);
    this.defaultColor = pipeColor;

    // Background rect
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', String(x));
    bg.setAttribute('y', String(y));
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', prop.contentColor ?? prop.options?.content ?? '#DADADA');
    bg.setAttribute('data-widget-id', widget.id);
    ctx.parentGroup.appendChild(bg);
    this.bgRect = bg;

    // SP-FX-FF.33: orientation auto-detected by aspect ratio — taller than
    // wide → vertical pipe; otherwise horizontal. Lets users stretch the
    // bbox along Y to get a vertical pipe segment.
    const isVertical = h > w;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    if (isVertical) {
      const midX = x + w / 2;
      line.setAttribute('x1', String(midX));
      line.setAttribute('y1', String(y));
      line.setAttribute('x2', String(midX));
      line.setAttribute('y2', String(y + h));
    } else {
      const midY = y + h / 2;
      line.setAttribute('x1', String(x));
      line.setAttribute('y1', String(midY));
      line.setAttribute('x2', String(x + w));
      line.setAttribute('y2', String(midY));
    }
    line.setAttribute('stroke', pipeColor);
    line.setAttribute('stroke-width', String(Math.max(2, Math.min(w, h) * 0.4)));
    line.setAttribute('data-pipe', 'true');
    line.setAttribute('data-pipe-orientation', isVertical ? 'vertical' : 'horizontal');
    ctx.parentGroup.appendChild(line);
    this.pipeEl = line;

    this.ctxMode = ctx.mode;
    this.parentGroup = ctx.parentGroup;
    this.startFlowAnimation(w);
  }

  private startFlowAnimation(w: number): void {
    const prop = this.widget.property as PipeProperty;
    // SP-FX-FF.30: animation runs in editor + runtime so designers see the
    // FUXA-style flow preview without binding a tag. Default direction is
    // 'cw' (forward) when prop unset so new pipes animate out of the box.
    const dir = prop.flowDirection ?? prop.options?.flowDirection ?? 'cw';
    if (!dir || dir === 'none') return;

    const speed = prop.flowSpeed ?? prop.options?.flowSpeed ?? 2;
    // SP-FX-FF.31: short fixed-length dashes look like discrete fluid packets
    // flowing along the pipe. Previous formula (w * 0.4) yielded ~480px dashes
    // on wide pipes — read as static stripes, not flow.
    const dashLen = 20;
    const gapLen = 16;
    this.dashOffset = 0;
    this.pipeEl?.setAttribute('stroke-dasharray', `${dashLen} ${gapLen}`);
    this.pipeEl?.setAttribute('stroke-dashoffset', '0');

    this.flowInterval = setInterval(() => {
      if (!this.pipeEl) return;
      this.dashOffset = dir === 'cw'
        ? this.dashOffset - speed
        : this.dashOffset + speed;
      this.pipeEl.setAttribute('stroke-dashoffset', String(this.dashOffset));
    }, 16);
  }

  private stopFlowAnimation(): void {
    if (this.flowInterval !== null) {
      clearInterval(this.flowInterval);
      this.flowInterval = null;
    }
  }

  onUnmount(): void {
    this.stopFlowAnimation();
    this.stopBlink();
    this.bgRect?.remove();
    this.pipeEl?.remove();
    this.imageEl?.remove();
    this.bgRect = null;
    this.pipeEl = null;
    this.imageEl = null;
    this.parentGroup = null;
  }

  private stopBlink(): void {
    if (this.blinkInterval !== null) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
      if (this.pipeEl) (this.pipeEl as unknown as HTMLElement).style.visibility = '';
    }
  }

  // SP-FX-48.21: check if a numeric value falls inside an action range, applying
  // optional bitmask first (FUXA convention: `(value & bitmask) match range`).
  private actionMatches(numVal: number, action: PipeAction): boolean {
    let v = numVal;
    if (typeof action.bitmask === 'number' && action.bitmask > 0) {
      v = (v | 0) & action.bitmask;
    }
    return v >= action.range.min && v <= action.range.max;
  }

  onProcess(value: GaugeValue): void {
    if (!this.pipeEl) return;
    this.stopBlink();
    if (this.imageEl) this.imageEl.setAttribute('visibility', 'hidden');
    if (this.bgRect) this.bgRect.setAttribute('visibility', 'visible');

    if (value.isStale || value.value === null) {
      this.pipeEl.setAttribute('stroke', this.defaultColor);
      return;
    }
    const prop = this.widget.property as PipeProperty;
    const tagId = prop.variableId ?? '';
    let numVal = parseFloat(String(value.value));
    if (Number.isNaN(numVal)) numVal = 0;

    // SP-FX-48.21: evaluate all matching actions (multiple may apply per tick).
    // Use first matching fillpipe / hidecontent / image action of each type.
    let appliedColor = false;
    for (const action of (prop.actions ?? [])) {
      if (action.variableId !== tagId) continue;
      if (!this.actionMatches(numVal, action)) continue;
      const type = (action.type ?? 'fillpipe').toLowerCase();
      // SP-FX-48.21: clockwise/anticlockwise are FUXA's flow-direction
      // actions; they also tint the pipe via fillA when matched. Treat them
      // as fillpipe for the color step.
      if ((type === 'fillpipe' || type === 'fill' || type === 'clockwise' || type === 'anticlockwise') && !appliedColor) {
        this.pipeEl.setAttribute('stroke', action.options?.fillA ?? this.defaultColor);
        appliedColor = true;
      } else if (type === 'hidecontent') {
        if (this.bgRect) this.bgRect.setAttribute('visibility', 'hidden');
      } else if (type === 'image' && action.options?.image) {
        this.ensureImageOverlay(action.options.image);
      } else if (type === 'blink') {
        this.startBlink(action.options?.period ?? 500);
      }
    }
    if (!appliedColor) {
      this.pipeEl.setAttribute('stroke', this.defaultColor);
    }
  }

  private startBlink(period: number): void {
    if (!this.pipeEl || this.blinkInterval !== null) return;
    const p = Math.max(100, period);
    let on = true;
    this.blinkInterval = setInterval(() => {
      if (!this.pipeEl) return;
      on = !on;
      (this.pipeEl as unknown as HTMLElement).style.visibility = on ? '' : 'hidden';
    }, p);
  }

  private ensureImageOverlay(href: string): void {
    if (!this.parentGroup) return;
    if (!this.imageEl) {
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      const x = (this.widget as any).x ?? 0;
      const y = (this.widget as any).y ?? 0;
      const w = (this.widget as any).w ?? 120;
      const h = (this.widget as any).h ?? 20;
      img.setAttribute('x', String(x));
      img.setAttribute('y', String(y));
      img.setAttribute('width', String(w));
      img.setAttribute('height', String(h));
      img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      img.setAttribute('data-pipe-image', 'true');
      this.parentGroup.appendChild(img);
      this.imageEl = img;
    }
    // SP-FX-48.21: only allow http(s):// or data: URIs to prevent javascript:
    // schemes leaking through user widget config.
    if (/^(https?:\/\/|data:image\/|\/)/i.test(href)) {
      this.imageEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
      this.imageEl.setAttribute('href', href);
      this.imageEl.setAttribute('visibility', 'visible');
    } else {
      this.imageEl.setAttribute('visibility', 'hidden');
    }
  }

  onPropertyChange(change: GaugePropChange): void {
    this.stopFlowAnimation();
    this.widget = change.nextWidget;
    const prop = this.widget.property as PipeProperty;
    const pipeColor = (prop.pipeColor ?? prop.options?.pipe ?? DEFAULT_PIPE_COLOR);
    this.defaultColor = pipeColor;
    if (this.pipeEl) {
      this.pipeEl.setAttribute('stroke', pipeColor);
    }
    if (this.bgRect && (prop.contentColor || prop.options?.content)) {
      this.bgRect.setAttribute('fill', prop.contentColor ?? prop.options!.content!);
    }
    // Restart animation with potentially new flowDirection/flowSpeed
    const w = (this.widget as any).w ?? 120;
    if (this.pipeEl) {
      // SP-FX-FF.30: same default ('cw') so animation persists across prop changes.
      const dir = prop.flowDirection ?? prop.options?.flowDirection ?? 'cw';
      if (!dir || dir === 'none') {
        this.pipeEl.removeAttribute('stroke-dasharray');
        this.pipeEl.removeAttribute('stroke-dashoffset');
      } else {
        this.startFlowAnimation(w);
      }
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
