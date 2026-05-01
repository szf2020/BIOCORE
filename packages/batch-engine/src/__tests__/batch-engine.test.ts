// ============================================================
// batch-engine 单元测试
// 状态流转、条件评估、配方校验、Step引擎、故障检测
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getButtonEnableState,
  getStepDefinitions,
  StepConditionEvaluator,
  validateRecipe,
  RunningFaultMonitor,
} from '../index';
import { StepEngine } from '../step-engine';
import type { BatchState, Recipe } from '@biocore/types';

// ─── 按钮使能规则 ──────────────────────────────────────────

describe('getButtonEnableState', () => {
  it('Idle: 仅start和estop可用', () => {
    const b = getButtonEnableState('idle');
    expect(b.start).toBe(true);
    expect(b.hold).toBe(false);
    expect(b.restart).toBe(false);
    expect(b.pause).toBe(false);
    expect(b.stop).toBe(false);
    expect(b.reset).toBe(false);
  });

  it('Running: hold/pause可用', () => {
    const b = getButtonEnableState('running');
    expect(b.start).toBe(false);
    expect(b.hold).toBe(true);
    expect(b.pause).toBe(true);
    expect(b.stop).toBe(false); // Running不能直接stop，需先pause
    expect(b.estop).toBe(true);
  });

  it('Held: restart/stop可用', () => {
    const b = getButtonEnableState('held');
    expect(b.restart).toBe(true);
    expect(b.stop).toBe(true);
    expect(b.start).toBe(false);
  });

  it('Paused: unpause/stop可用', () => {
    const b = getButtonEnableState('paused');
    expect(b.unpause).toBe(true);
    expect(b.stop).toBe(true);
    expect(b.pause).toBe(false);
  });

  it('Stopped: 仅reset可用', () => {
    const b = getButtonEnableState('stopped');
    expect(b.reset).toBe(true);
    expect(b.start).toBe(false);
    expect(b.estop).toBe(false);
  });

  it('Complete: 仅reset可用', () => {
    const b = getButtonEnableState('complete');
    expect(b.reset).toBe(true);
    expect(b.start).toBe(false);
  });
});

// ─── Step定义完整性 ─────────────────────────────────────────

describe('getStepDefinitions', () => {
  const phaseTypes = [
    'prepare', 'water_fill', 'manual_add', 'heating', 'agitation',
    'feeding', 'temp_control', 'ph_control', 'do_control', 'aeration',
    'discharge', 'fermentation', 'cip', 'sip',
  ] as const;

  for (const pt of phaseTypes) {
    it(`${pt} 有步骤定义`, () => {
      const steps = getStepDefinitions(pt);
      expect(steps.length).toBeGreaterThan(0);
      // 步号连续
      steps.forEach((s, i) => expect(s.step_number).toBe(i + 1));
      // 每步有名称和完成条件
      steps.forEach(s => {
        expect(s.name).toBeTruthy();
        expect(s.completion_condition).toBeTruthy();
      });
    });
  }

  it('prepare 有5步', () => {
    expect(getStepDefinitions('prepare')).toHaveLength(5);
  });

  it('sip 有4步', () => {
    expect(getStepDefinitions('sip')).toHaveLength(4);
  });

  it('fermentation 有3步', () => {
    expect(getStepDefinitions('fermentation')).toHaveLength(3);
  });
});

// ─── 条件评估器 ─────────────────────────────────────────────

