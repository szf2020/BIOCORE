// PhaseNode — react-flow 自定义 phase 节点 (M3.7)
'use client';

import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Beaker } from 'lucide-react';
import { useLocale } from '@/i18n/useLocale';

export interface PhaseNodeData extends Record<string, unknown> {
  phase_id: string;
  phase_type: string;
  label: string;
  params?: Record<string, any>;
  // SP-RG-4: 可选 — 绑定到具体 phase_instance (phase class + reactor 绑定记录)。
  // 运行时优先用 instance.params_override;未绑定时 fallback 到 inline params。
  instance_id?: string;
}

export function PhaseNode({ data, selected }: NodeProps) {
  const { t } = useLocale();
  const d = data as PhaseNodeData;
  const paramCount = d.params ? Object.keys(d.params).length : 0;

  return (
    <div
      className={`relative px-3 py-2 rounded-md border-2 shadow-md min-w-[160px] bg-card transition-colors ${
        selected ? 'border-primary shadow-primary/20' : 'border-border'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-primary" />
      <div className="flex items-center gap-2">
        <Beaker className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{d.label || d.phase_id}</div>
          <div className="text-sm text-muted-foreground font-mono truncate">
            {d.phase_type}
          </div>
        </div>
      </div>
      {d.instance_id && (
        <div className="mt-1 text-[11px] text-emerald-600 font-mono truncate" title={`绑定到 phase instance: ${d.instance_id}`}>
          ⛓ {d.instance_id}
        </div>
      )}
      {paramCount > 0 && (
        <div className="mt-1 pt-1 border-t border-border/40 text-[12px] text-muted-foreground">
          {paramCount} 参数
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary" />
    </div>
  );
}
