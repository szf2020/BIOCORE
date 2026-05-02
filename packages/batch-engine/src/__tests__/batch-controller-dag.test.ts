// ============================================================
// BatchController DAG runtime regression tests (T9)
//
// Verifies that readyNextPhase() drives phase advancement through
// DAGExecutor — and that for a linear v1 recipe, observable behavior
// (next-phase selection in recipe.phases[] order) is identical to
// the old phaseIndex+1 logic.
// ============================================================

import { describe, it, expect } from 'vitest';
import { BatchController } from '../batch-controller';
import type { Recipe } from '@biocore/types';

/**
 * Minimal plcRead mock that satisfies all interlock checks (IL-01..IL-10):
 * - all PV channels return 0 (>= 0 → pass IL-01)
 * - VFD_FAULT_CODE = 0
 * - STEAM_VALVE_CLOSED / COOL_VALVE_CLOSED / LID_LOCKED = 1
 * - ESTOP = 0
 * - HEARTBEAT alternates so IL-07 sees a change
 * - STEAM_PRESSURE_SW = 1
 */
function makeInterlockSafePlcRead() {
  let hb = 0;
  return async (tag: string): Promise<number> => {
    switch (tag) {
      case 'STEAM_VALVE_CLOSED':
      case 'COOL_VALVE_CLOSED':
      case 'LID_LOCKED':
      case 'STEAM_PRESSURE_SW':
        return 1;
      case 'HEARTBEAT':
        return ++hb;          // changes every read so IL-07 passes
      case 'VFD_FAULT_CODE':
      case 'ESTOP':
      default:
        return 0;             // PVs >= 0 → IL-01 passes
    }
  };
}

function makeCtrl(): BatchController {
  return new BatchController({
    plcRead: makeInterlockSafePlcRead(),
    plcWrite: async () => { /* no-op */ },
    pollIntervalMs: 1_000_000, // effectively disable polling for the test
  });
}

function makeLinearRecipe(): Recipe {
  return {
    recipe_id: 'TEST_LINEAR',
    name: 'Test Linear',
    version: '1.0.0',
    author: 'test',
    target_organism: null,
    execution_mode: 'free',  // free mode: readyNextPhase only marks ready, no auto-launch
    vessel: {
      id: 'V1',
      working_volume_L: 100,
      total_volume_L: 120,
      tare_weight_kg: 50,
    },
    phases: [
      // Two linear phases — linearToDag will produce n_0, n_1
      { phase_id: 'P0', type: 'fermentation' as any, params: {} },
      { phase_id: 'P1', type: 'feeding' as any, params: {} },
    ],
  };
}

describe('BatchController DAG runtime — branch advance (T9)', () => {
  it('advances through linear recipe in original phase order (regression)', async () => {
    const ctrl = makeCtrl();
    const recipe = makeLinearRecipe();

    const res = await ctrl.start(recipe, 'BATCH_T9');
    expect(res.success).toBe(true);

    // After start, DAGExecutor should be parked at the first phase node n_0
    expect(ctrl.currentNodeId).toBe('n_0');

    // Simulate phase 0 completing — invoke the same hook the engine uses
    (ctrl as any).readyNextPhase(0);

    // currentNodeId must advance to n_1 (linear DAG: n_0 → n_1)
    expect(ctrl.currentNodeId).toBe('n_1');

    // And the second PhaseStatus should now be marked 'ready'
    const ps1 = (ctrl as any).phaseStatusesMap.get('n_1');
    expect(ps1).toBeTruthy();
    expect(ps1.state).toBe('ready');

    ctrl.destroy();
  });
});

describe('BatchController DAG runtime — nodeId-based public API (T10)', () => {
  it('startPhase(nodeId) starts the phase by node id', async () => {
    const ctrl = makeCtrl();
    const recipe = makeLinearRecipe();

    const res = await ctrl.start(recipe, 'BATCH_T10');
    expect(res.success).toBe(true);

    // free-mode start: first phase is 'ready' but not yet running.
    // startPhase('n_0') should transition n_0 -> running.
    const r = ctrl.startPhase('n_0');
    expect(r.success).toBe(true);
    expect(ctrl.currentNodeId).toBe('n_0');

    const ps0 = (ctrl as any).phaseStatusesMap.get('n_0');
    expect(ps0.state).toBe('running');

    ctrl.destroy();
  });

  it('currentPhaseNode getter returns the running phase node', async () => {
    const ctrl = makeCtrl();
    const recipe = makeLinearRecipe();

    const res = await ctrl.start(recipe, 'BATCH_T10b');
    expect(res.success).toBe(true);

    ctrl.startPhase('n_0');
    expect(ctrl.currentPhaseNode?.id).toBe('n_0');
    expect(ctrl.currentPhaseNode?.type).toBe('phase');

    ctrl.destroy();
  });
});