describe('StepConditionEvaluator', () => {
  const evaluator = new StepConditionEvaluator();
  const now = Date.now();

  it('>= 条件: PV达到目标', () => {
    const r = evaluator.evaluate(
      { type: '>=', channel: 'AI-0', value: 121 },
      { 'AI-0': 122 }, now, 0
    );
    expect(r.met).toBe(true);
  });

  it('>= 条件: PV未达到', () => {
    const r = evaluator.evaluate(
      { type: '>=', channel: 'AI-0', value: 121 },
      { 'AI-0': 100 }, now, 0
    );
    expect(r.met).toBe(false);
    expect(r.progress).toBeGreaterThan(0);
  });

  it('<= 条件', () => {
    const r = evaluator.evaluate(
      { type: '<=', channel: 'AI-0', value: 40 },
      { 'AI-0': 38 }, now, 0
    );
    expect(r.met).toBe(true);
  });

  it('duration 条件', () => {
    const past = now - 65000; // 65秒前
    const r = evaluator.evaluate(
      { type: 'duration', duration_s: 60 },
      {}, past, 0
    );
    expect(r.met).toBe(true);
    expect(r.progress).toBe(100);
  });

  it('duration 条件未满足', () => {
    const r = evaluator.evaluate(
      { type: 'duration', duration_s: 60 },
      {}, now, 0
    );
    expect(r.met).toBe(false);
  });

  it('accumulated 条件: F₀>=20', () => {
    const r = evaluator.evaluate(
      { type: 'accumulated', value: 20 },
      {}, now, 21
    );
    expect(r.met).toBe(true);
  });

  it('in_band 条件', () => {
    const r = evaluator.evaluate(
      { type: 'in_band', channel: 'AI-0', tolerance: 0.5 },
      { 'AI-0': 37.2, 'AI-0_SV': 37.0 }, now, 0
    );
    expect(r.met).toBe(true);
  });

  it('and 条件: 全部满足', () => {
    const past = now - 65000;
    const r = evaluator.evaluate(
      { type: 'and', sub_conditions: [
        { type: 'in_band', channel: 'AI-0', tolerance: 0.5 },
        { type: 'duration', duration_s: 60 },
      ]},
      { 'AI-0': 37.1, 'AI-0_SV': 37.0 }, past, 0
    );
    expect(r.met).toBe(true);
  });

  it('and 条件: 部分满足', () => {
    const r = evaluator.evaluate(
      { type: 'and', sub_conditions: [
        { type: 'in_band', channel: 'AI-0', tolerance: 0.5 },
        { type: 'duration', duration_s: 60 },
      ]},
      { 'AI-0': 37.1, 'AI-0_SV': 37.0 }, now, 0
    );
    expect(r.met).toBe(false);
  });

  it('or 条件: 一个满足即可', () => {
    const r = evaluator.evaluate(
      { type: 'or', sub_conditions: [
        { type: '>=', channel: 'AI-0', value: 100 },
        { type: 'duration', duration_s: 60 },
      ]},
      { 'AI-0': 110 }, now, 0
    );
    expect(r.met).toBe(true);
  });
});

// ─── 配方校验 ───────────────────────────────────────────────

describe('validateRecipe', () => {
  const baseRecipe: Recipe = {
    recipe_id: 'TEST_V1',
    name: 'Test Recipe',
    version: '1.0.0',
    author: 'test',
    target_organism: 'E.coli',
    vessel: {
      id: 'F01', working_volume_L: 5, total_volume_L: 16, tare_weight_kg: 12.5,
      agitation_range_rpm: [50, 1200],
    },
    phases: [
      { phase_id: 'PREP', type: 'prepare' },
      { phase_id: 'SIP', type: 'sip', params: { target_temp_C: 121, hold_time_min: 20, cool_to_C: 40 } },
    ],
  };

  it('合法配方通过', () => {
    const r = validateRecipe(baseRecipe);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('BV-01: phase_id重复', () => {
    const recipe = {
      ...baseRecipe,
      phases: [
        { phase_id: 'DUP', type: 'prepare' as const },
        { phase_id: 'DUP', type: 'sip' as const },
      ],
    };
    const r = validateRecipe(recipe);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'BV-01')).toBe(true);
  });

  it('BV-02: 工作容积>=全容积', () => {
    const recipe = {
      ...baseRecipe,
      vessel: { ...baseRecipe.vessel, working_volume_L: 20, total_volume_L: 16 },
    };
    const r = validateRecipe(recipe);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'BV-02')).toBe(true);
  });

  it('BV-06: SIP温度<100°C', () => {
    const recipe = {
      ...baseRecipe,
      phases: [{ phase_id: 'SIP', type: 'sip' as const, params: { target_temp_C: 90 } }],
    };
    const r = validateRecipe(recipe);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'BV-06')).toBe(true);
  });

  it('BV-12: 发酵时长=0', () => {
    const recipe = {
      ...baseRecipe,
      phases: [{ phase_id: 'FERM', type: 'fermentation' as const, params: { duration_h: 0 } }],
    };
    const r = validateRecipe(recipe);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'BV-12')).toBe(true);
  });

  it('空phases拒绝', () => {
    const recipe = { ...baseRecipe, phases: [] };
    const r = validateRecipe(recipe);
    expect(r.valid).toBe(false);
  });
});

