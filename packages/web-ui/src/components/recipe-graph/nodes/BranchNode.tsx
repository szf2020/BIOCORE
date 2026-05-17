// BranchNode — react-flow 自定义 branch (IF/ELSE) 节点 (M3.7 / M3.8)
'use client';

import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

export interface BranchNodeData extends Record<string, unknown> {
  expression: string;
  valid?: boolean;
}

export function BranchNode({ data, selected }: NodeProps) {
  const d = data as BranchNodeData;
  const expr = d.expression || '(未设置)';

  return (
    <div
      className={`relative px-3 py-2 rounded-md border-2 shadow-md min-w-[180px] transition-colors ${
        selected ? 'border-amber-400 shadow-amber-500/20' : 'border-amber-600/50'
      } bg-amber-950/30`}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-amber-400" />

      <div className="flex items-center gap-2">
        <GitBranch className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <div className="text-xs font-semibold text-amber-200">IF / ELSE</div>
      </div>
      <div className="mt-1 pt-1 border-t border-amber-700/40 text-xs font-mono text-amber-100 truncate">
        {expr}
      </div>
      {d.valid === false && (
        <div className="mt-0.5 text-[11px] text-red-600">表达式无效</div>
      )}

      {/* true edge (右上) */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ top: '30%' }}
        className="!w-2 !h-2 !bg-green-400"
      />
      {/* false edge (右下) */}
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        style={{ top: '70%' }}
        className="!w-2 !h-2 !bg-red-400"
      />
    </div>
  );
}
