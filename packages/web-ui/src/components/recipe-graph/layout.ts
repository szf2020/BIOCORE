// layout.ts — dagre 自动布局 (M3.7)
import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;

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
    return {
      ...n,
      position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
    };
  });

  return { nodes: layoutedNodes, edges };
}
