import { describe, it, expect } from 'vitest';
import { DAGExecutor, type RecipeDAG, type DAGEvalContext } from '../dag-executor';

describe('DAGExecutor default_branch fallback', () => {
  it('uses default_branch when expression evaluation throws (PV missing)', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [
        { id: 's', type: 'start' },
        { id: 'b', type: 'branch', expression: 'OD600 > 5', default_branch: 'true' },
        { id: 'p_true', type: 'phase', phase_id: 'TRUE_PATH', phase_type: 'fermentation' },
        { id: 'p_false', type: 'phase', phase_id: 'FALSE_PATH', phase_type: 'fermentation' },
        { id: 'e', type: 'end' },
      ],
      edges: [
        { id: 'e1', from: 's', to: 'b' },
        { id: 'e2', from: 'b', to: 'p_true', label: 'true' },
        { id: 'e3', from: 'b', to: 'p_false', label: 'false' },
        { id: 'e4', from: 'p_true', to: 'e' },
        { id: 'e5', from: 'p_false', to: 'e' },
      ],
    };
    const exec = new DAGExecutor(dag);
    exec.start();
    const ctx: DAGEvalContext = {
      evaluateExpression: () => { throw new Error('PV OD600 not available'); },
    };
    exec.advance(ctx);
    const node = exec.getCurrentNode();
    expect(node?.id).toBe('p_true');
  });

  it('falls back to false branch when default_branch unset and evaluation throws', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [
        { id: 's', type: 'start' },
        { id: 'b', type: 'branch', expression: 'OD600 > 5' },
        { id: 'p_true', type: 'phase', phase_id: 'TRUE_PATH', phase_type: 'fermentation' },
        { id: 'p_false', type: 'phase', phase_id: 'FALSE_PATH', phase_type: 'fermentation' },
        { id: 'e', type: 'end' },
      ],
      edges: [
        { id: 'e1', from: 's', to: 'b' },
        { id: 'e2', from: 'b', to: 'p_true', label: 'true' },
        { id: 'e3', from: 'b', to: 'p_false', label: 'false' },
        { id: 'e4', from: 'p_true', to: 'e' },
        { id: 'e5', from: 'p_false', to: 'e' },
      ],
    };
    const exec = new DAGExecutor(dag);
    exec.start();
    const ctx: DAGEvalContext = {
      evaluateExpression: () => { throw new Error('PV missing'); },
    };
    exec.advance(ctx);
    expect(exec.getCurrentNode()?.id).toBe('p_false');
  });
});
