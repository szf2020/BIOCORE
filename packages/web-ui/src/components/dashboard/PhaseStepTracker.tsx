// ============================================================
// PhaseStepTracker — 阶段/步骤进度追踪
// 显示 Phase 点阵进度 + 当前步骤详情 + 下一步预览
// ============================================================

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StateUpdatePayload } from '@/types';

interface PhaseStepTrackerProps {
  state: StateUpdatePayload | null;
  phaseNames?: string[];
}

export function PhaseStepTracker({ state, phaseNames }: PhaseStepTrackerProps) {
  const phaseIndex = state?.phase_index ?? 0;
  const totalPhases = state?.total_phases ?? 0;
  const stepNumber = state?.step_number ?? 0;
  const totalSteps = state?.total_steps ?? 0;
  const stepElapsed = state?.step_elapsed_sec ?? 0;

  const formatTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}分${s.toString().padStart(2, '0')}秒`;
  };

  const stepProgress = totalSteps > 0 ? (stepNumber / totalSteps) * 100 : 0;

  if (!state) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">阶段进度</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">等待批次启动...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">阶段进度</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Phase 点阵进度 */}
        {totalPhases > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {Array.from({ length: totalPhases }).map((_, i) => {
              const isCompleted = i < phaseIndex;
              const isCurrent = i === phaseIndex;
              const name = phaseNames?.[i] ?? `P${i + 1}`;
              return (
                <div key={i} className="flex items-center gap-1">
                  <div className="flex flex-col items-center gap-0.5">
                    <span
                      className={cn(
                        'text-lg leading-none',
                        isCompleted && 'text-green-500',
                        isCurrent && 'text-blue-500',
                        !isCompleted && !isCurrent && 'text-muted-foreground/40',
                      )}
                    >
                      {isCompleted ? '●' : isCurrent ? '◉' : '○'}
                    </span>
                    <span className={cn(
                      'text-[10px] max-w-[48px] truncate',
                      isCurrent ? 'text-blue-600 font-medium' : 'text-muted-foreground',
                    )}>
                      {name}
                    </span>
                  </div>
                  {i < totalPhases - 1 && (
                    <ChevronRight className="w-3 h-3 text-muted-foreground/30 -mt-3" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 当前步骤详情 */}
        <div className="space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-medium">
              步骤 {stepNumber}/{totalSteps}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {formatTime(stepElapsed)}
            </span>
          </div>
          <div className="text-sm">{state.step_name || '--'}</div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${stepProgress}%` }}
            />
          </div>
        </div>

        {/* 下一步预览 */}
        {stepNumber < totalSteps && (
          <div className="text-xs text-muted-foreground border-t pt-2">
            下一步: 步骤 {stepNumber + 1}
          </div>
        )}
        {stepNumber >= totalSteps && totalSteps > 0 && (
          <div className="text-xs text-green-600 border-t pt-2">
            当前阶段即将完成
          </div>
        )}
      </CardContent>
    </Card>
  );
}
