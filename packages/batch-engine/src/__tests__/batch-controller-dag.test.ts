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
