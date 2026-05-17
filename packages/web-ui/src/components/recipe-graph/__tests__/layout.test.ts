import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { applyDagreLayout } from '../layout';

// SP-RG-3 (M-2): start/end render as 56×56 circles. Before the fix the layout
// code subtracted 90/40 from the dagre centre for ALL nodes, shifting round
// nodes 34–50px off centre. After the fix, round nodes get their own 28/28
// half-extent so the visual centre matches the dagre-computed centre.
describe('layout centering (SP-RG-3 M-2)', () => {
  it('rectangle phase node: position = centre - 90/-40', () => {
    const nodes: Node[] = [
      { id: 'p1', type: 'phase', position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [];
    const out = applyDagreLayout(nodes, edges);
    const p = out.nodes[0]!.position;
    const cx = p.x + 90;
    const cy = p.y + 40;
    expect(Number.isFinite(cx)).toBe(true);
    expect(Number.isFinite(cy)).toBe(true);
    expect(cx).toBeGreaterThanOrEqual(90);
    expect(cy).toBeGreaterThanOrEqual(40);
  });

  it('round start/end node: position = centre - 28/-28 (NOT 90/40)', () => {
    const nodes: Node[] = [
      { id: 's', type: 'start', position: { x: 0, y: 0 }, data: {} },
      { id: 'p', type: 'phase', position: { x: 0, y: 0 }, data: {} },
      { id: 'e', type: 'end', position: { x: 0, y: 0 }, data: {} },
    ];
    const edges: Edge[] = [
      { id: 'sp', source: 's', target: 'p' },
      { id: 'pe', source: 'p', target: 'e' },
    ];
    const out = applyDagreLayout(nodes, edges);
    const s = out.nodes.find((n) => n.id === 's')!;
    const p = out.nodes.find((n) => n.id === 'p')!;
    const e = out.nodes.find((n) => n.id === 'e')!;

    // Vertical centres should align (all on rank 0 in an LR layout).
    const sCentreY = s.position.y + 28;
    const pCentreY = p.position.y + 40;
    const eCentreY = e.position.y + 28;
    expect(Math.abs(sCentreY - pCentreY)).toBeLessThan(1);
    expect(Math.abs(eCentreY - pCentreY)).toBeLessThan(1);
  });
});
