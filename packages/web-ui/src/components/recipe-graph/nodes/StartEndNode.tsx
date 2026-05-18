// StartEndNode — react-flow start/end 节点 (M3.7)
'use client';

import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Play, Square } from 'lucide-react';
import { useLocale } from '@/i18n/useLocale';

export function StartNode({ selected }: NodeProps) {
  const { t } = useLocale();
  return (
    <div
      className={`relative w-14 h-14 rounded-full border-2 flex items-center justify-center shadow-md transition-colors ${
        selected ? 'border-green-400 shadow-green-500/30' : 'border-green-600/60'
      } bg-green-950/40`}
    >
      <Play className="w-5 h-5 text-emerald-600" fill="currentColor" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-green-400" />
    </div>
  );
}

export function EndNode({ selected }: NodeProps) {
  return (
    <div
      className={`relative w-14 h-14 rounded-full border-2 flex items-center justify-center shadow-md transition-colors ${
        selected ? 'border-red-400 shadow-red-500/30' : 'border-red-600/60'
      } bg-red-950/40`}
    >
      <Square className="w-5 h-5 text-red-600" fill="currentColor" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-red-400" />
    </div>
  );
}
