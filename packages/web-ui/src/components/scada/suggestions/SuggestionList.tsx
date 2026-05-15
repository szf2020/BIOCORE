'use client';
import React from 'react';
import type { ScadaSuggestion } from '@/api/scada';
import { SuggestionRow } from './SuggestionRow';

interface Props {
  suggestions: ScadaSuggestion[];
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
  onRetry?: (id: number) => void;
  emptyText?: string;
}

export function SuggestionList({ suggestions, onAccept, onReject, onRetry, emptyText }: Props) {
  if (suggestions.length === 0) {
    return <div className="p-6 text-center text-gray-400 text-sm">{emptyText ?? '暂无待处理 SCADA 建议'}</div>;
  }
  return (
    <div className="space-y-2">
      {suggestions.map((s) => (
        <SuggestionRow key={s.id} suggestion={s} onAccept={onAccept} onReject={onReject} onRetry={onRetry} />
      ))}
    </div>
  );
}
