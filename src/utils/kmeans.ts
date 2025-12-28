import { mulberry32, randInt } from './random'

export interface KMeansOptions {
  k: number
  maxIter?: number
  tol?: number
  seed?: number
}

export interface KMeansResult {
  centroids: number[][]
  labels: number[]
  inertia: number
  iters: number
}

function dist2(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    s += d * d
  }
  return s
}

function mean(points: number[][], dim: number): number[] {
  const c = new Array(dim).fill(0)
  if (points.length === 0) return c
  for (const p of points) {
    for (let i = 0; i < dim; i++) c[i] += p[i]
  }
  for (let i = 0; i < dim; i++) c[i] /= points.length
  return c
}

function pickWeightedIndex(rng: () => number, weights: number[]): number {
  let total = 0
  for (const w of weights) total += w
  if (total <= 0) return 0
  let r = rng() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

function initKMeansPlusPlus(data: number[][], k: number, rng: () => number): number[][] {
  const n = data.length
  const dim = data[0]?.length ?? 0
  const centroids: number[][] = []

  centroids.push(data[randInt(rng, 0, n)].slice())

  const d2 = new Array(n).fill(0)

  while (centroids.length < k) {
    for (let i = 0; i < n; i++) {
      let best = Number.POSITIVE_INFINITY
      for (const c of centroids) {
        const v = dist2(data[i], c)
        if (v < best) best = v
      }
      d2[i] = best
    }
    const idx = pickWeightedIndex(rng, d2)
    centroids.push(data[idx].slice())
  }

  for (let ci = 0; ci < centroids.length; ci++) {
    if (centroids[ci].length !== dim) centroids[ci] = mean(data, dim)
  }
  return centroids
}

export function kmeans(data: number[][], opts: KMeansOptions): KMeansResult {
  const k = Math.max(1, Math.floor(opts.k))
  const maxIter = opts.maxIter ?? 200
  const tol = opts.tol ?? 1e-6
  const rng = mulberry32(opts.seed ?? 12345)

  const n = data.length
  if (n === 0) {
    return { centroids: [], labels: [], inertia: 0, iters: 0 }
  }
  const dim = data[0].length

  let centroids = initKMeansPlusPlus(data, k, rng)
  let labels = new Array(n).fill(0)

  let it = 0
  let prevInertia = Number.POSITIVE_INFINITY

  for (; it < maxIter; it++) {
    let inertia = 0

    for (let i = 0; i < n; i++) {
      let bestK = 0
      let bestD = Number.POSITIVE_INFINITY
      for (let c = 0; c < k; c++) {
        const d = dist2(data[i], centroids[c])
        if (d < bestD) {
          bestD = d
          bestK = c
        }
      }
      labels[i] = bestK
      inertia += bestD
    }

    const buckets: number[][][] = Array.from({ length: k }, () => [])
    for (let i = 0; i < n; i++) buckets[labels[i]].push(data[i])

    const newCentroids: number[][] = []
    for (let c = 0; c < k; c++) {
      if (buckets[c].length === 0) {
        newCentroids.push(data[randInt(rng, 0, n)].slice())
      } else {
        newCentroids.push(mean(buckets[c], dim))
      }
    }

    let shift = 0
    for (let c = 0; c < k; c++) shift += dist2(centroids[c], newCentroids[c])
    centroids = newCentroids

    if (Math.abs(prevInertia - inertia) <= tol * (prevInertia === Number.POSITIVE_INFINITY ? 1 : prevInertia)) {
      prevInertia = inertia
      break
    }
    prevInertia = inertia
  }

  return { centroids, labels, inertia: prevInertia, iters: it + 1 }
}

export function kmeansPredict(data: number[][], centroids: number[][]): number[] {
  const k = centroids.length
  const labels = new Array(data.length).fill(0)
  for (let i = 0; i < data.length; i++) {
    let bestK = 0
    let bestD = Number.POSITIVE_INFINITY
    for (let c = 0; c < k; c++) {
      const d = dist2(data[i], centroids[c])
      if (d < bestD) {
        bestD = d
        bestK = c
      }
    }
    labels[i] = bestK
  }
  return labels
}
