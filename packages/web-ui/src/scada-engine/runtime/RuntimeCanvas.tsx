'use client';
// SP-FX-7 T3: Read-only runtime canvas.
// 3 effects: A=mount gauges + bind realtime, B=click delegation, C=rAF animation tick.
import React, { useRef, useState, useEffect } from 'react';
import type { JSX } from 'react';
import { CanvasController } from '../editor/canvas-svg';
import { gaugeRegistry } from '../gauges/gauge-registry';
import { bindGaugesToRealtime } from '../services/tag-binding-bridge';
import { resolveAnimations, evalAnimations } from '../services/animation-engine';
import type { AnimationPatch } from '../services/animation-engine';
import { readTagSnapshot } from '../services/tag-binding';
import { useRealtimeStore } from '@/stores/realtime-store';
import { WriteIntentDialog } from '@/components/scada/runtime/WriteIntentDialog';
import type { FuxaView, FuxaWidget } from '../models';
import type { GaugeBase, GaugeContext } from '../gauges/gauge-base';

import '../gauges/controls/index';

export interface RuntimeCanvasProps {
  view: FuxaView;
  viewId: string;
  reactorId: string;
}

export function RuntimeCanvas({ view, viewId, reactorId }: RuntimeCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<CanvasController | null>(null);
  const gaugeMapRef = useRef<Map<string, GaugeBase>>(new Map());
  const [dialogWidget, setDialogWidget] = useState<FuxaWidget | null>(null);

  // Effect A: mount gauges + bind realtime subscription
  useEffect(() => {
    if (!containerRef.current) return;

    const canvas = new CanvasController(containerRef.current, {
      width: view.width,
      height: view.height,
    });
    canvas.loadView(view);
    canvasRef.current = canvas;

    const widgetSignals = new Map<string, string[]>();
    const gaugeMap = new Map<string, GaugeBase>();

    for (const [id, widget] of Object.entries(view.items)) {
      const gauge = gaugeRegistry.create(widget as FuxaWidget);
      if (!gauge) continue;

      const ctx: GaugeContext = {
        parentGroup: canvas.widgetLayer.node as SVGGElement,
        readValue: readTagSnapshot,
        canvasSize: { width: view.width, height: view.height },
        mode: 'runtime',
        onWriteIntent: (intent: { tag: string; value: unknown; widgetId: string }) => {
          const w = (view.items as Record<string, FuxaWidget>)[intent.widgetId] ?? null;
          setDialogWidget(w);
        },
      };
      gauge.onMount(widget as FuxaWidget, ctx);
      gaugeMap.set(id, gauge);
      widgetSignals.set(id, gaugeRegistry.getSignals(widget as FuxaWidget));
    }

    gaugeMapRef.current = gaugeMap;
    const unbind = bindGaugesToRealtime(reactorId, gaugeMap, widgetSignals);

    return () => {
      unbind();
      for (const [, g] of gaugeMapRef.current) g.onUnmount();
      gaugeMapRef.current.clear();
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id, reactorId]);

  // Effect B: SVG click delegation
  useEffect(() => {
    const svgRoot = canvasRef.current?.root?.node as SVGSVGElement | null | undefined;
    if (!svgRoot) return;
    const handleClick = (e: Event) => {
      const target = e.target as Element | null;
      const widgetEl = target?.closest('[data-widget-id]');
      if (!widgetEl) return;
      const widgetId = widgetEl.getAttribute('data-widget-id');
      if (!widgetId) return;
      const gauge = gaugeMapRef.current.get(widgetId);
      const widget = (view.items as Record<string, FuxaWidget>)[widgetId];
      if (!gauge || !widget) return;
      gauge.onClick?.(e as MouseEvent, {
        widget,
        ctx: { mode: 'runtime' } as GaugeContext,
      });
    };
    svgRoot.addEventListener('click', handleClick);
    return () => svgRoot.removeEventListener('click', handleClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id]);

  // Effect C: rAF animation tick
  useEffect(() => {
    let rafId = 0;
    const resolved = resolveAnimations(view.items as Record<string, FuxaWidget>);
    const tick = () => {
      const state = (useRealtimeStore as any).getState();
      const pv: Record<string, unknown> =
        state?.reactorData?.[reactorId]?.processValues ?? {};
      const patches = evalAnimations(resolved, pv);
      for (const p of patches) {
        const el = canvasRef.current?.root?.node?.querySelector(
          `[data-widget-id="${p.widgetId}"]`,
        );
        if (el) applyPatch(el as Element, p);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id, reactorId]);

  return (
    <>
      <div
        ref={containerRef}
        data-runtime-canvas-host
        className="w-full h-full overflow-auto bg-white"
      />
      {dialogWidget ? (
        <WriteIntentDialog
          widget={dialogWidget as any}
          viewId={viewId}
          onClose={() => setDialogWidget(null)}
        />
      ) : null}
    </>
  );
}

function applyPatch(el: Element, p: AnimationPatch): void {
  const htmlEl = el as HTMLElement;
  switch (p.target) {
    case 'color':
      htmlEl.style.fill = String(p.value);
      break;
    case 'visibility':
      htmlEl.style.display = p.value ? '' : 'none';
      break;
    case 'opacity':
      htmlEl.style.opacity = String(p.value);
      break;
    case 'rotate':
      el.setAttribute('transform', `rotate(${p.value})`);
      break;
    case 'scale':
      el.setAttribute('transform', `scale(${p.value})`);
      break;
    case 'move':
      el.setAttribute('transform', `translate(${p.value})`);
      break;
    case 'text':
      el.textContent = String(p.value);
      break;
    default:
      break;
  }
}
