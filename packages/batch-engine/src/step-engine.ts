// ============================================================
// StepEngine — Phase 内 Step 执行引擎
// 每秒由 BatchController 调用 evaluate()，传入 PLC 最新过程值
// 驱动 Step 推进，记录执行日志
// ============================================================

import { EventEmitter } from 'events';
import { getStepDefinitions, StepConditionEvaluator } from './index';
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

// 每种Phase类型的Step默认超时 (秒)，key = phaseType:stepNumber，0=无超时
const STEP_TIMEOUTS: Record<string, number> = {
  'manual_add:3': 3600,    // 等待操作员加料, 1小时超时
  'fermentation:2': 0,     // 发酵运行, 由 duration_h 控制
  'feeding:2': 0,          // 补料运行, 由累积量控制
};

export class StepEngine extends EventEmitter {
  private steps: StepDefinition[];
  private currentIndex = 0;
  private stepStartTime = Date.now();
  private evaluator = new StepConditionEvaluator();
  private phaseParams: Record<string, any>;
  private phaseType: PhaseType;
  private phaseIndex: number;
  private phaseId: string;

  // 运行时累积器
  private accumulators = new Map<string, number>();
  private baselines = new Map<string, number>();
  private entrySnapshot: Record<string, number> = {};
  private lastPV: Record<string, number> = {};

  constructor(
    phaseType: PhaseType,
    phaseIndex: number,
    phaseId: string,
    phaseParams: Record<string, any> = {},
    /** 外部注入的步骤定义 (来自数据库模板), 为空则回退硬编码 */
    injectedSteps?: StepDefinition[],
  ) {
    super();
    const rawSteps = (injectedSteps && injectedSteps.length > 0)
      ? injectedSteps
      : getStepDefinitions(phaseType);
    this.steps = JSON.parse(JSON.stringify(rawSteps));
    this.phaseType = phaseType;
    this.phaseIndex = phaseIndex;
    this.phaseId = phaseId;
    this.phaseParams = phaseParams;
    this.applyParamsToConditions();
  }

  // 将配方参数注入到Step完成条件中
  private applyParamsToConditions(): void {
    for (const step of this.steps) {
      const cond = step.completion_condition;

      // water_fill: target_weight_kg → Step2粗加水、Step3精加水
      if (this.phaseType === 'water_fill' && cond.type === '>=' && cond.channel === 'AI-6') {
        const target = this.phaseParams.target_weight_kg ?? 0;
        const offset = this.phaseParams.coarse_offset_kg ?? 0.3;
        if (step.step_number === 2) cond.value = target - offset;
        if (step.step_number === 3) cond.value = target;
      }

      // heating/temp_control: target_temp_C
      if ((this.phaseType === 'heating' || this.phaseType === 'temp_control') &&
          cond.channel === 'AI-0' && cond.value === undefined) {
        cond.value = this.phaseParams.target_temp_C;
      }

      // sip: target_temp_C, hold_time_min, cool_to_C
      if (this.phaseType === 'sip') {
        if (step.step_number === 2 && cond.value === undefined) cond.value = this.phaseParams.target_temp_C ?? 121;
        if (step.step_number === 3 && cond.type === 'accumulated') cond.value = this.phaseParams.hold_time_min ?? 20;
        if (step.step_number === 4 && cond.value === undefined) cond.value = this.phaseParams.cool_to_C ?? 40;
      }

      // discharge: cool_to_C
      if (this.phaseType === 'discharge' && step.step_number === 1 && cond.value === undefined) {
        cond.value = (this.phaseParams.cool_to_C ?? 8) + 2;
      }

      // fermentation: duration_h → Step2 duration
      if (this.phaseType === 'fermentation' && step.step_number === 2 && cond.type === 'duration') {
        cond.duration_s = (this.phaseParams.duration_h ?? 8) * 3600;
      }

      // agitation: target_rpm
      if (this.phaseType === 'agitation' && cond.channel === 'rpm' && cond.value === undefined) {
        cond.value = this.phaseParams.target_rpm;
      }

      // aeration: target_NL_min
      if (this.phaseType === 'aeration' && cond.channel === 'AI-5' && cond.value === undefined) {
        cond.value = this.phaseParams.target_NL_min;
      }

      // ph_control: target_pH → in_band SV
      if (this.phaseType === 'ph_control' && cond.channel === 'AI-2' && cond.tolerance === undefined) {
        cond.tolerance = this.phaseParams.deadband ?? 0.05;
      }

      // manual_add: expected_delta_kg
      if (this.phaseType === 'manual_add' && step.step_number === 3 && cond.type === 'delta') {
        cond.value = this.phaseParams.expected_delta_kg ?? 0.05;
      }

      // in_band 类型设置默认 tolerance
      if (cond.type === 'in_band' && cond.tolerance === undefined) {
        cond.tolerance = this.phaseParams.deadband ?? 0.5;
      }

      // BUG-12: Check for remaining undefined values in conditions that need them
      if (cond.type === '>=' || cond.type === '<=' || cond.type === 'in_band') {
        if (cond.value === undefined && cond.type !== 'in_band') {
          console.warn(
            `[StepEngine] WARNING: ${this.phaseType} step ${step.step_number} ("${step.name}") ` +
            `has undefined condition value after param injection. ` +
            `Check that phaseParams includes the required parameter.`
          );
        }
        if (cond.type === 'in_band' && cond.tolerance === undefined) {
          console.warn(
            `[StepEngine] WARNING: ${this.phaseType} step ${step.step_number} ("${step.name}") ` +
            `has undefined tolerance after param injection.`
          );
        }
      }

      // 递归处理 and/or 子条件
      if (cond.sub_conditions) {
        for (const sub of cond.sub_conditions) {
          if (sub.type === 'in_band' && sub.tolerance === undefined) {
            sub.tolerance = this.phaseParams.deadband ?? 0.5;
          }
          if (sub.channel === 'AI-0' && sub.type === 'in_band') {
            // 温度稳定条件需要知道SV
          }
        }
      }
    }
  }

