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
  validateDag,
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

// ─── B1.3 Goto validateDag rules (BV-18..BV-21) ──────────────

describe('validateDag — B1.3 Goto rules', () => {
  // Helper: build a minimally-valid DAG with a goto in the middle.
  function makeGotoDag(opts: {
    gotoOutEdges?: number;       // override out-edge count (default 1)
    gotoTarget?: string;         // override goto.target (default 'c')
    targetNodeType?: string;     // override the target node's type
    targetNodeId?: string;       // override target node id (for "unknown id" tests)
  } = {}) {
    const targetId = opts.targetNodeId ?? 'c';
    const targetType = opts.targetNodeType ?? 'phase';
    const gotoTarget = opts.gotoTarget ?? targetId;
    const gotoEdgeCount = opts.gotoOutEdges ?? 1;

    const nodes: any[] = [
      { id: 's', type: 'start' },
      { id: 'a', type: 'phase' },
      { id: 'g', type: 'goto', target: gotoTarget },
      { id: targetId, type: targetType },
      { id: 'e', type: 'end' },
    ];
    const edges: any[] = [
      { id: 'e1', from: 's', to: 'a' },
      { id: 'e2', from: 'a', to: 'g' },
    ];
    if (gotoEdgeCount >= 1) edges.push({ id: 'e3', from: 'g', to: targetId });
    if (gotoEdgeCount >= 2) edges.push({ id: 'e3b', from: 'g', to: 'e' }); // extra
    edges.push({ id: 'e4', from: targetId, to: 'e' });
    return { nodes, edges };
  }

  it('BV-18: goto with 0 out-edges → invalid', () => {
    const dag = makeGotoDag({ gotoOutEdges: 0 });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-18')).toBe(true);
  });

  it('BV-18: goto with 2 out-edges → invalid', () => {
    const dag = makeGotoDag({ gotoOutEdges: 2 });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-18')).toBe(true);
  });

  it('BV-19: goto.target not equal to its out-edge.to → invalid', () => {
    const dag = makeGotoDag({ gotoTarget: 'a' }); // edge points to 'c', target says 'a'
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-19')).toBe(true);
  });

  it('BV-20: goto.target = a start node id → invalid', () => {
    // goto's target is 's' (start); also wire its edge to 's' so BV-19 is satisfied.
    const dag = {
      nodes: [
        { id: 's', type: 'start' },
        { id: 'a', type: 'phase' },
        { id: 'g', type: 'goto', target: 's' },
        { id: 'e', type: 'end' },
      ],
      edges: [
        { id: 'e1', from: 's', to: 'a' },
        { id: 'e2', from: 'a', to: 'g' },
        { id: 'e3', from: 'g', to: 's' },
        { id: 'e4', from: 'a', to: 'e' },
      ],
    };
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-20')).toBe(true);
  });

  it('BV-21: goto.target = unknown node id → invalid', () => {
    const dag = makeGotoDag({ gotoTarget: 'nope_does_not_exist' });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-21')).toBe(true);
  });

  it('valid: goto into a phase node passes (with maxRevisits-eligible cycle suppressed in BV-15)', () => {
    // start → a → g(target=a) — goto's edge intentionally creates a cycle
    // but BV-15 ignores goto's out-edges so it should NOT flag a cycle.
    const dag = {
      nodes: [
        { id: 's', type: 'start' },
        { id: 'a', type: 'phase' },
        { id: 'g', type: 'goto', target: 'a' },
        { id: 'e', type: 'end' },
      ],
      edges: [
        { id: 'e1', from: 's', to: 'a' },
        { id: 'e2', from: 'a', to: 'g' },
        { id: 'e3', from: 'g', to: 'a' }, // back-edge, suppressed in BV-15
        // Provide a path to end so the DAG is well-formed
        { id: 'e4', from: 'a', to: 'e' },
      ],
    };
    const issues = validateDag(dag);
    // No goto-related errors
    expect(issues.some(i => ['BV-18', 'BV-19', 'BV-20', 'BV-21'].includes(i.code))).toBe(false);
    // No spurious BV-15 cycle (goto's back-edge is intentionally excluded)
    expect(issues.some(i => i.code === 'BV-15')).toBe(false);
  });

  it('valid: goto reachability is honored by BV-16 (target via goto only is reachable)', () => {
    // start → g → c → end ; the only path to c is via goto.
    const dag = {
      nodes: [
        { id: 's', type: 'start' },
        { id: 'g', type: 'goto', target: 'c' },
        { id: 'c', type: 'phase' },
        { id: 'e', type: 'end' },
      ],
      edges: [
        { id: 'e1', from: 's', to: 'g' },
        { id: 'e2', from: 'g', to: 'c' },
        { id: 'e3', from: 'c', to: 'e' },
      ],
    };
    const issues = validateDag(dag);
    // BV-16 reachability must include goto's outgoing edge
    expect(issues.some(i => i.code === 'BV-16')).toBe(false);
  });
});

// ─── B1.2 Loop validateDag rules (BV-22..BV-25) ──────────────

