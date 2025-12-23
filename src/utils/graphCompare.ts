// File: src/utils/graphCompare.ts
import type { GraphData } from '../types/symbolNetwork';

export type EdgeKind = 'real' | 'spurious' | 'missing';

export type EdgeWithKind = GraphData['edges'][number] & { kind?: EdgeKind };

export type GraphDataWithEdgeKind = Omit<GraphData, 'edges'> & {
  edges: EdgeWithKind[];
};

function edgeKeyUndirected(a: string, b: string) {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

/**
 * 生成“对比视图”：
 * - real：原图也有，扰动图也有
 * - missing：原图有，扰动图没有
 * - spurious：扰动图有，原图没有
 *
 * 注意：对比视图的 nodes 以 base 为准（默认节点集合不变）
 */
export function makeCompareGraph(base: GraphData, enc: GraphData): GraphDataWithEdgeKind {
  const baseMap = new Map<string, GraphData['edges'][number]>();
  const encMap = new Map<string, GraphData['edges'][number]>();

  for (const e of base.edges) baseMap.set(edgeKeyUndirected(e.source, e.target), e);
  for (const e of enc.edges) encMap.set(edgeKeyUndirected(e.source, e.target), e);

  const edges: EdgeWithKind[] = [];

  // base -> real / missing
  for (const [k, e] of baseMap.entries()) {
    if (encMap.has(k)) edges.push({ ...e, kind: 'real' });
    else edges.push({ ...e, kind: 'missing' });
  }

  // enc -> spurious
  for (const [k, e] of encMap.entries()) {
    if (!baseMap.has(k)) edges.push({ ...e, kind: 'spurious' });
  }

  return {
    nodes: base.nodes.map((n) => ({ ...n })),
    edges,
    clusters: base.clusters ? { ...base.clusters } : undefined,
  };
}
