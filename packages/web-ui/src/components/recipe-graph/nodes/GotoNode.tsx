// GotoNode — react-flow 自定义 goto (B1.3) 节点
'use client';

import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { CornerDownRight } from 'lucide-react';
import { useLocale } from '@/i18n/useLocale';

export interface GotoNodeData extends Record<string, unknown> {
  target: string;
  label?: string;
}

export function GotoNode({ data, selected }: NodeProps) {
  const { t } = useLocale();
  const d = data as GotoNodeData;
  const target = d.target || '(未设置)';

  return (
    <div
      className={`relative px-3 py-2 rounded-md border-2 shadow-md min-w-[160px] transition-colors ${
        selected ? 'border-violet-400 shadow-violet-500/20' : 'border-violet-600/50'
      } bg-violet-950/30`}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-violet-400" />
      <div className="flex items-center gap-2">
        <CornerDownRight className="w-3.5 h-3.5 text-violet-300 flex-shrink-0" />
        <div className="text-sm font-semibold text-violet-100">Goto</div>
      </div>
      <div className="mt-1 pt-1 border-t border-violet-700/40 text-sm font-mono text-violet-100 truncate">
        → {target}
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-violet-400" />
    </div>
  );
}
