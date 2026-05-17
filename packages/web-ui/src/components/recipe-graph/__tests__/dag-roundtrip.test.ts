import { describe, it, expect } from 'vitest';
import { dagToFlow, flowToDag, type RecipeDAG } from '../RecipeGraphEditor';

describe('recipe-graph dag <-> flow round-trip', () => {
  it('SP-RG-1 H-2: branch node default_branch is preserved across flowToDag', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [
        { id: 'b1', type: 'branch', expression: 'OD600 >= 5', default_branch: 'true' },
      ],
      edges: [],
    };
    const flow = dagToFlow(dag);
    expect((flow.nodes[0]!.data as any).default_branch).toBe('true');

    const round = flowToDag(flow.nodes, flow.edges);
    const branch = round.nodes.find((n) => n.id === 'b1')!;
    expect(branch.default_branch).toBe('true');
    expect(branch.expression).toBe('OD600 >= 5');
  });

  it('SP-RG-1 H-2: default_branch=false also round-trips', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [
        { id: 'b2', type: 'branch', expression: 'pH < 7', default_branch: 'false' },
      ],
      edges: [],
    };
    const flow = dagToFlow(dag);
    const round = flowToDag(flow.nodes, flow.edges);
    expect(round.nodes[0]!.default_branch).toBe('false');
  });

  it('SP-RG-1 H-2: omitted default_branch stays omitted (no false coercion)', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [
        { id: 'b3', type: 'branch', expression: 'TRUE' },
      ],
      edges: [],
    };
    const flow = dagToFlow(dag);
    const round = flowToDag(flow.nodes, flow.edges);
    expect(round.nodes[0]!.default_branch).toBeUndefined();
  });

  it('non-branch nodes never carry default_branch (immune to bad data on phase/goto/loop)', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [
        { id: 'p1', type: 'phase', phase_id: 'heat', label: 'Heat to 37' },
      ],
      edges: [],
    };
    const flow = dagToFlow(dag);
    const round = flowToDag(flow.nodes, flow.edges);
    expect(round.nodes[0]!.default_branch).toBeUndefined();
  });

  it('SP-RG-2 H-3: loop node with maxIterations=0 is stripped (matches BV-22 server guard)', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [
        { id: 'l1', type: 'loop', exitExpression: 'done', maxIterations: 0 },
      ],
      edges: [],
    };
    const flow = dagToFlow(dag);
    const round = flowToDag(flow.nodes, flow.edges);
    const loop = round.nodes.find((n) => n.id === 'l1')!;
    expect(loop.maxIterations).toBeUndefined();
    expect(loop.exitExpression).toBe('done');
  });

  it('SP-RG-2 H-3: loop node with maxIterations=5 still round-trips (positive ints preserved)', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [
        { id: 'l2', type: 'loop', maxIterations: 5 },
      ],
      edges: [],
    };
    const flow = dagToFlow(dag);
    const round = flowToDag(flow.nodes, flow.edges);
    expect(round.nodes[0]!.maxIterations).toBe(5);
  });

  it('SP-RG-2 H-3: negative maxIterations also stripped (defense-in-depth, server rejects too)', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [
        { id: 'l3', type: 'loop', exitExpression: 'done', maxIterations: -1 },
      ],
      edges: [],
    };
    const flow = dagToFlow(dag);
    const round = flowToDag(flow.nodes, flow.edges);
    expect(round.nodes[0]!.maxIterations).toBeUndefined();
  });

  it('SP-RG-2 H-4: flowToDag emits options._hasLayout=true so reload skips auto-layout', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [
        { id: 'p1', type: 'phase', phase_id: 'heat' },
      ],
      edges: [],
    };
    const flow = dagToFlow(dag);
    const round = flowToDag(flow.nodes, flow.edges);
    expect(round.options?._hasLayout).toBe(true);
  });

  it('SP-RG-2 H-4: flowToDag preserves prevOptions (e.g. maxRevisits) while setting _hasLayout', () => {
    const dag: RecipeDAG = {
      schema_version: 2,
      nodes: [{ id: 'p1', type: 'phase', phase_id: 'heat' }],
      edges: [],
      options: { maxRevisits: 7 },
    };
    const flow = dagToFlow(dag);
    const round = flowToDag(flow.nodes, flow.edges, dag.options);
    expect(round.options?.maxRevisits).toBe(7);
    expect(round.options?._hasLayout).toBe(true);
  });
});
