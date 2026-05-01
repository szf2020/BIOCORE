import { describe, it, expect } from 'vitest';
import { DAGExecutor, linearToDag, type RecipeDAG, type DAGEvalContext } from '../dag-executor';

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

describe('linearToDag', () => {
  it('converts empty phases to start→end', () => {
    const dag = linearToDag([]);
    expect(dag.schema_version).toBe(2);
    expect(dag.nodes).toHaveLength(2);
    expect(dag.nodes[0].type).toBe('start');
    expect(dag.nodes[0].id).toBe('n_start');
    expect(dag.nodes[1].type).toBe('end');
    expect(dag.nodes[1].id).toBe('n_end');
    expect(dag.edges).toHaveLength(1);
  });

  it('converts 3 phases to start→p0→p1→p2→end', () => {
    const dag = linearToDag([
      { type: 'fermentation', phase_id: 'P0', params: {} } as any,
      { type: 'fermentation', phase_id: 'P1', params: {} } as any,
      { type: 'feeding', phase_id: 'P2', params: {} } as any,
    ]);
    const phaseNodes = dag.nodes.filter(n => n.type === 'phase');
    expect(phaseNodes.map(n => n.id)).toEqual(['n_0', 'n_1', 'n_2']);
    expect(dag.edges).toHaveLength(4); // start→p0, p0→p1, p1→p2, p2→end
    expect(dag.nodes[0].id).toBe('n_start');
    expect(dag.nodes[dag.nodes.length - 1].id).toBe('n_end');
  });
});
