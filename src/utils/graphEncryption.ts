// File: src/utils/graphEncryption.ts
import type { GraphData } from '../types/symbolNetwork'

export interface EncryptConfig {
  flipEdgeRate: number // 翻转边符号比例
  rewireEdgeRate: number // 重连端点比例
  addEdgeCount: number // 额外加边
  removeEdgeCount: number // 额外删边
}

export const DEFAULT_ENCRYPT_CONFIG: EncryptConfig = {
  flipEdgeRate: 0.18,
  rewireEdgeRate: 0.12,
  addEdgeCount: 2,
  removeEdgeCount: 1,
}

export function hashStrToSeed(s: string): number {
  let h = 2166136261 // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function mulberry32(seed: number) {
  let t = seed >>> 0
  return function rand() {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function toStrId(x: any): string {
  return String(x)
}

function getEdges(g: any): any[] {
  return (g?.edges ?? g?.links ?? []) as any[]
}

function setEdges(g: any, edges: any[]) {
  g.edges = edges
  g.links = edges
}

function pickOne<T>(arr: readonly T[], rand: () => number): T {
  if (arr.length === 0) {
    throw new Error('pickOne() called with empty array')
  }
  return arr[Math.floor(rand() * arr.length)]!
}

function deepCloneGraph(g: GraphData): GraphData {
  const gg: any = {
    nodes: (g as any).nodes ? (g as any).nodes.map((n: any) => ({ ...n })) : [],
  }
  const e = getEdges(g).map((x: any) => ({ ...x }))
  setEdges(gg, e)
  if ('clusters' in (g as any) && (g as any).clusters) gg.clusters = { ...(g as any).clusters }
  return gg as GraphData
}

// 无向意义下的重复边检测（你也可以改成有向）
function hasEdge(edges: any[], a: string, b: string) {
  return edges.some((e) => {
    const s = toStrId(e?.source)
    const t = toStrId(e?.target)
    return (s === a && t === b) || (s === b && t === a)
  })
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
  cfg: EncryptConfig = DEFAULT_ENCRYPT_CONFIG,
): GraphData {
  const rand = mulberry32(seed)
  const g: any = deepCloneGraph(original)

  const nodes = (g.nodes ?? []) as any[]
  if (nodes.length < 2) return g as GraphData

  const nodeIds: string[] = nodes.map((n) => toStrId(n.id))

  // 使用同一个 edges 引用，兼容 edges/links
  const edges = getEdges(g) as any[]
  setEdges(g, edges)

  // 0) 先随机删几条边
  for (let i = 0; i < cfg.removeEdgeCount && edges.length > 0; i++) {
    const idx = Math.floor(rand() * edges.length)
    if (idx >= 0 && idx < edges.length) edges.splice(idx, 1)
  }

  // 1) 翻转一部分边 sign
  const flipCount = Math.floor(edges.length * cfg.flipEdgeRate)
  for (let i = 0; i < flipCount && edges.length > 0; i++) {
    const idx = Math.floor(rand() * edges.length)
    const e = edges[idx]
    if (!e) continue
    const cur = e.sign ?? 1
    e.sign = cur === 1 ? -1 : 1
  }

  // 2) 重连一部分边：随机换一个端点（避免自环、尽量避免重复边）
  const rewireCount = Math.floor(edges.length * cfg.rewireEdgeRate)
  for (let i = 0; i < rewireCount && edges.length > 0; i++) {
    const idx = Math.floor(rand() * edges.length)
    const e = edges[idx]
    if (!e) continue

    // 规范化，避免后续比较出现 string/number 混用
    e.source = toStrId(e.source)
    e.target = toStrId(e.target)

    const changeSource = rand() < 0.5
    const fixed = changeSource ? (e.target as string) : (e.source as string)

    let newNode = pickOne(nodeIds, rand)
    let guard = 0

    while (
      guard++ < 20 &&
      (newNode === fixed ||
        hasEdge(
          edges,
          changeSource ? newNode : (e.source as string),
          changeSource ? (e.target as string) : newNode,
        ))
    ) {
      newNode = pickOne(nodeIds, rand)
    }

    if (changeSource) e.source = newNode
    else e.target = newNode

    // 兜底：避免自环
    if (e.source === e.target) {
      const alt = nodeIds.filter((x) => x !== e.source)
      if (alt.length > 0) e.target = pickOne(alt, rand)
    }
  }

  // 3) 额外随机加几条边
  let edgeIdCounterLocal = 10000
  for (let i = 0; i < cfg.addEdgeCount; i++) {
    let a = pickOne(nodeIds, rand)
    let b = pickOne(nodeIds, rand)
    let guard = 0

    while (guard++ < 20 && (a === b || hasEdge(edges, a, b))) {
      a = pickOne(nodeIds, rand)
      b = pickOne(nodeIds, rand)
    }

    if (a !== b && !hasEdge(edges, a, b)) {
      edges.push({
        id: `enc_e${edgeIdCounterLocal++}`,
        source: a,
        target: b,
        sign: rand() < 0.5 ? 1 : -1,
      })
    }
  }

  setEdges(g, edges)
  return g as GraphData
}