describe('BatchController DAG runtime — resumeBatch (T12)', () => {
  it('resumeBatch with savedNodeId restores intermediate phase as running', () => {
    const ctrl = makeCtrl();
    const recipe = {
      recipe_id: 'TEST_T12',
      version: '1.0.0',
      phases: [
        { type: 'fermentation', phase_id: 'P0', params: {} },
        { type: 'feeding', phase_id: 'P1', params: {} },
        { type: 'feeding', phase_id: 'P2', params: {} },
      ],
    };
    ctrl.resumeBatch('B-T12-1', recipe as any, 'n_1');
    expect(ctrl.currentNodeId).toBe('n_1');
    const statuses = (ctrl as any).getPhaseStatuses();
    // Phases sorted by phase_index — n_0 done, n_1 running, n_2 still pending
    expect(statuses[0].state).toBe('completed');
    expect(statuses[1].state).toBe('running');
    expect(statuses[2].state).toBe('pending');
    ctrl.destroy();
  });

  it('resumeBatch with NULL savedNodeId starts from beginning (R1 fallback)', () => {
    const ctrl = makeCtrl();
    const recipe = {
      recipe_id: 'TEST_T12_NULL',
      version: '1.0.0',
      phases: [{ type: 'fermentation', phase_id: 'P0', params: {} }],
    };
    ctrl.resumeBatch('B-T12-2', recipe as any, null);
    expect(ctrl.currentNodeId).toBe('n_0');
    ctrl.destroy();
  });
});

describe('BatchController DAG runtime — branch_evaluated event (T13)', () => {
  // Helper: build a recipe with a v2 DAG containing a single branch node
  // (IF/ELSE between p_a → b → p_t / p_f → end). Uses recipe.dag (schema_version=2)
  // so linearToDagIfNeeded picks the explicit DAG instead of synthesising one.
  function makeBranchRecipe(recipeId: string) {
    return {
      recipe_id: recipeId,
      version: '1.0.0',
      phases: [
        { type: 'fermentation', phase_id: 'A', params: {} },
        { type: 'feeding', phase_id: 'TRUE', params: {} },
        { type: 'feeding', phase_id: 'FALSE', params: {} },
      ],
      dag: {
        schema_version: 2,
        nodes: [
          { id: 's', type: 'start' },
          { id: 'p_a', type: 'phase', phase_id: 'A', phase_type: 'fermentation', params: {} },
          { id: 'b', type: 'branch', expression: 'OD600 > 5' },
          { id: 'p_t', type: 'phase', phase_id: 'TRUE', phase_type: 'feeding', params: {} },
          { id: 'p_f', type: 'phase', phase_id: 'FALSE', phase_type: 'feeding', params: {} },
          { id: 'e', type: 'end' },
        ],
        edges: [
          { id: 'e1', from: 's', to: 'p_a' },
          { id: 'e2', from: 'p_a', to: 'b' },
          { id: 'e3', from: 'b', to: 'p_t', label: 'true' },
          { id: 'e4', from: 'b', to: 'p_f', label: 'false' },
          { id: 'e5', from: 'p_t', to: 'e' },
          { id: 'e6', from: 'p_f', to: 'e' },
        ],
      },
    } as any;
  }

  it('emits branch_evaluated event with PV snapshot and result (T13)', () => {
    const ctrl = makeCtrl();
    // resumeBatch with savedNodeId=p_a parks the executor at the phase before
    // the branch; readyNextPhase() will then advance through the branch node.
    ctrl.resumeBatch('B-T13', makeBranchRecipe('TEST_T13'), 'p_a');
    expect(ctrl.currentNodeId).toBe('p_a');

    // Inject PV so OD600 > 5 evaluates to true
    (ctrl as any).lastSampledPV = { OD600: 6 };

    const events: any[] = [];
    ctrl.on('branch_evaluated', (e) => events.push(e));

    // Trigger advance from p_a — should traverse branch node b and land on p_t.
    (ctrl as any).readyNextPhase(0);

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].expression).toBe('OD600 > 5');
    expect(events[0].result).toBe(true);
    expect(events[0].pv_snapshot.OD600).toBe(6);
    expect(events[0].skipped).toBe(false);
    expect(events[0].node_id).toBe('b');
    // And the executor should have landed on p_t (true branch)
    expect(ctrl.currentNodeId).toBe('p_t');

    ctrl.destroy();
  });

  it('emits branch_evaluated when PV missing — eval returns false silently, lands on false branch (T13)', () => {
    const ctrl = makeCtrl();
    ctrl.resumeBatch('B-T13-MISS', makeBranchRecipe('TEST_T13_MISS'), 'p_a');

    // No PV — OD600 missing. condition-evaluator returns false silently
    // (does not throw), so result=false, skipped=false, branch falls to p_f.
    const events: any[] = [];
    ctrl.on('branch_evaluated', (e) => events.push(e));

    (ctrl as any).readyNextPhase(0);

    expect(events.length).toBeGreaterThanOrEqual(1);
    const ev = events[0];
    expect(ev.expression).toBe('OD600 > 5');
    expect(ev.result).toBe(false);
    expect(ev.skipped).toBe(false);
    expect(ev.node_id).toBe('b');
    // PV snapshot still includes phase_elapsed_min even when sampled PV empty
    expect(ev.pv_snapshot).toBeDefined();
    // Executor lands on the false branch
    expect(ctrl.currentNodeId).toBe('p_f');

    ctrl.destroy();
  });
});

