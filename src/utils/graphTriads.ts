// File: src/utils/graphTriads.ts
import type { GraphData } from '../types/symbolNetwork';

export type Sign = 1 | -1;

export interface Triad {
  a: string;
  b: string;
  c: string;

  // 三条边符号（无向）
  sab: Sign; // a-b
  sac: Sign; // a-c
  sbc: Sign; // b-c

  // 例如 "++-"、"---"
  type: string;

  // 是否平衡：sab*sac*sbc === +1
  balanced: boolean;

  // 便于高亮：无向 edgeKey
  edgeKeys: [string, string, string];
  nodeIds: [string, string, string];
}

type Adj = Map<string, Map<string, Sign>>;

function edgeKeyUndirected(u: string, v: string) {
  return u < v ? `${u}__${v}` : `${v}__${u}`;
}

function buildAdj(graph: GraphData): Adj {
  const adj: Adj = new Map();
  for (const n of graph.nodes) adj.set(n.id, new Map());

  for (const e of graph.edges) {
    const s: Sign = e.sign === 1 ? 1 : -1;
    if (!adj.has(e.source)) adj.set(e.source, new Map());
    if (!adj.has(e.target)) adj.set(e.target, new Map());
    adj.get(e.source)!.set(e.target, s);
    adj.get(e.target)!.set(e.source, s);
  }
  return adj;
}

function signToChar(s: Sign) {
  return s === 1 ? '+' : '-';
}

/**
 * 枚举“闭三角形”三元组：只统计三条边都存在的 (a,b,c)
 */
export function findTriads(graph: GraphData): Triad[] {
  const ids = graph.nodes.map((n) => n.id).slice().sort();
  const adj = buildAdj(graph);

  const triads: Triad[] = [];

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

        const balanced = sab * sac * sbc === 1;
        const type = `${signToChar(sab)}${signToChar(sac)}${signToChar(sbc)}`;

        triads.push({
          a,
          b,
          c,
          sab,
          sac,
          sbc,
          type,
          balanced,
          nodeIds: [a, b, c],
          edgeKeys: [
            edgeKeyUndirected(a, b),
            edgeKeyUndirected(a, c),
            edgeKeyUndirected(b, c),
          ],
        });
      }
    }
  }

  return triads;
}

/**
 * 只要“不平衡三元组”（乘积为 -1）
 */
export function findUnbalancedTriads(graph: GraphData): Triad[] {
  return findTriads(graph).filter((t) => !t.balanced);
}
