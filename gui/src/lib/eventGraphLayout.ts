import type { OpenEventContext, TreeNode } from '../api/types';
import { formatTreeNodeComposeMeta } from './fieldLabels';

export const GRAPH_NODE_WIDTH = 200;
export const GRAPH_NODE_HEIGHT = 72;
const H_GAP = 88;
const V_GAP = 28;

export type GraphNodeLayout = {
  id: string;
  name: string;
  eventType: number;
  isException: boolean;
  role?: string;
  action?: string;
  meta: string | null;
  truncated?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  isRoot: boolean;
  openContext?: OpenEventContext;
};

export type GraphEdgeLayout = {
  id: string;
  from: string;
  to: string;
  kind: 'child' | 'exception';
};

export type GraphLayout = {
  nodes: GraphNodeLayout[];
  edges: GraphEdgeLayout[];
  width: number;
  height: number;
};

type LayoutResult = {
  nodes: GraphNodeLayout[];
  edges: GraphEdgeLayout[];
  top: number;
  bottom: number;
};

function nodeId(path: string): string {
  return path || 'root';
}

function layoutSubtree(
  node: TreeNode,
  path: string,
  depth: number,
  startY: number,
  openContext?: OpenEventContext,
  isRoot = false,
): LayoutResult {
  const id = nodeId(path);
  const x = depth * (GRAPH_NODE_WIDTH + H_GAP);
  const meta = formatTreeNodeComposeMeta(node);

  const childNodes: GraphNodeLayout[] = [];
  const childEdges: GraphEdgeLayout[] = [];
  let cursorY = startY;

  const branches: { items: TreeNode[]; kind: 'child' | 'exception'; prefix: string; context?: OpenEventContext }[] = [
    {
      items: node.children ?? [],
      kind: 'child',
      prefix: 'c',
    },
  ];

  if (node.exceptions?.length) {
    branches.push({
      items: node.exceptions,
      kind: 'exception',
      prefix: 'e',
    });
  }

  const subtreeResults: LayoutResult[] = [];

  for (const branch of branches) {
    branch.items.forEach((child, index) => {
      const childPath = path ? `${path}:${branch.prefix}:${index}` : `${branch.prefix}:${index}`;
      const childContext =
        branch.kind === 'child'
          ? { childIndex: index, exceptionIndex: null as number | null }
          : { childIndex: null as number | null, exceptionIndex: index };

      const result = layoutSubtree(child, childPath, depth + 1, cursorY, childContext);
      subtreeResults.push(result);
      childNodes.push(...result.nodes);
      childEdges.push(...result.edges);
      childEdges.push({
        id: `${id}->${nodeId(childPath)}`,
        from: id,
        to: nodeId(childPath),
        kind: branch.kind,
      });
      cursorY = result.bottom + V_GAP;
    });
  }

  let nodeY: number;
  if (subtreeResults.length === 0) {
    nodeY = startY;
  } else {
    const firstTop = subtreeResults[0].top;
    const lastBottom = subtreeResults[subtreeResults.length - 1].bottom;
    nodeY = (firstTop + lastBottom) / 2 - GRAPH_NODE_HEIGHT / 2;
  }

  const selfNode: GraphNodeLayout = {
    id,
    name: node.name,
    eventType: node.event_type,
    isException: Boolean(node.is_exception || node.role === 'exception'),
    role: node.role,
    action: node.action,
    meta,
    truncated: node.truncated,
    x,
    y: nodeY,
    width: GRAPH_NODE_WIDTH,
    height: GRAPH_NODE_HEIGHT,
    isRoot,
    openContext,
  };

  const top = subtreeResults.length ? Math.min(nodeY, subtreeResults[0].top) : nodeY;
  const bottom = subtreeResults.length
    ? Math.max(nodeY + GRAPH_NODE_HEIGHT, subtreeResults[subtreeResults.length - 1].bottom)
    : nodeY + GRAPH_NODE_HEIGHT;

  return {
    nodes: [selfNode, ...childNodes],
    edges: childEdges,
    top,
    bottom,
  };
}

export function layoutEventGraph(tree: TreeNode): GraphLayout {
  const result = layoutSubtree(tree, '', 0, 0, undefined, true);
  const padding = 48;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of result.nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  const offsetX = padding - minX;
  const offsetY = padding - minY;

  const nodes = result.nodes.map((node) => ({
    ...node,
    x: node.x + offsetX,
    y: node.y + offsetY,
  }));

  return {
    nodes,
    edges: result.edges,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

export function edgePath(
  from: GraphNodeLayout,
  to: GraphNodeLayout,
): string {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const dx = Math.max(40, (x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
