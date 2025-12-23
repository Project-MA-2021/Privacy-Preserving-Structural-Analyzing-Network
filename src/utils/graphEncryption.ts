// File: src/utils/graphEncryption.ts
import type { GraphData } from '../types/symbolNetwork';

export interface EncryptConfig {
  flipEdgeRate: number; // 翻转边符号比例
  rewireEdgeRate: number; // 重连端点比例
  addEdgeCount: number; // 额外加边
  removeEdgeCount: number; // 额外删边
}

export const DEFAULT_ENCRYPT_CONFIG: EncryptConfig = {
  flipEdgeRate: 0.18,
  rewireEdgeRate: 0.12,
  addEdgeCount: 2,
  removeEdgeCount: 1,
};

export function hashStrToSeed(s: string): number {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function deepCloneGraph(g: GraphData): GraphData {
  return {
    nodes: g.nodes.map((n) => ({ ...n })),
    edges: g.edges.map((e) => ({ ...e })),
    clusters: g.clusters ? { ...g.clusters } : undefined,
  };
}

// 无向意义下的重复边检测（你也可以改成有向）
function hasEdge(edges: GraphData['edges'], a: string, b: string) {
  return edges.some(
    (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a)
  );
}

/**
 * 对单个网络做“随机扰动”，返回新图（不修改原图）
 * - 删边
 * - 翻转 sign
 * - 重连端点
 * - 加边
 */
export function encryptGraph(
  original: GraphData,
  seed: number,
  cfg: EncryptConfig = DEFAULT_ENCRYPT_CONFIG
): GraphData {
  const rand = mulberry32(seed);
  const g = deepCloneGraph(original);

  if (g.nodes.length < 2) return g;

  const nodeIds = g.nodes.map((n) => n.id);

  // 0) 先随机删几条边
  for (let i = 0; i < cfg.removeEdgeCount && g.edges.length > 0; i++) {
    const idx = Math.floor(rand() * g.edges.length);
    g.edges.splice(idx, 1);
  }

  // 1) 翻转一部分边 sign
  const flipCount = Math.floor(g.edges.length * cfg.flipEdgeRate);
  for (let i = 0; i < flipCount && g.edges.length > 0; i++) {
    const idx = Math.floor(rand() * g.edges.length);
    g.edges[idx].sign = g.edges[idx].sign === 1 ? -1 : 1;
  }

  // 2) 重连一部分边：随机换一个端点（避免自环、尽量避免重复边）
  const rewireCount = Math.floor(g.edges.length * cfg.rewireEdgeRate);
  for (let i = 0; i < rewireCount && g.edges.length > 0; i++) {
    const idx = Math.floor(rand() * g.edges.length);
    const e = g.edges[idx];

    const changeSource = rand() < 0.5;
    let newNode = pickOne(nodeIds, rand);
    let guard = 0;

    while (
      guard++ < 20 &&
      (newNode === (changeSource ? e.target : e.source) ||
        hasEdge(
          g.edges,
          changeSource ? newNode : e.source,
          changeSource ? e.target : newNode
        ))
    ) {
      newNode = pickOne(nodeIds, rand);
    }

    if (changeSource) e.source = newNode;
    else e.target = newNode;

    // 兜底：避免自环
    if (e.source === e.target) {
      const alt = nodeIds.filter((x) => x !== e.source);
      if (alt.length) e.target = pickOne(alt, rand);
    }
  }

  // 3) 额外随机加几条边
  let edgeIdCounterLocal = 10000;
  for (let i = 0; i < cfg.addEdgeCount; i++) {
    let a = pickOne(nodeIds, rand);
    let b = pickOne(nodeIds, rand);
    let guard = 0;

    while (guard++ < 20 && (a === b || hasEdge(g.edges, a, b))) {
      a = pickOne(nodeIds, rand);
      b = pickOne(nodeIds, rand);
    }

    if (a !== b && !hasEdge(g.edges, a, b)) {
      g.edges.push({
        id: `enc_e${edgeIdCounterLocal++}`,
        source: a,
        target: b,
        sign: rand() < 0.5 ? 1 : -1,
      });
    }
  }

  return g;
}
