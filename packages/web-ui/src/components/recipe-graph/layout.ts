// layout.ts — dagre 自动布局 (M3.7)
import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
// SP-RG-3 (M-2): start/end render as 56×56 circles; without their own
// half-extent the previous 90/40 offset shifted them 34–50px off centre.
const ROUND_NODE_SIZE = 56;

/**
 * 用 dagre 对 nodes/edges 做 LR 方向自动布局。
 * 返回新 nodes (含 position) + edges 不变。
 */
export function applyDagreLayout(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 100 });

  nodes.forEach(n => {
    const isRound = n.type === 'start' || n.type === 'end';
    g.setNode(n.id, {
      width: isRound ? 56 : NODE_WIDTH,
      height: isRound ? 56 : NODE_HEIGHT,
    });
  });
  edges.forEach(e => g.setEdge(e.source, e.target));

  dagre.layout(g);

  const layoutedNodes: Node[] = nodes.map(n => {
    const { x, y } = g.node(n.id);
    const isRound = n.type === 'start' || n.type === 'end';
    const halfW = isRound ? ROUND_NODE_SIZE / 2 : NODE_WIDTH / 2;
    const halfH = isRound ? ROUND_NODE_SIZE / 2 : NODE_HEIGHT / 2;
    return {
      ...n,
      position: { x: x - halfW, y: y - halfH },
    };
  });

  return { nodes: layoutedNodes, edges };
}
