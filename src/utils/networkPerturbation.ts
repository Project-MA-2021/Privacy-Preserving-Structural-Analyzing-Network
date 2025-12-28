import type { BasicNetwork, BasicLink, NodeId } from './signedNodeFeatures'
import { mulberry32, randInt } from './random'

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

export function perturbNetwork(net: BasicNetwork, opts: PerturbOptions): BasicNetwork {
  const rng = mulberry32(opts.seed ?? 20250101)
  const flip = opts.flipSignProb ?? 0.05
  const rem = opts.removeEdgeProb ?? 0.02
  const rew = opts.rewireProb ?? 0.02
  const addRatio = opts.addEdgeRatio ?? 0.03

  const nodes = net.nodes.map(n => ({ ...n }))
  const nodeIds = nodes.map(n => n.id)

  const links: BasicLink[] = []
  const existed = new Set<string>()

  for (const e of net.links) {
    if (rng() < rem) continue

    let source = e.source
    let target = e.target
    let sign = (e.sign ?? e.value ?? 1) >= 0 ? 1 : -1

    if (rng() < rew && nodeIds.length >= 2) {
      const a = source
      let b = target
      let tries = 0
      while (tries++ < 10) {
        b = nodeIds[randInt(rng, 0, nodeIds.length)]
        if (b !== a) break
      }
      target = b
    }

    if (rng() < flip) sign = -sign

    const k = edgeKey(source, target)
    if (source === target) continue
    if (existed.has(k)) continue
    existed.add(k)

    links.push({ ...e, source, target, sign })
  }

  const addCount = Math.max(0, Math.round(links.length * addRatio))
  let added = 0
  let guard = 0
  while (added < addCount && guard++ < addCount * 50 && nodeIds.length >= 2) {
    const a = nodeIds[randInt(rng, 0, nodeIds.length)]
    const b = nodeIds[randInt(rng, 0, nodeIds.length)]
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