// ─── StepEngine ─────────────────────────────────────────────

describe('StepEngine', () => {
  it('prepare Phase 有5步', () => {
    const engine = new StepEngine('prepare', 0, 'PREP');
    expect(engine.totalSteps).toBe(5);
    expect(engine.currentStep).toBe(1);
    expect(engine.currentStepName).toBe('阀门归位');
  });

  it('duration条件步骤: 时间到后推进', () => {
    const engine = new StepEngine('prepare', 0, 'PREP');
    // 模拟10秒过去 (Step1 duration=10s)
    // 需要hack stepStartTime
    (engine as any).stepStartTime = Date.now() - 11000;
    const result = engine.evaluate({});
    expect(result.action).toBe('step_advanced');
    expect(result.toStep).toBe(2);
  });

  it('所有步骤完成后返回 phase_complete', () => {
    const engine = new StepEngine('prepare', 0, 'PREP');
    // 快速推进所有5步
    for (let i = 0; i < 5; i++) {
      (engine as any).stepStartTime = Date.now() - 100000;
      engine.evaluate({});
    }
    expect(engine.isComplete).toBe(true);
    const result = engine.evaluate({});
    expect(result.action).toBe('phase_complete');
  });

  it('water_fill 注入配方参数', () => {
    const engine = new StepEngine('water_fill', 1, 'FILL', {
      target_weight_kg: 15.5, coarse_offset_kg: 0.3,
    });
    // Step2 粗加水条件应该是 >= 15.2
    const steps = (engine as any).steps;
    expect(steps[1].completion_condition.value).toBeCloseTo(15.2);
    // Step3 精加水条件应该是 >= 15.5
    expect(steps[2].completion_condition.value).toBeCloseTo(15.5);
  });

  it('interrupt 返回日志', () => {
    const engine = new StepEngine('prepare', 0, 'PREP');
    const log = engine.interrupt();
    expect(log).not.toBeNull();
    expect(log!.result).toBe('interrupted');
    expect(log!.step_name).toBe('阀门归位');
  });
});

// ─── RunningFaultMonitor ────────────────────────────────────

describe('RunningFaultMonitor', () => {
  let monitor: RunningFaultMonitor;

  beforeEach(() => {
    monitor = new RunningFaultMonitor();
  });

  it('RF-01: 变频器故障码非零', () => {
    const faults = monitor.check({ VFD_FAULT_CODE: 5 });
    expect(faults.some(f => f.code === 'RF-01')).toBe(true);
  });

  it('RF-06: 罐压>2.5bar', () => {
    const faults = monitor.check({ PRESSURE_PV: 2.8 });
    expect(faults.some(f => f.code === 'RF-06')).toBe(true);
  });

  it('正常值无故障', () => {
    const faults = monitor.check({
      VFD_FAULT_CODE: 0, TEMP_PV: 37, TEMP_SV: 37,
      PH_PV: 7, PH_SV: 7, DO_PV: 30, PRESSURE_PV: 0.5,
    });
    expect(faults).toHaveLength(0);
  });

  it('RF-03: 温度偏差需要持续3min才触发', () => {
    // 第一次检查不应触发
    const faults1 = monitor.check({ TEMP_PV: 40, TEMP_SV: 37 });
    expect(faults1.some(f => f.code === 'RF-03')).toBe(false);
  });

  it('reset 清除计时器', () => {
    monitor.check({ TEMP_PV: 40, TEMP_SV: 37 });
    monitor.reset();
    // reset后重新开始计时
    const faults = monitor.check({ TEMP_PV: 40, TEMP_SV: 37 });
    expect(faults.some(f => f.code === 'RF-03')).toBe(false);
  });
});