// ============================================================
// v1.7.1 stability patch — lastSampledPV wiring regression
//
// Before v1.7.1, BatchController.lastSampledPV was a placeholder
// commented as "(this as any).lastSampledPV ?? {}" and never
// actually populated. Branches in production always saw an empty
// PV map and fell through default_branch. v1.7.1 wires it from
// tickInternal after every successful readProcessValues().
// ============================================================
describe('BatchController — v1.7.1 lastSampledPV wiring', () => {
  it('readProcessValues populates user-facing aliases (temperature/pH/DO/weight) for branches', async () => {
    // plcRead mock that returns TEMP_PV=38 plus all interlock-safe values
    let hb = 0;
    const plcRead = async (tag: string): Promise<number> => {
      switch (tag) {
        case 'STEAM_VALVE_CLOSED':
        case 'COOL_VALVE_CLOSED':
        case 'LID_LOCKED':
        case 'STEAM_PRESSURE_SW':
          return 1;
        case 'HEARTBEAT': return ++hb;
        case 'TEMP_PV': return 38;
        case 'PH_PV': return 6.8;
        case 'DO_PV': return 45;
        case 'WEIGHT_PV': return 95;
        default:
          return 0;
      }
    };

    const ctrl = new BatchController({
      plcRead,
      plcWrite: async () => { /* no-op */ },
      pollIntervalMs: 1_000_000,
    });

    const recipe = {
      recipe_id: 'TEST_PV_WIRING',
      version: '1.0.0',
      phases: [{ type: 'fermentation', phase_id: 'P0', params: {} }],
    } as any;

    ctrl.resumeBatch('B-PV-1', recipe, 'n_0');
    // Pre-tick: lastSampledPV is the empty default
    expect((ctrl as any).lastSampledPV).toEqual({});

    // Simulate one tick's PV read step (tickInternal does this then writes the field)
    const sampled = await (ctrl as any).readProcessValues();
    (ctrl as any).lastSampledPV = sampled;

    // Aliases are populated alongside the raw PLC tag names
    expect((ctrl as any).lastSampledPV.temperature).toBe(38);
    expect((ctrl as any).lastSampledPV.pH).toBe(6.8);
    expect((ctrl as any).lastSampledPV.DO).toBe(45);
    expect((ctrl as any).lastSampledPV.weight).toBe(95);

    // Verify buildEvalContext now exposes those PVs to branch expressions
    const ctx = (ctrl as any).buildEvalContext();
    expect(ctx.evaluateExpression('temperature > 37')).toBe(true);
    expect(ctx.evaluateExpression('pH < 7')).toBe(true);
    expect(ctx.evaluateExpression('DO >= 40')).toBe(true);

    ctrl.destroy();
  });
});

