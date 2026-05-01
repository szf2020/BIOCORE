import { EventEmitter } from 'events';
import type { BatchState, Recipe, PhaseConfig, PhaseType, StepDefinition, ButtonEnableState } from '@biocore/types';
interface BatchContext {
    batch_id: string;
    recipe: Recipe;
    current_phase_index: number;
    current_step_number: number;
    batch_start_time: number;
    phase_start_time: number;
    step_start_time: number;
    hold_reason: string | null;
    stop_trigger: 'cmd_stop' | 'safety_estop' | null;
    phase_contexts: Record<string, any>;
}
export declare const batchMachine: import("xstate").StateMachine<BatchContext, import("xstate").AnyEventObject, Record<string, import("xstate").AnyActorRef>, import("xstate").ProvidedActor, import("xstate").ParameterizedObject, import("xstate").ParameterizedObject, string, import("xstate").StateValue, string, unknown, import("xstate").NonReducibleUnknown, import("xstate").EventObject, import("xstate").MetaObject, any>;
export declare function getButtonEnableState(state: BatchState): ButtonEnableState;
export interface InterlockResult {
    id: string;
    name: string;
    passed: boolean;
    detail: string;
}
export declare function checkInterlocks(plcRead: (tag: string) => Promise<number>): Promise<{
    allPassed: boolean;
    results: InterlockResult[];
}>;
export declare class PhaseExecutor extends EventEmitter {
    private recipe;
    private phaseIndex;
    constructor(recipe: Recipe);
    getCurrentPhase(): PhaseConfig;
    getTotalPhases(): number;
    getPhaseSteps(phaseType: PhaseType): StepDefinition[];
    advancePhase(): boolean;
}
export declare function getStepDefinitions(phaseType: PhaseType): StepDefinition[];
export declare class StepConditionEvaluator {
    evaluate(condition: StepDefinition['completion_condition'], currentValues: Record<string, number>, stepStartTime: number, accumulatedValue?: number): {
        met: boolean;
        progress: number;
    };
}
export type PhaseState = 'pending' | 'ready' | 'running' | 'held' | 'completed' | 'skipped' | 'failed';
export interface PhaseStatus {
    phase_id: string;
    phase_type: string;
    phase_index: number;
    state: PhaseState;
    step_number: number;
    total_steps: number;
    step_name: string;
    hold_reason?: string;
    started_at?: string;
    ended_at?: string;
}
export { StepEngine } from './step-engine';
export type { StepEvalResult, StepLogEntry } from './step-engine';
export { RunningFaultMonitor } from './running-fault-monitor';
export type { FaultCheckResult } from './running-fault-monitor';
export { BatchController } from './batch-controller';
export type { BatchControllerConfig } from './batch-controller';
export { ReactorManager } from './reactor-manager';
export { CommWatchdog } from './comm-watchdog';
export type { CommWatchdogConfig } from './comm-watchdog';
export { validateRecipe } from './recipe-validator';
export type { ValidationResult, ValidationIssue } from './recipe-validator';
export { DAGExecutor } from './dag-executor';
export type { DAGNode, DAGNodeType, DAGEdge, RecipeDAG, DAGEvalContext, DAGPhaseNode, DAGBranchNode, DAGStartNode, DAGEndNode, } from './dag-executor';
export { parseExpression, evaluate as evaluateAst, evaluateExpression, ALLOWED_FIELDS, ALLOWED_OPS, } from './condition-evaluator';
export type { ExprNode, ComparisonNode, LogicalNode, AllowedField, ComparisonOp } from './condition-evaluator';
export { validateDag } from './recipe-validator';
export { batchMachine as default };
//# sourceMappingURL=index.d.ts.map