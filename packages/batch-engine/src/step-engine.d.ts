import { EventEmitter } from 'events';
import type { PhaseType, StepDefinition } from '@biocore/types';
export interface StepEvalResult {
    action: 'continue' | 'step_advanced' | 'phase_complete' | 'timeout_hold';
    fromStep?: number;
    toStep?: number;
    reason?: string;
    progress?: number;
}
export interface StepLogEntry {
    phase_index: number;
    phase_id: string;
    phase_type: PhaseType;
    step_number: number;
    step_name: string;
    started_at: string;
    ended_at?: string;
    elapsed_sec: number;
    result: 'completed' | 'timeout' | 'interrupted';
    condition_actual?: number;
    entry_snapshot?: Record<string, number>;
    exit_snapshot?: Record<string, number>;
}
export declare class StepEngine extends EventEmitter {
    private steps;
    private currentIndex;
    private stepStartTime;
    private evaluator;
    private phaseParams;
    private phaseType;
    private phaseIndex;
    private phaseId;
    private accumulators;
    private baselines;
    private entrySnapshot;
    private lastPV;
    constructor(phaseType: PhaseType, phaseIndex: number, phaseId: string, phaseParams?: Record<string, any>, 
    /** 外部注入的步骤定义 (来自数据库模板), 为空则回退硬编码 */
    injectedSteps?: StepDefinition[]);
    private applyParamsToConditions;
    get currentStep(): number;
    get currentStepName(): string;
    get totalSteps(): number;
    get isComplete(): boolean;
    get stepElapsedSec(): number;
    evaluate(pv: Record<string, number>): StepEvalResult;
    private updateAccumulators;
    private createLogEntry;
    interrupt(): StepLogEntry | null;
}
//# sourceMappingURL=step-engine.d.ts.map