// ============================================================
// v1.8.0 bucket 3 — perf fixes
// ============================================================

describe('v1.8.0 bucket 3 perf fix 1 — readProcessValues parallelism', () => {
  it('reads all 12 PLC tags in parallel, not serially', async () => {
    // Each plcRead intentionally blocks for 10ms. Serial 12 reads = ~120ms;
    // parallel = ~10-15ms. We assert under 50ms which gives enough slack
    // for slow CI machines while still proving parallelism.
    const READ_DELAY_MS = 10;
    let inFlight = 0;
    let maxInFlight = 0;
    const plcRead = async (_tag: string): Promise<number> => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, READ_DELAY_MS));
      inFlight--;
      return 42;
    };

    const ctrl = new BatchController({
      plcRead,
      plcWrite: async () => { /* no-op */ },
      pollIntervalMs: 1_000_000,
    });

    const t0 = Date.now();
    const pv = await (ctrl as any).readProcessValues();
    const elapsedMs = Date.now() - t0;

    // Sanity: all 12 raw PLC tags + the 10 aliases (AI-0..6 + temperature/pH/DO/weight)
    expect(pv['TEMP_PV']).toBe(42);
    expect(pv['VFD_FAULT_CODE']).toBe(42);
    expect(pv['temperature']).toBe(42);

    // Parallel: completes in ~10-15ms, not 120ms
    expect(elapsedMs).toBeLessThan(50);
    // And we observed multiple reads in flight at the same time
    expect(maxInFlight).toBeGreaterThan(1);

    ctrl.destroy();
  });

  it('preserves silent-skip semantics when one PLC tag throws', async () => {
    const plcRead = async (tag: string): Promise<number> => {
      if (tag === 'PH_PV') throw new Error('mock PLC fault');
      return 7;
    };

    const ctrl = new BatchController({
      plcRead,
      plcWrite: async () => { /* no-op */ },
      pollIntervalMs: 1_000_000,
    });

    const pv = await (ctrl as any).readProcessValues();

    // PH_PV missing (silent-skip), other tags still populated
    expect(pv['PH_PV']).toBeUndefined();
    expect(pv['TEMP_PV']).toBe(7);
    expect(pv['DO_PV']).toBe(7);

    ctrl.destroy();
  });
});

