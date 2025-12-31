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
  const mean: number[] = new Array(dim).fill(0)
  const std: number[] = new Array(dim).fill(0)

  // mean
  for (const x of all) {
    for (let j = 0; j < dim; j++) {
      mean[j] = (mean[j] ?? 0) + (x[j] ?? 0)
    }
  }

  const denom = Math.max(1, all.length)
  for (let j = 0; j < dim; j++) {
    mean[j] = (mean[j] ?? 0) / denom
  }

  // std
  for (const x of all) {
    for (let j = 0; j < dim; j++) {
      const mj = mean[j] ?? 0
      const d = (x[j] ?? 0) - mj
      std[j] = (std[j] ?? 0) + d * d
    }
  }

  const denom2 = Math.max(1, all.length - 1)
  for (let j = 0; j < dim; j++) {
    let s = Math.sqrt((std[j] ?? 0) / denom2)
    if (!Number.isFinite(s) || s === 0) s = 1
    std[j] = s
  }

  return { mean, std }
}


export function standardize(x: number[][], stats: StandardizeStats): number[][] {
  const dim = stats.mean.length
  return x.map((v) => {
    const out: number[] = new Array(dim)
    for (let j = 0; j < dim; j++) {
      const vj = v[j] ?? 0
      const mj = stats.mean[j] ?? 0
      const sj = stats.std[j] ?? 1
      out[j] = (vj - mj) / sj
    }
    return out
  })
}
