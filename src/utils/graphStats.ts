// File: src/utils/graphStats.ts
import type { GraphData } from '../types/symbolNetwork';

export interface BalanceStats {
  nodes: number;
  edges: number;
  posEdges: number;
  negEdges: number;

  triangles: number;
  balancedTriangles: number;
  unbalancedTriangles: number;
  balancedRatio: number; // balancedTriangles / triangles
}

type Adj = Map<string, Map<string, 1 | -1>>;

function buildAdj(graph: GraphData): Adj {
  const adj: Adj = new Map();
  for (const n of graph.nodes) adj.set(n.id, new Map());

  for (const e of graph.edges) {
    const s = (e.sign === 1 ? 1 : -1) as 1 | -1;
    if (!adj.has(e.source)) adj.set(e.source, new Map());
    if (!adj.has(e.target)) adj.set(e.target, new Map());
    adj.get(e.source)!.set(e.target, s);
    adj.get(e.target)!.set(e.source, s);
  }
  return adj;
}

/**
 * 三元组（闭三角）平衡性：三条边符号乘积为 +1 => balanced，否则 unbalanced
 * 这里只统计“真的成三角”的三元组（即三条边都存在）
 */
export function computeBalanceStats(graph: GraphData): BalanceStats {
  const nodes = graph.nodes.length;
  const edges = graph.edges.length;

  let posEdges = 0;
  let negEdges = 0;
  for (const e of graph.edges) {
    if (e.sign === 1) posEdges++;
    else negEdges++;
  }

  const ids = graph.nodes.map((n) => n.id).slice().sort();
  const adj = buildAdj(graph);

  let triangles = 0;
  let balancedTriangles = 0;
  let unbalancedTriangles = 0;

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      for (let k = j + 1; k < ids.length; k++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const c = ids[k]!;

        const sab = adj.get(a)?.get(b);
        const sac = adj.get(a)?.get(c);
        const sbc = adj.get(b)?.get(c);

        if (!sab || !sac || !sbc) continue;

        triangles++;
        const prod = sab * sac * sbc; // +1 or -1
        if (prod === 1) balancedTriangles++;
        else unbalancedTriangles++;
      }
    }
  }

  const balancedRatio = triangles > 0 ? balancedTriangles / triangles : 0;

  return {
    nodes,
    edges,
    posEdges,
    negEdges,
    triangles,
    balancedTriangles,
    unbalancedTriangles,
    balancedRatio,
  };
}
