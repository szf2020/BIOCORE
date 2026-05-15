'use client';
import React from 'react';
import type { ScadaSuggestion } from '@/api/scada';
import { SuggestionRow } from './SuggestionRow';

interface Props {
  suggestions: ScadaSuggestion[];
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
}

export function SuggestionList({ suggestions, onAccept, onReject }: Props) {
  if (suggestions.length === 0) {
    return <div className="p-6 text-center text-gray-400 text-sm">暂无待处理 SCADA 建议</div>;
  }
  return (
    <div className="space-y-2">
      {suggestions.map((s) => (
        <SuggestionRow key={s.id} suggestion={s} onAccept={onAccept} onReject={onReject} />
      ))}
    </div>
  );
}