  get currentStep(): number {
    return this.steps[this.currentIndex]?.step_number ?? 0;
  }

  get currentStepName(): string {
    return this.steps[this.currentIndex]?.name ?? '';
  }

  get totalSteps(): number {
    return this.steps.length;
  }

  get isComplete(): boolean {
    return this.currentIndex >= this.steps.length;
  }

  get stepElapsedSec(): number {
    return Math.round((Date.now() - this.stepStartTime) / 1000);
  }

  // 每秒调用，传入PLC最新过程值
  evaluate(pv: Record<string, number>): StepEvalResult {
    if (this.currentIndex >= this.steps.length) {
      return { action: 'phase_complete' };
    }

    // Store latest PV for use in interrupt()
    this.lastPV = { ...pv };

    const stepDef = this.steps[this.currentIndex];
    const elapsed = (Date.now() - this.stepStartTime) / 1000;

    // 首次进入Step时记录快照
    if (Object.keys(this.entrySnapshot).length === 0) {
      this.entrySnapshot = { ...pv };
    }

    // 更新累积器 (F₀积分等)
    this.updateAccumulators(pv, stepDef);

    // 评估完成条件
    const accumulated = this.accumulators.get(stepDef.name) ?? 0;
    const evalResult = this.evaluator.evaluate(
      stepDef.completion_condition, pv, this.stepStartTime, accumulated
    );

    if (evalResult.met) {
      // Step完成 → 记录日志
      const logEntry = this.createLogEntry(stepDef, elapsed, 'completed', pv);
      this.emit('step_completed', logEntry);

      // 推进到下一步
      this.currentIndex++;
      if (this.currentIndex >= this.steps.length) {
        return { action: 'phase_complete' };
      }

      this.stepStartTime = Date.now();
      this.entrySnapshot = {};
      const nextStep = this.steps[this.currentIndex];

      this.emit('step_started', {
        phase_type: this.phaseType,
        step_number: nextStep.step_number,
        step_name: nextStep.name,
      });

      return {
        action: 'step_advanced',
        fromStep: stepDef.step_number,
        toStep: nextStep.step_number,
      };
    }

    // 超时检查 (manual_add 等等)
    const timeoutKey = `${this.phaseType}:${stepDef.step_number}`;
    const timeout = STEP_TIMEOUTS[timeoutKey] ?? 0;
    if (timeout > 0 && elapsed >= timeout) {
      const logEntry = this.createLogEntry(stepDef, elapsed, 'timeout', pv);
      this.emit('step_timeout', logEntry);
      return { action: 'timeout_hold', reason: `${stepDef.name} 超时 (${timeout}秒)` };
    }

    return { action: 'continue', progress: evalResult.progress };
  }

  // F₀积分: F₀ += 10^((T - 121) / 10) × Δt (分钟)
  private updateAccumulators(pv: Record<string, number>, stepDef: StepDefinition): void {
    if (stepDef.completion_condition.type === 'accumulated' && this.phaseType === 'sip') {
      const temp = pv['AI-0'] ?? 0;
      const coldPoint = pv['AI-1'] ?? temp;
      const minTemp = Math.min(temp, coldPoint);

      if (minTemp >= 100) {
        const f0Increment = Math.pow(10, (minTemp - 121) / 10) / 60; // 每秒增量(分钟)
        const current = this.accumulators.get(stepDef.name) ?? 0;
        this.accumulators.set(stepDef.name, current + f0Increment);
      } else {
        // 冷点温度<100°C → F₀清零
        this.accumulators.set(stepDef.name, 0);
      }
    }
  }

  private createLogEntry(
    stepDef: StepDefinition,
    elapsed: number,
    result: 'completed' | 'timeout' | 'interrupted',
    pv: Record<string, number>,
  ): StepLogEntry {
    return {
      phase_index: this.phaseIndex,
      phase_id: this.phaseId,
      phase_type: this.phaseType,
      step_number: stepDef.step_number,
      step_name: stepDef.name,
      started_at: new Date(this.stepStartTime).toISOString(),
      ended_at: new Date().toISOString(),
      elapsed_sec: Math.round(elapsed),
      result,
      entry_snapshot: this.entrySnapshot,
      exit_snapshot: { ...pv },
    };
  }

  // 中断当前Step (Hold/Stop时调用)
  interrupt(): StepLogEntry | null {
    if (this.currentIndex >= this.steps.length) return null;
    const stepDef = this.steps[this.currentIndex];
    const elapsed = (Date.now() - this.stepStartTime) / 1000;
    return this.createLogEntry(stepDef, elapsed, 'interrupted', this.lastPV);
  }
}
