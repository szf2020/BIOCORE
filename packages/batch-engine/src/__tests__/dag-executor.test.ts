import { describe, it, expect } from 'vitest';
import {
  DAGExecutor,
  linearToDag,
  type RecipeDAG,
  type DAGEvalContext,
  type LoopFrame,
} from '../dag-executor';

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

// ============================================================================
// v1.10.0 P3: visitCount + LoopFrame stack (frame-stack refactor)
// ============================================================================

describe('DAGExecutor v1.10.0 P3 — visitCount + LoopFrame stack', () => {
  // A reusable cycle-DAG factory: start → A → B (branch) → A (back-edge true) | end (false)
  // Runs branch eval N times: returns true for first (N-1) calls, then false.
  // Each "true" eval re-routes us A → B → A (revisit A and B).
  function makeCycleDag(): RecipeDAG {
    return {
      schema_version: 2,
      nodes: [
        { id: 's', type: 'start' },
        { id: 'a', type: 'phase', phase_id: 'A', phase_type: 'heating' },
        { id: 'b', type: 'branch', expression: 'loop_again' },
        { id: 'e', type: 'end' },
      ],
      edges: [
        { id: 'e1', from: 's', to: 'a' },
        { id: 'e2', from: 'a', to: 'b' },
        { id: 'e3', from: 'b', to: 'a', label: 'true' }, // back-edge
        { id: 'e4', from: 'b', to: 'e', label: 'false' }, // exit
      ],
    };
  }

  describe('visitCount + maxRevisits', () => {
    it('default maxRevisits=1 still blocks revisits (preserves v1.7-v1.9 behavior)', () => {
      const dag = makeCycleDag();
      const exec = new DAGExecutor(dag); // default options
      // ctx returns true: tries to revisit A
      const ctx: DAGEvalContext = { evaluateExpression: () => true };
      exec.start(ctx);
      // First phase A reached
      expect(exec.getCurrentNode()?.id).toBe('a');
      // First advance: A → B (branch, paused for ctx)
      exec.advance(ctx);
      // currentNode is now branch 'b'
      expect(exec.getCurrentNode()?.id).toBe('b');
      // Second advance: B (true) → A (revisit) — must throw under default maxRevisits=1
      expect(() => exec.advance(ctx)).toThrow(/MaxRevisitsExceeded/);
    });

    it('maxRevisits=3 allows 3 visits then throws on 4th', () => {
      const dag = makeCycleDag();
      const exec = new DAGExecutor(dag, { maxRevisits: 3 });
      const ctx: DAGEvalContext = { evaluateExpression: () => true };
      exec.start(ctx);
      // A visit count = 1 after start()
      expect(exec.getCurrentNode()?.id).toBe('a');
      // advance 1: A → B (B count = 1)
      exec.advance(ctx);
      expect(exec.getCurrentNode()?.id).toBe('b');
      // advance 2: B(true) → A (A count = 2)
      exec.advance(ctx);
      expect(exec.getCurrentNode()?.id).toBe('a');
      // advance 3: A → B (B count = 2)
      exec.advance(ctx);
      expect(exec.getCurrentNode()?.id).toBe('b');
      // advance 4: B(true) → A (A count = 3 — at the limit)
      exec.advance(ctx);
      expect(exec.getCurrentNode()?.id).toBe('a');
      // advance 5: A → B (B count = 3 — at the limit)
      exec.advance(ctx);
      expect(exec.getCurrentNode()?.id).toBe('b');
      // advance 6: B(true) → A would push A to count=4, exceeding limit
      expect(() => exec.advance(ctx)).toThrow(/MaxRevisitsExceeded.*'a'.*maxRevisits=3/);
    });

    it('error message includes node id and limit value', () => {
      const dag = makeCycleDag();
      const exec = new DAGExecutor(dag);
      const ctx: DAGEvalContext = { evaluateExpression: () => true };
      exec.start(ctx);
      exec.advance(ctx); // → b
      try {
        exec.advance(ctx); // → a (revisit, throws)
        throw new Error('should have thrown');
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).toMatch(/MaxRevisitsExceeded/);
        expect(msg).toContain("'a'");
        expect(msg).toContain('maxRevisits=1');
      }
    });

    it('start() clears visitCount (re-running same executor is OK)', () => {
      const dag = linearToDag([
        { type: 'heating', phase_id: 'P0' } as any,
        { type: 'fermentation', phase_id: 'P1' } as any,
      ]);
      const exec = new DAGExecutor(dag);
      // Run once to completion
      exec.start();
      while (exec.hasCurrentPhase()) exec.advance();
      expect(exec.isComplete()).toBe(true);
      // Run again — start() must clear visitCount, otherwise this throws
      expect(() => {
        exec.start();
        while (exec.hasCurrentPhase()) exec.advance();
      }).not.toThrow();
      expect(exec.isComplete()).toBe(true);
    });
  });

  describe('LoopFrame stack', () => {
    function makeExecutor(): DAGExecutor {
      const dag = linearToDag([{ type: 'heating', phase_id: 'P0' } as any]);
      return new DAGExecutor(dag);
    }

    it('frameDepth starts at 0 on a fresh executor', () => {
      const exec = makeExecutor();
      expect(exec.frameDepth).toBe(0);
      expect(exec.peekFrame()).toBeUndefined();
      expect(exec.popFrame()).toBeUndefined();
    });

    it('pushFrame/popFrame/peekFrame round-trip', () => {
      const exec = makeExecutor();
      const frame: LoopFrame = { loopNodeId: 'L1', iteration: 0, maxIterations: 5 };
      exec.pushFrame(frame);
      expect(exec.frameDepth).toBe(1);
      const peeked = exec.peekFrame();
      expect(peeked).toEqual(frame);
      // pushFrame should deep-copy: mutating the original must not affect stack state
      frame.iteration = 999;
      expect(exec.peekFrame()?.iteration).toBe(0);
      // pop returns the frame
      const popped = exec.popFrame();
      expect(popped?.loopNodeId).toBe('L1');
      expect(popped?.iteration).toBe(0);
      // second pop returns undefined
      expect(exec.popFrame()).toBeUndefined();
      expect(exec.frameDepth).toBe(0);
    });

    it('supports nested frames (stack semantics)', () => {
      const exec = makeExecutor();
      exec.pushFrame({ loopNodeId: 'outer', iteration: 0 });
      exec.pushFrame({ loopNodeId: 'inner', iteration: 0 });
      expect(exec.frameDepth).toBe(2);
      expect(exec.peekFrame()?.loopNodeId).toBe('inner');
      exec.popFrame();
      expect(exec.frameDepth).toBe(1);
      expect(exec.peekFrame()?.loopNodeId).toBe('outer');
    });

    it('incrementFrameIteration mutates top, throws when empty', () => {
      const exec = makeExecutor();
      // throws on empty stack
      expect(() => exec.incrementFrameIteration()).toThrow(/empty loop stack/);
      // push and increment
      exec.pushFrame({ loopNodeId: 'L1', iteration: 0 });
      expect(exec.incrementFrameIteration()).toBe(1);
      expect(exec.peekFrame()?.iteration).toBe(1);
      expect(exec.incrementFrameIteration()).toBe(2);
      expect(exec.peekFrame()?.iteration).toBe(2);
    });

    it('snapshotFrames / restoreFrames is a deep copy round-trip', () => {
      const exec = makeExecutor();
      exec.pushFrame({ loopNodeId: 'A', iteration: 1, maxIterations: 10 });
      exec.pushFrame({ loopNodeId: 'B', iteration: 5, exitExpression: 'OD > 3' });
      const snapshot = exec.snapshotFrames();
      expect(snapshot).toHaveLength(2);
      expect(snapshot[0].loopNodeId).toBe('A');
      expect(snapshot[1].loopNodeId).toBe('B');
      // mutate snapshot — must not affect executor state
      snapshot[0].iteration = 999;
      expect(exec.peekFrame()?.iteration).toBe(5); // top frame unchanged
      // mutate executor — snapshot stays intact (it's a copy)
      exec.incrementFrameIteration();
      expect(exec.peekFrame()?.iteration).toBe(6);
      expect(snapshot[1].iteration).toBe(5);
      // restore from original snapshot
      exec.restoreFrames(snapshot);
      // After restore, top is B with iteration=5 (mutation to snapshot[0] was on A, not B)
      expect(exec.frameDepth).toBe(2);
      expect(exec.peekFrame()?.iteration).toBe(5);
      expect(exec.peekFrame()?.loopNodeId).toBe('B');
      // verify deep copy: mutating restored stack must not affect snapshot
      exec.incrementFrameIteration();
      expect(snapshot[1].iteration).toBe(5);
    });

    it('start() clears loop frames', () => {
      const dag = linearToDag([{ type: 'heating', phase_id: 'P0' } as any]);
      const exec = new DAGExecutor(dag);
      exec.pushFrame({ loopNodeId: 'L1', iteration: 3 });
      exec.pushFrame({ loopNodeId: 'L2', iteration: 1 });
      expect(exec.frameDepth).toBe(2);
      exec.start();
      expect(exec.frameDepth).toBe(0);
      expect(exec.peekFrame()).toBeUndefined();
    });

    it('reset() clears loop frames', () => {
      const exec = makeExecutor();
      exec.pushFrame({ loopNodeId: 'L1', iteration: 3 });
      expect(exec.frameDepth).toBe(1);
      exec.reset();
      expect(exec.frameDepth).toBe(0);
    });

    it('LoopFrame supports all four shape variants (fixed-N / until / while / time)', () => {
      const exec = makeExecutor();
      // fixed-N
      exec.pushFrame({ loopNodeId: 'fixed', iteration: 0, maxIterations: 10 });
      // repeat-until
      exec.pushFrame({ loopNodeId: 'until', iteration: 0, exitExpression: 'OD > 5' });
      // repeat-while (caller negates the expression in the wire-up)
      exec.pushFrame({ loopNodeId: 'while', iteration: 0, exitExpression: '!(temp > 30)' });
      // time-bounded
      exec.pushFrame({ loopNodeId: 'time', iteration: 0, startedAt: Date.now(), maxDurationMs: 60000 });
      expect(exec.frameDepth).toBe(4);
      const snap = exec.snapshotFrames();
      expect(snap[0].maxIterations).toBe(10);
      expect(snap[1].exitExpression).toBe('OD > 5');
      expect(snap[2].exitExpression).toBe('!(temp > 30)');
      expect(snap[3].maxDurationMs).toBe(60000);
    });
  });

  // ==========================================================================
  // B1.3 Goto nodes (v1.11.0)
  // ==========================================================================
  describe('B1.3 Goto nodes', () => {
    it('goto node passes through to its target on advance', () => {
      // DAG: start → a → goto(target=c) → c → end
      // edges encode the routing; goto.target redundant but matches.
      const dag: RecipeDAG = {
        schema_version: 2,
        nodes: [
          { id: 's', type: 'start' },
          { id: 'a', type: 'phase', phase_id: 'A', phase_type: 'fermentation' },
          { id: 'g', type: 'goto', target: 'c' },
          { id: 'c', type: 'phase', phase_id: 'C', phase_type: 'cooling' },
          { id: 'e', type: 'end' },
        ],
        edges: [
          { id: 'e1', from: 's', to: 'a' },
          { id: 'e2', from: 'a', to: 'g' },
          { id: 'e3', from: 'g', to: 'c' },
          { id: 'e4', from: 'c', to: 'e' },
        ],
      };
      const exec = new DAGExecutor(dag);
      exec.start();
      // After start(), advanceToPhaseOrEnd parks on phase 'a'
      expect(exec.getCurrentNode()?.id).toBe('a');
      exec.advance(); // a → g
      expect(exec.getCurrentNode()?.id).toBe('g');
      exec.advance(); // g → c (pass-through)
      expect(exec.getCurrentNode()?.id).toBe('c');
      exec.advance(); // c → e
      expect(exec.getCurrentNode()?.type).toBe('end');
    });

    it('goto back-edge with default maxRevisits=1 throws on first revisit', () => {
      // Degenerate cycle: start → a → goto(target=a) — second visit to a fails.
      const dag: RecipeDAG = {
        schema_version: 2,
        nodes: [
          { id: 's', type: 'start' },
          { id: 'a', type: 'phase', phase_id: 'A', phase_type: 'heating' },
          { id: 'g', type: 'goto', target: 'a' },
          { id: 'e', type: 'end' },
        ],
        edges: [
          { id: 'e1', from: 's', to: 'a' },
          { id: 'e2', from: 'a', to: 'g' },
          { id: 'e3', from: 'g', to: 'a' }, // back-edge
        ],
      };
      const exec = new DAGExecutor(dag); // default maxRevisits=1
      exec.start();
      expect(exec.getCurrentNode()?.id).toBe('a');
      exec.advance(); // a → g
      expect(exec.getCurrentNode()?.id).toBe('g');
      // g → a would push a to count=2, exceeding maxRevisits=1
      expect(() => exec.advance()).toThrow(/MaxRevisitsExceeded.*'a'.*maxRevisits=1/);
    });

    it('goto back-edge with maxRevisits=3 allows 3 visits then throws', () => {
      // start → a → g(target=a)
      // visits: a(1) → g(1) → a(2) → g(2) → a(3) → g(3) → a(4) THROWS
      const dag: RecipeDAG = {
        schema_version: 2,
        nodes: [
          { id: 's', type: 'start' },
          { id: 'a', type: 'phase', phase_id: 'A', phase_type: 'heating' },
          { id: 'g', type: 'goto', target: 'a' },
          { id: 'e', type: 'end' },
        ],
        edges: [
          { id: 'e1', from: 's', to: 'a' },
          { id: 'e2', from: 'a', to: 'g' },
          { id: 'e3', from: 'g', to: 'a' },
        ],
      };
      const exec = new DAGExecutor(dag, { maxRevisits: 3 });
      exec.start();
      // a count = 1 after start
      expect(exec.getCurrentNode()?.id).toBe('a');
      exec.advance(); // → g, g count = 1
      expect(exec.getCurrentNode()?.id).toBe('g');
      exec.advance(); // → a, a count = 2
      expect(exec.getCurrentNode()?.id).toBe('a');
      exec.advance(); // → g, g count = 2
      expect(exec.getCurrentNode()?.id).toBe('g');
      exec.advance(); // → a, a count = 3 (at limit)
      expect(exec.getCurrentNode()?.id).toBe('a');
      exec.advance(); // → g, g count = 3 (at limit)
      expect(exec.getCurrentNode()?.id).toBe('g');
      // Next would push a to count=4
      expect(() => exec.advance()).toThrow(/MaxRevisitsExceeded.*'a'.*maxRevisits=3/);
    });

    it('passing recipe.options.maxRevisits through DAGExecutor honors override', () => {
      // Verifies the controller-side construction pattern:
      //   new DAGExecutor(dag, { maxRevisits: dag.options?.maxRevisits ?? 1 })
      const dag: RecipeDAG = {
        schema_version: 2,
        options: { maxRevisits: 5 },
        nodes: [
          { id: 's', type: 'start' },
          { id: 'a', type: 'phase', phase_id: 'A', phase_type: 'heating' },
          { id: 'g', type: 'goto', target: 'a' },
          { id: 'e', type: 'end' },
        ],
        edges: [
          { id: 'e1', from: 's', to: 'a' },
          { id: 'e2', from: 'a', to: 'g' },
          { id: 'e3', from: 'g', to: 'a' },
        ],
      };
      const exec = new DAGExecutor(dag, { maxRevisits: dag.options?.maxRevisits ?? 1 });
      exec.start();
      // Walk up to 5 visits of 'a' before throwing
      let aVisits = 1;
      let lastError: Error | null = null;
      for (let i = 0; i < 20; i++) {
        try {
          exec.advance();
        } catch (e) {
          lastError = e as Error;
          break;
        }
        if (exec.getCurrentNode()?.id === 'a') aVisits++;
      }
      expect(lastError?.message).toMatch(/MaxRevisitsExceeded.*maxRevisits=5/);
      // Throws when trying to push a to count=6, so we observed 5 visits to 'a'
      expect(aVisits).toBe(5);
    });

    it('goto with maxRevisits>1 traverses fwd-then-back-edge cycle correctly', () => {
      // More realistic: start → a → b → goto(target=a). Verify b is also visited
      // each cycle, not just a, until limit hits.
      const dag: RecipeDAG = {
        schema_version: 2,
        nodes: [
          { id: 's', type: 'start' },
          { id: 'a', type: 'phase', phase_id: 'A', phase_type: 'heating' },
          { id: 'b', type: 'phase', phase_id: 'B', phase_type: 'fermentation' },
          { id: 'g', type: 'goto', target: 'a' },
        ],
        edges: [
          { id: 'e1', from: 's', to: 'a' },
          { id: 'e2', from: 'a', to: 'b' },
          { id: 'e3', from: 'b', to: 'g' },
          { id: 'e4', from: 'g', to: 'a' },
        ],
      };
      const exec = new DAGExecutor(dag, { maxRevisits: 2 });
      exec.start();
      const visits: string[] = [exec.getCurrentNode()!.id];
      let err: Error | null = null;
      try {
        for (let i = 0; i < 50; i++) {
          exec.advance();
          visits.push(exec.getCurrentNode()!.id);
        }
      } catch (e) {
        err = e as Error;
      }
      expect(err?.message).toMatch(/MaxRevisitsExceeded/);
      // Visited a twice and b twice before erroring on the third a
      expect(visits.filter(v => v === 'a').length).toBe(2);
      expect(visits.filter(v => v === 'b').length).toBe(2);
    });
  });

  describe('backward compatibility', () => {
    it('linear DAG (no loops, no revisits) traverses unchanged', () => {
      const dag = linearToDag([
        { type: 'heating', phase_id: 'A' } as any,
        { type: 'fermentation', phase_id: 'B' } as any,
        { type: 'cooling', phase_id: 'C' } as any,
      ]);
      const exec = new DAGExecutor(dag); // default maxRevisits=1
      exec.start();
      const visited: string[] = [];
      while (exec.hasCurrentPhase()) {
        const p = exec.currentPhase();
        if (p) visited.push(p.phase_id);
        exec.advance();
      }
      expect(visited).toEqual(['A', 'B', 'C']);
      expect(exec.isComplete()).toBe(true);
      expect(exec.frameDepth).toBe(0);
    });

    it('IF/ELSE branch DAG works identically to v1.9 with default options', () => {
      const dag: RecipeDAG = {
        schema_version: 2,
        nodes: [
          { id: 's', type: 'start' },
          { id: 'a', type: 'phase', phase_id: 'A', phase_type: 'heating' },
          { id: 'b', type: 'branch', expression: 'cond' },
          { id: 'c', type: 'phase', phase_id: 'C', phase_type: 'fermentation' },
          { id: 'd', type: 'phase', phase_id: 'D', phase_type: 'cooling' },
          { id: 'e', type: 'end' },
        ],
        edges: [
          { id: 'e1', from: 's', to: 'a' },
          { id: 'e2', from: 'a', to: 'b' },
          { id: 'e3', from: 'b', to: 'c', label: 'true' },
          { id: 'e4', from: 'b', to: 'd', label: 'false' },
          { id: 'e5', from: 'c', to: 'e' },
          { id: 'e6', from: 'd', to: 'e' },
        ],
      };
      const ctxFalse: DAGEvalContext = { evaluateExpression: () => false };
      const exec = new DAGExecutor(dag);
      exec.start(ctxFalse);
      // advance() is single-hop: from a phase it moves to the next node (which
      // may be a branch). The caller is responsible for stepping through branch
      // nodes — same pattern as BatchController.readyNextPhase. Walk until end.
      const path: string[] = [];
      let cur = exec.getCurrentNode();
      while (cur && cur.type !== 'end') {
        if (cur.type === 'phase') path.push((cur as any).phase_id);
        if (!exec.advance(ctxFalse)) break;
        cur = exec.getCurrentNode();
      }
      expect(path).toEqual(['A', 'D']);
      expect(exec.isComplete()).toBe(true);
    });
  });
});
