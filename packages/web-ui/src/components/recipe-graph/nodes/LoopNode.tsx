// LoopNode — react-flow 自定义 loop (B1.2) 节点
'use client';

import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Repeat } from 'lucide-react';

export interface LoopNodeData extends Record<string, unknown> {
  exitExpression?: string;
  maxIterations?: number;
  label?: string;
}

export function LoopNode({ data, selected }: NodeProps) {
  const d = data as LoopNodeData;
  const exitExpr = d.exitExpression && d.exitExpression.trim().length > 0
    ? d.exitExpression
    : '∞';
  const maxIter = d.maxIterations != null ? d.maxIterations : '∞';

  return (
    <div
      className={`relative px-3 py-2 rounded-md border-2 shadow-md min-w-[180px] transition-colors ${
        selected ? 'border-teal-400 shadow-teal-500/20' : 'border-teal-600/50'
      } bg-teal-950/30`}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-teal-400" />
      <div className="flex items-center gap-2">
        <Repeat className="w-3.5 h-3.5 text-teal-300 flex-shrink-0" />
        <div className="text-xs font-semibold text-teal-100">↻ Loop</div>
      </div>
      <div className="mt-1 pt-1 border-t border-teal-700/40 text-[10px] font-mono text-teal-100 truncate">
        <div>until: <span className="text-teal-300">{exitExpr}</span></div>
        <div>max: <span className="text-teal-300">{maxIter}</span></div>
      </div>
      {/* Two source handles: body (top right) and exit (bottom right) */}
      <Handle
        id="body"
        type="source"
        position={Position.Right}
        style={{ top: '40%' }}
        className="!w-2 !h-2 !bg-teal-400"
      />
      <Handle
        id="exit"
        type="source"
        position={Position.Right}
        style={{ top: '70%' }}
        className="!w-2 !h-2 !bg-orange-400"
      />
    </div>
  );
}