// ============================================================
// B1.3 Goto nodes — BatchController forwards recipe.options.maxRevisits
// to DAGExecutor on both start() and resumeBatch()
// ============================================================
describe('B1.3 — BatchController forwards recipe.dag.options.maxRevisits', () => {
  function makeGotoCycleRecipe(maxRevisits?: number) {
    // DAG: s → a → g(target=a)  with extra edge a → e so 'e' is reachable.
    // Branching at 'a' is OK because executor takes the first out-edge (a → g);
    // the 'a → e' edge only exists to satisfy BV-16 reachability.
    return {
      recipe_id: 'TEST_B13',
      version: '1.0.0',
      execution_mode: 'free',
      vessel: { id: 'V1', working_volume_L: 5, total_volume_L: 16, tare_weight_kg: 12 },
      phases: [
        { phase_id: 'A', type: 'fermentation', params: {} },
      ],
      dag: {
        schema_version: 2,
        ...(maxRevisits !== undefined ? { options: { maxRevisits } } : {}),
        nodes: [
          { id: 's', type: 'start' },
          { id: 'a', type: 'phase', phase_id: 'A', phase_type: 'fermentation', params: {} },
          { id: 'g', type: 'goto', target: 'a' },
          { id: 'e', type: 'end' },
        ],
        edges: [
          { id: 'e1', from: 's', to: 'a' },
          { id: 'e2', from: 'a', to: 'g' },
          { id: 'e3', from: 'g', to: 'a' },
          { id: 'e4', from: 'a', to: 'e' }, // ensures end is reachable for BV-16
        ],
      },
    } as any;
  }

  it('start() default maxRevisits=1 keeps acyclic-only behavior', async () => {
    const ctrl = makeCtrl();
    const recipe = makeGotoCycleRecipe(); // no options.maxRevisits
    const r = await ctrl.start(recipe, 'B-B13-1');
    expect(r.success).toBe(true);
    // The DAGExecutor was constructed with maxRevisits=1
    const exec = (ctrl as any).dagExecutor;
    expect(exec).toBeTruthy();
    // First a is visited; advancing once moves to g; advancing again would
    // try to revisit a and throw under the default limit.
    expect((ctrl as any).currentNodeId).toBe('a');
    exec.advance();
    expect(exec.getCurrentNode()?.id).toBe('g');
    expect(() => exec.advance()).toThrow(/MaxRevisitsExceeded/);
    ctrl.destroy();
  });

  it('start() honors recipe.dag.options.maxRevisits=4', async () => {
    const ctrl = makeCtrl();
    const recipe = makeGotoCycleRecipe(4);
    const r = await ctrl.start(recipe, 'B-B13-2');
    expect(r.success).toBe(true);
    const exec = (ctrl as any).dagExecutor;
    // a count = 1, g count = 0
    expect((ctrl as any).currentNodeId).toBe('a');
    // a → g → a → g → a → g → a (4 visits to 'a' total)
    exec.advance(); exec.advance(); // a → g → a (a=2)
    exec.advance(); exec.advance(); // a → g → a (a=3)
    exec.advance(); exec.advance(); // a → g → a (a=4)
    expect(exec.getCurrentNode()?.id).toBe('a');
    // Next a → g → would push a count to 5, exceeding limit=4
    exec.advance(); // a → g
    expect(exec.getCurrentNode()?.id).toBe('g');
    expect(() => exec.advance()).toThrow(/MaxRevisitsExceeded.*maxRevisits=4/);
    ctrl.destroy();
  });

  it('resumeBatch also honors recipe.dag.options.maxRevisits', () => {
    const ctrl = makeCtrl();
    const recipe = makeGotoCycleRecipe(3);
    ctrl.resumeBatch('B-B13-3', recipe, 'a');
    const exec = (ctrl as any).dagExecutor;
    expect(exec).toBeTruthy();
    // After resume, executor is at start (executor.start() was called); manually
    // walk to verify the 3-revisit limit applies on the resumed executor too.
    expect(exec.getCurrentNode()?.id).toBe('a');
    exec.advance(); exec.advance(); // → g → a (a=2)
    exec.advance(); exec.advance(); // → g → a (a=3)
    exec.advance(); // → g
    expect(() => exec.advance()).toThrow(/MaxRevisitsExceeded.*maxRevisits=3/);
    ctrl.destroy();
  });
});

describe('v1.8.0 bucket 3 perf fix 2 — phaseStatuses getter memoization', () => {
  it('caches the sorted array between reads and only rebuilds after Map mutation', async () => {
    const ctrl = makeCtrl();
    const recipe = makeLinearRecipe();
    await ctrl.start(recipe, 'BATCH_PERF_2');

    // Two reads back-to-back must return the SAME array reference (cache hit)
    const first = (ctrl as any).phaseStatuses;
    const second = (ctrl as any).phaseStatuses;
    expect(first).toBe(second);

    // Manually invalidate (simulating a Map mutation site) → reference must change
    (ctrl as any).invalidatePhaseStatusesCache();
    const third = (ctrl as any).phaseStatuses;
    expect(third).not.toBe(first);

    // But content is identical post-rebuild
    expect(third.map((p: any) => p.phase_id)).toEqual(first.map((p: any) => p.phase_id));

    ctrl.destroy();
  });

  it('in-place value mutations are visible through cached array (shared references)', async () => {
    const ctrl = makeCtrl();
    const recipe = makeLinearRecipe();
    await ctrl.start(recipe, 'BATCH_PERF_2B');

    const arr = (ctrl as any).phaseStatuses;
    const ps0 = arr[0];

    // In-place mutation — does NOT change Map structure, no invalidation needed.
    // The cached array shares the same value reference, so the mutation is visible.
    ps0.state = 'held';
    const arrAgain = (ctrl as any).phaseStatuses;
    expect(arrAgain).toBe(arr); // still cached
    expect(arrAgain[0].state).toBe('held');

    ctrl.destroy();
  });
});
