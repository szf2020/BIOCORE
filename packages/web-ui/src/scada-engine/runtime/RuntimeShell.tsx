'use client';
import React from 'react';
import type { JSX } from 'react';
import { RuntimeCanvas } from './RuntimeCanvas';
import type { FuxaView } from '../models';

export interface RuntimeShellProps {
  view: FuxaView;
  viewId: string;
  reactorId: string;
}

export function RuntimeShell({ view, viewId, reactorId }: RuntimeShellProps): JSX.Element {
  return (
    <div className="w-screen h-screen bg-zinc-100">
      <RuntimeCanvas view={view} viewId={viewId} reactorId={reactorId} />
    </div>
  );
}
