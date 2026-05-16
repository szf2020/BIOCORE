'use client';
import React from 'react';
import { useTag } from '@/hooks/useTag';
import { getSvgWidget } from '@/widgets/svg/registry';
import type { SvgWidgetItem } from '@/widgets/svg/types';
import { applyAnimations } from '@/widgets/svg/animation/apply';
import { useAnimationTagStates } from '@/widgets/svg/animation/useAnimationTagStates';
import { useBlink } from '@/widgets/svg/animation/useBlink';
import { SvgErrorBoundary } from './SvgErrorBoundary';

interface Props {
  instance: SvgWidgetItem;
  reactorId: string;
  editMode?: boolean;
  onWriteIntent?: (widget: SvgWidgetItem) => void;
}

export function SvgWidgetInstance({ instance, reactorId: _reactorId, editMode = false, onWriteIntent }: Props) {
  const tagName = instance.bindings?.tag ?? '';
  const tagState = useTag(tagName);
  const hasBinding = !!instance.bindings?.tag;

  const animTagStates = useAnimationTagStates(instance.animations);
  const blinkPhase = useBlink(instance.animations);
  const animResult = applyAnimations(
    instance.animations,
    animTagStates.map((s) => s.value),
    blinkPhase,
    instance.w,
    instance.h,
  );

  if (instance.visible === false) return null;
  if (!animResult.visible) return null;

  const transform = buildTransform(instance, animResult.transform);
  const reg = getSvgWidget(instance.type);

  const inner = (() => {
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
    const mergedConfig = { ...(instance.props ?? {}), ...animResult.configOverrides };
    return (
      <g transform={transform} opacity={animResult.opacity}>
        <SvgErrorBoundary widgetId={instance.id} w={instance.w} h={instance.h}>
          <Component
            width={instance.w}
            height={instance.h}
            tagValue={hasBinding ? tagState.value : undefined}
            tagStale={hasBinding ? tagState.isStale : undefined}
            tagName={instance.bindings?.tag}
            config={mergedConfig}
          />
        </SvgErrorBoundary>
      </g>
    );
  })();

  // Priority: writeIntent > link. Both ignored in editMode.
  if (!editMode && instance.writeIntent?.tag && onWriteIntent) {
    return (
      <g
        data-write-intent="true"
        style={{ cursor: 'pointer' }}
        onClick={() => onWriteIntent(instance)}
      >
        {inner}
      </g>
    );
  }
  if (!editMode && instance.link?.viewId) {
    return <a href={`/scada2/${instance.link.viewId}`}>{inner}</a>;
  }
  return inner;
}

function buildTransform(instance: SvgWidgetItem, animationTransform: string): string {
  const parts: string[] = [`translate(${instance.x},${instance.y})`];
  if (instance.rotation != null && instance.rotation !== 0) {
    parts.push(`rotate(${instance.rotation},${instance.w / 2},${instance.h / 2})`);
  }
  if (animationTransform) {
    parts.push(animationTransform);
  }
  return parts.join(' ');
}
