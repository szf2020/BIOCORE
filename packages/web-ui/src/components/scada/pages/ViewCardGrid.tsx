'use client';
import React from 'react';
import { ViewCard } from './ViewCard';
import type { ViewMeta } from '@/hooks/useViewList';

interface Props {
  views: ViewMeta[];
  onEdit: (viewId: string) => void;
  onOpen: (viewId: string) => void;
  onDuplicate: (viewId: string) => void;
  onDelete: (view: ViewMeta) => void;
}

export function ViewCardGrid({ views, onEdit, onOpen, onDuplicate, onDelete }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {views.map((v) => (
        <ViewCard
          key={v.view_id}
          view={v}
          onEdit={onEdit}
          onOpen={onOpen}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
