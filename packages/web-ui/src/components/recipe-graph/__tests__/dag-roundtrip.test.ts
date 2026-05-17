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
});
