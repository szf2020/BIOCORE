'use client';
import React, { useState } from 'react';
import { SvgViewJsonSchema, type SvgViewJson, type SvgWidgetItem } from '@/widgets/svg/types';
import { SvgWidgetInstance } from './SvgWidgetInstance';
import { ViewErrorDisplay } from './ViewErrorDisplay';
import { WriteIntentDialog } from './runtime/WriteIntentDialog';

interface Props {
  view: SvgViewJson;
  reactorId: string;
  viewId?: string;
}

export function ScadaCanvas({ view, reactorId, viewId = '' }: Props) {
  const parsed = SvgViewJsonSchema.safeParse(view);
  if (!parsed.success) {
    return <ViewErrorDisplay issues={parsed.error.issues} />;
  }
  const v = parsed.data as SvgViewJson;

  const sorted = [...v.items].sort(byZIndex);
  const [dialogWidget, setDialogWidget] = useState<SvgWidgetItem | null>(null);

  return (
    <>
      <svg
        viewBox={`0 0 ${v.width} ${v.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        {v.background ? <rect width={v.width} height={v.height} fill={v.background} /> : null}
        {sorted.map((item) => (
          <SvgWidgetInstance
            key={item.id}
            instance={item as SvgWidgetItem}
            reactorId={reactorId}
            onWriteIntent={setDialogWidget}
          />
        ))}
      </svg>
      {dialogWidget && (
        <WriteIntentDialog
          viewId={viewId}
          widget={dialogWidget}
          onClose={() => setDialogWidget(null)}
        />
      )}
    </>
  );
}

function byZIndex(a: SvgWidgetItem, b: SvgWidgetItem): number {
  return (a.zIndex ?? 0) - (b.zIndex ?? 0);
}