describe('validateDag — B1.2 Loop rules', () => {
  /**
   * Helper: build a minimal DAG containing a single loop with a configurable
   * body subgraph. The default produces a valid loop:
   *   start → loop --body--> body → loop (back-edge)
   *   loop --exit--> end
   */
  function makeLoopDag(opts: {
    exitExpression?: string;
    maxIterations?: number;
    omitExitExpression?: boolean;
    omitMaxIterations?: boolean;
    outEdges?: Array<{ id?: string; to?: string; label?: string }>;
    omitBackEdge?: boolean;
    nestedLoopInBody?: boolean;
  } = {}) {
    const loopNode: any = { id: 'lp', type: 'loop' };
    if (!opts.omitExitExpression && opts.exitExpression !== undefined) {
      loopNode.exitExpression = opts.exitExpression;
    }
    if (!opts.omitMaxIterations && opts.maxIterations !== undefined) {
      loopNode.maxIterations = opts.maxIterations;
    }

    const nodes: any[] = [
      { id: 's', type: 'start' },
      loopNode,
      { id: 'body', type: 'phase' },
      { id: 'e', type: 'end' },
    ];
    if (opts.nestedLoopInBody) {
      nodes.push({ id: 'lp2', type: 'loop', maxIterations: 3 });
      nodes.push({ id: 'inner', type: 'phase' });
    }

    const edges: any[] = [
      { id: 'e1', from: 's', to: 'lp' },
    ];

    // Default loop out-edges (body + exit) unless caller overrides.
    if (opts.outEdges) {
      opts.outEdges.forEach((eo, idx) => {
        edges.push({
          id: eo.id ?? `lp_out_${idx}`,
          from: 'lp',
          to: eo.to ?? 'body',
          label: eo.label,
        });
      });
    } else {
      edges.push({ id: 'e_body', from: 'lp', to: 'body', label: 'body' });
      edges.push({ id: 'e_exit', from: 'lp', to: 'e', label: 'exit' });
    }

    if (opts.nestedLoopInBody) {
      // body → lp2(loop) --body--> inner --back--> lp2 ; lp2 --exit--> lp (back to outer)
      edges.push({ id: 'e_b_lp2', from: 'body', to: 'lp2' });
      edges.push({ id: 'e_lp2_body', from: 'lp2', to: 'inner', label: 'body' });
      edges.push({ id: 'e_inner_back', from: 'inner', to: 'lp2' });
      edges.push({ id: 'e_lp2_exit', from: 'lp2', to: 'lp', label: 'exit' });
    } else if (!opts.omitBackEdge) {
      edges.push({ id: 'e_back', from: 'body', to: 'lp' });
    } else {
      // No back-edge: terminate body at end so reachability passes.
      edges.push({ id: 'e_body_end', from: 'body', to: 'e' });
    }

    return { nodes, edges };
  }

  it('BV-22: loop with neither exitExpression nor maxIterations → error', () => {
    const dag = makeLoopDag({ omitExitExpression: true, omitMaxIterations: true });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-22')).toBe(true);
  });

  it('BV-22: loop with only maxIterations(>0) → ok', () => {
    const dag = makeLoopDag({ maxIterations: 5 });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-22')).toBe(false);
  });

  it('BV-22: loop with only exitExpression → ok', () => {
    const dag = makeLoopDag({ exitExpression: 'OD600 >= 5' });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-22')).toBe(false);
  });

  it('BV-22: loop with maxIterations=0 → error (must be > 0)', () => {
    const dag = makeLoopDag({ maxIterations: 0 });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-22')).toBe(true);
  });

  it('BV-23: loop with 1 out-edge → error', () => {
    const dag = makeLoopDag({
      maxIterations: 5,
      outEdges: [{ id: 'lp_only', to: 'body', label: 'body' }],
    });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-23')).toBe(true);
  });

  it('BV-23: loop with 3 out-edges → error', () => {
    const dag = makeLoopDag({
      maxIterations: 5,
      outEdges: [
        { id: 'lp_a', to: 'body', label: 'body' },
        { id: 'lp_b', to: 'e', label: 'exit' },
        { id: 'lp_c', to: 'e', label: 'extra' },
      ],
    });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-23')).toBe(true);
  });

  it('BV-23: loop with 2 out-edges but both labeled body → error', () => {
    const dag = makeLoopDag({
      maxIterations: 5,
      outEdges: [
        { id: 'lp_a', to: 'body', label: 'body' },
        { id: 'lp_b', to: 'e', label: 'body' },
      ],
    });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-23')).toBe(true);
  });

  it('BV-23: loop with 2 out-edges missing exit label → error', () => {
    const dag = makeLoopDag({
      maxIterations: 5,
      outEdges: [
        { id: 'lp_a', to: 'body', label: 'body' },
        { id: 'lp_b', to: 'e', label: 'true' }, // wrong label
      ],
    });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-23')).toBe(true);
  });

  it('BV-24: nested loop in body subgraph → error', () => {
    const dag = makeLoopDag({ maxIterations: 5, nestedLoopInBody: true });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-24')).toBe(true);
  });

  it('BV-25: loop without back-edge → error', () => {
    const dag = makeLoopDag({ maxIterations: 5, omitBackEdge: true });
    const issues = validateDag(dag);
    expect(issues.some(i => i.code === 'BV-25')).toBe(true);
  });

  it('valid: loop with body+back-edge+exit and BV-15 does not flag the cycle', () => {
    const dag = makeLoopDag({ maxIterations: 5, exitExpression: 'OD600 >= 5' });
    const issues = validateDag(dag);
    // No loop-rule errors
    expect(issues.some(i => ['BV-22', 'BV-23', 'BV-24', 'BV-25'].includes(i.code))).toBe(false);
    // No spurious BV-15 cycle (loop's back-edge is intentionally excluded)
    expect(issues.some(i => i.code === 'BV-15')).toBe(false);
    // No reachability or branch errors either
    expect(issues.some(i => i.code === 'BV-16')).toBe(false);
    expect(issues.some(i => i.code === 'BV-17')).toBe(false);
  });
});
