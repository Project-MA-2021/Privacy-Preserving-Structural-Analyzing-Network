import type { BasicNetwork, BasicLink, NodeId } from './signedNodeFeatures'
import { mulberry32 } from './random'

export interface PerturbOptions {
  seed?: number
  flipSignProb?: number
  removeEdgeProb?: number
  rewireProb?: number
  addEdgeRatio?: number
}

function edgeKey(a: NodeId, b: NodeId): string {
  const sa = String(a)
  const sb = String(b)
  return sa < sb ? `${sa}__${sb}` : `${sb}__${sa}`
}

/**
 * noUncheckedIndexedAccess 友好的随机索引：返回 [0, n-1]
 */
function randIndex(rng: () => number, n: number): number {
  if (n <= 1) return 0
  const idx = Math.floor(rng() * n)
  if (idx < 0) return 0
  if (idx >= n) return n - 1
  return idx
}

/**
 * 从 nodeIds 中随机取一个 NodeId（保证不返回 undefined）
 */
function pickNodeId(nodeIds: NodeId[], rng: () => number): NodeId {
  if (nodeIds.length === 0) {
    throw new Error('pickNodeId() called with empty nodeIds')
  }
  return nodeIds[randIndex(rng, nodeIds.length)]!
}

export function perturbNetwork(net: BasicNetwork, opts: PerturbOptions): BasicNetwork {
  const rng = mulberry32(opts.seed ?? 20250101)
  const flip = opts.flipSignProb ?? 0.05
  const rem = opts.removeEdgeProb ?? 0.02
  const rew = opts.rewireProb ?? 0.02
  const addRatio = opts.addEdgeRatio ?? 0.03

  const nodes = net.nodes.map((n) => ({ ...n }))
  const nodeIds: NodeId[] = nodes.map((n) => n.id)

  const links: BasicLink[] = []
  const existed = new Set<string>()

  for (const e of net.links) {
    if (rng() < rem) continue

    let source: NodeId = e.source
    let target: NodeId = e.target
    let sign = (e.sign ?? e.value ?? 1) >= 0 ? 1 : -1

    // 重连：随机替换一个端点（这里保持“只改 target”的原语义）
    if (rng() < rew && nodeIds.length >= 2) {
      const a: NodeId = source
      let b: NodeId = target
      let tries = 0
      while (tries++ < 10) {
        b = pickNodeId(nodeIds, rng)
        if (b !== a) break
      }
      target = b
    }

    if (rng() < flip) sign = -sign

    if (source === target) continue
    const k = edgeKey(source, target)
    if (existed.has(k)) continue
    existed.add(k)

    links.push({ ...e, source, target, sign })
  }

  const addCount = Math.max(0, Math.round(links.length * addRatio))
  let added = 0
  let guard = 0

  while (added < addCount && guard++ < addCount * 50 && nodeIds.length >= 2) {
    const a: NodeId = pickNodeId(nodeIds, rng)
    const b: NodeId = pickNodeId(nodeIds, rng)
    if (a === b) continue

    const k = edgeKey(a, b)
    if (existed.has(k)) continue
    existed.add(k)

    const sign = rng() < 0.5 ? 1 : -1
    links.push({ source: a, target: b, sign })
    added++
  }

  return { nodes, links }
}
