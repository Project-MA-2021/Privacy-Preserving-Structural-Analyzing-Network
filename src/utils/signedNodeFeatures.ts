export type NodeId = string | number

export interface BasicNode {
  id: NodeId
  name?: string
  group?: number
  clusterId?: number
}

export interface BasicLink {
  source: NodeId
  target: NodeId
  sign?: number
  value?: number
  weight?: number
}

export interface BasicNetwork {
  nodes: BasicNode[]
  links: BasicLink[]
}

export interface StandardizeStats {
  mean: number[]
  std: number[]
}

function toNumSign(link: BasicLink): number {
  const s = link.sign ?? link.value ?? 1
  return s >= 0 ? 1 : -1
}

export function computeSignedNodeFeatures(net: BasicNetwork): number[][] {
  const idx = new Map<NodeId, number>()
  net.nodes.forEach((n, i) => idx.set(n.id, i))

  const posDeg = new Array(net.nodes.length).fill(0)
  const negDeg = new Array(net.nodes.length).fill(0)

  for (const e of net.links) {
    const a = idx.get(e.source)
    const b = idx.get(e.target)
    if (a == null || b == null) continue

    const s = toNumSign(e)
    if (s > 0) {
      posDeg[a]++
      posDeg[b]++
    } else {
      negDeg[a]++
      negDeg[b]++
    }
  }

  const feats: number[][] = []
  for (let i = 0; i < net.nodes.length; i++) {
    const p = posDeg[i]
    const n = negDeg[i]
    const t = p + n
    const pr = t === 0 ? 0 : p / t
    const nr = t === 0 ? 0 : n / t
    feats.push([p, n, p - n, pr, nr, t])
  }
  return feats
}

export function fitStandardize(all: number[][]): StandardizeStats {
  const dim = all[0]?.length ?? 0
  const mean = new Array(dim).fill(0)
  const std = new Array(dim).fill(0)

  for (const x of all) for (let j = 0; j < dim; j++) mean[j] += x[j]
  for (let j = 0; j < dim; j++) mean[j] /= all.length

  for (const x of all) for (let j = 0; j < dim; j++) {
    const d = x[j] - mean[j]
    std[j] += d * d
  }
  for (let j = 0; j < dim; j++) {
    std[j] = Math.sqrt(std[j] / Math.max(1, all.length - 1))
    if (!Number.isFinite(std[j]) || std[j] === 0) std[j] = 1
  }

  return { mean, std }
}

export function standardize(x: number[][], stats: StandardizeStats): number[][] {
  const dim = stats.mean.length
  return x.map(v => {
    const out = new Array(dim)
    for (let j = 0; j < dim; j++) out[j] = (v[j] - stats.mean[j]) / stats.std[j]
    return out
  })
}
