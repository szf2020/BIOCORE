'use client';
import React from 'react';
import type { JSX } from 'react';
import { RuntimeCanvas } from './RuntimeCanvas';
import { SuggestionsBar } from '@/components/scada/runtime/SuggestionsBar';
import type { FuxaView } from '../models';

export interface RuntimeShellProps {
  view: FuxaView;
  viewId: string;
  reactorId: string;
  showSuggestions?: boolean;
}

export function RuntimeShell({ view, viewId, reactorId, showSuggestions = true }: RuntimeShellProps): JSX.Element {
  return (
    <div className="relative w-screen h-screen bg-zinc-100">
      <RuntimeCanvas view={view} viewId={viewId} reactorId={reactorId} />
      <SuggestionsBar viewId={viewId} reactorId={reactorId} showSuggestions={showSuggestions} />
    </div>
  );
}
