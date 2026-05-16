'use client';
import React from 'react';
import { useTag } from '@/hooks/useTag';
import { getSvgWidget } from '@/widgets/svg/registry';
import type { SvgWidgetItem } from '@/widgets/svg/types';
import { SvgErrorBoundary } from './SvgErrorBoundary';

interface Props {
  instance: SvgWidgetItem;
  reactorId: string;
}

// useTag in the SCADA context is called with (reactorId, tagName) separately.
// The hook accepts this two-arg form for the SVG widget system.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const useTagTwoArg = useTag as unknown as (reactorId: string, tag: string) => { value: unknown; stale: boolean };

export function SvgWidgetInstance({ instance, reactorId }: Props) {
  const tagName = instance.bindings?.tag ?? '';

  // Hook called unconditionally (Rules of Hooks); empty tag = no binding.
  const tagState = useTagTwoArg(reactorId, tagName);
  const hasBinding = !!instance.bindings?.tag;

  if (instance.visible === false) return null;

  const transform = buildTransform(instance);
  const reg = getSvgWidget(instance.type);

  if (!reg) {
    console.warn(`Unknown SVG widget type: ${instance.type}`);
    return (
      <g transform={transform}>
        <rect width={instance.w} height={instance.h} fill="#fee" stroke="#c33" />
        <text x={4} y={14} fontSize={10} fill="#c33">?{instance.type}</text>
      </g>
    );
  }

  const Component = reg.component;

  return (
    <g transform={transform}>
      <SvgErrorBoundary widgetId={instance.id} w={instance.w} h={instance.h}>
        <Component
          width={instance.w}
          height={instance.h}
          tagValue={hasBinding ? tagState.value : undefined}
          tagStale={hasBinding ? tagState.stale : undefined}
          config={instance.props}
        />
      </SvgErrorBoundary>
    </g>
  );
}

function buildTransform(instance: SvgWidgetItem): string {
  const parts: string[] = [`translate(${instance.x},${instance.y})`];
  if (instance.rotation) {
    parts.push(`rotate(${instance.rotation},${instance.w / 2},${instance.h / 2})`);
  }
  return parts.join(' ');
}
