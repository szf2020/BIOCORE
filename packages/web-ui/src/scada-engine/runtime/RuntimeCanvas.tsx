'use client';
// SP-FX-7 T3: Read-only runtime canvas.
// SP-FX-8 T1: Effect C (rAF) replaced by Effect D (subscribe-driven, fires only on processValues change).
// SP-FX-25: Effect F — PointerEvent pinch-to-zoom + pan (no 3rd party lib).
// Effects: A=mount gauges + bind realtime, B=click delegation, D=subscribe animation eval, F=touch gesture.
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

/** SP-FX-25: clamp helper */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** SP-FX-25: Euclidean distance between two pointer positions */
function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function RuntimeCanvas({ view, viewId, reactorId }: RuntimeCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<CanvasController | null>(null);
  const gaugeMapRef = useRef<Map<string, GaugeBase>>(new Map());
  const [dialogWidget, setDialogWidget] = useState<FuxaWidget | null>(null);

  // SP-FX-25: touch gesture state — scale [0.5, 3.0], pan offset (x, y)
  const [transform, setTransform] = useState({ scale: 1, panX: 0, panY: 0 });
  const gestureRef = useRef<HTMLDivElement | null>(null);
  // 活跃 pointer 记录 Map<pointerId, {x, y}>
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

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
      canvas.destroy();
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

  // Effect D: subscribe-driven animation eval — fires only when processValues changes (SP-FX-8 T1).
  // Replaces 60Hz rAF polling with Zustand store subscription, matching PLC tag update rate (~1Hz).
  useEffect(() => {
    const resolved = resolveAnimations(view.items as Record<string, FuxaWidget>);
    const unsubscribe = (useRealtimeStore as any).subscribe(
      (s: any) => s?.reactorData?.[reactorId]?.processValues,
      (pv: Record<string, unknown> | null | undefined) => {
        if (!pv || !canvasRef.current) return;
        const patches = evalAnimations(resolved, pv);
        for (const p of patches) {
          const el = canvasRef.current?.root?.node?.querySelector(
            `[data-widget-id="${p.widgetId}"]`,
          );
          if (el) applyPatch(el as Element, p);
        }
      },
    );
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id, reactorId]);

  // Effect F: SP-FX-25 — PointerEvent touch gesture (pinch-to-zoom + single-finger pan)
  // Only handles pointer events; does NOT interfere with Effect A/B/D (SVG/gauge/animation).
  useEffect(() => {
    const el = gestureRef.current;
    if (!el) return;

    const pointers = pointersRef.current;

    function onPointerDown(e: PointerEvent): void {
      el!.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    function onPointerMove(e: PointerEvent): void {
      if (!pointers.has(e.pointerId)) return;

      if (pointers.size === 2) {
        // Pinch-to-zoom: calc distance ratio between prev and current pointer positions
        const ids = [...pointers.keys()];
        const otherId = ids.find(id => id !== e.pointerId)!;
        const other = pointers.get(otherId)!;
        const prev = pointers.get(e.pointerId)!;
        const prevDist = pointerDistance(prev, other);
        const currPos = { x: e.clientX, y: e.clientY };
        const currDist = pointerDistance(currPos, other);
        if (prevDist > 0) {
          const ratio = currDist / prevDist;
          setTransform(t => ({ ...t, scale: clamp(t.scale * ratio, 0.5, 3.0) }));
        }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      } else if (pointers.size === 1) {
        // Single-finger pan
        const prev = pointers.get(e.pointerId)!;
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        setTransform(t => ({ ...t, panX: t.panX + dx, panY: t.panY + dy }));
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    }

    function onPointerUp(e: PointerEvent): void {
      pointers.delete(e.pointerId);
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      pointers.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id]);

  return (
    <>
      {/* SP-FX-25: gesture wrapper — overflow-hidden to clip panned/zoomed canvas */}
      <div
        data-testid="runtime-gesture-wrapper"
        className="w-full h-full overflow-hidden relative"
      >
        {/* SP-FX-25: touch-none prevents browser default pinch behavior; transform applied here */}
        <div
          ref={gestureRef}
          data-testid="runtime-touch-container"
          className="origin-top-left touch-none w-full h-full"
          style={{ transform: `translate(${transform.panX}px, ${transform.panY}px) scale(${transform.scale})` }}
        >
          <div
            ref={containerRef}
            data-runtime-canvas-host
            className="w-full h-full overflow-auto bg-white"
          />
        </div>
      </div>
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
