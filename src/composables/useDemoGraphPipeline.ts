import { computed, ref, watch, type ComputedRef } from 'vue'
import type { GraphData } from '../types/symbolNetwork'
import { makeCompareGraph, type GraphDataWithEdgeKind } from '../utils/graphCompare'
import type { DisplayMode } from '../utils/buildSphereGraphOption'

export interface UseDemoGraphPipelineArgs {
  demoGraphs: Record<string, GraphData>
  initialKey: string
}

const AGG_KEY = '__AGG__'

// ===== K-means params =====
const KMEANS_K = 4
const KMEANS_MAX_ITER = 200
const KMEANS_TOL = 1e-6

// ===== Perturbation params =====
const PERTURB_FLIP_EDGE_RATE = 0.18
const PERTURB_REWIRE_EDGE_RATE = 0.12
const PERTURB_ADD_EDGE_COUNT = 8
const PERTURB_REMOVE_EDGE_COUNT = 4

type RecluterMode = 'predict' | 'refit'
const RECLUSTER_MODE: RecluterMode = 'predict'

function hashStrToSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
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

function deepCloneGraph(g: GraphData): GraphData {
  const gg: any = {
    nodes: (g.nodes ?? []).map((n: any) => ({ ...n })),
  }
  const e = getEdges(g).map((x: any) => ({ ...x }))
  setEdges(gg, e)
  if ('clusters' in (g as any)) gg.clusters = { ...(g as any).clusters }
  return gg as GraphData
}

function hasEdge(edges: any[], a: string, b: string) {
  return edges.some(
    (e) =>
      (toStrId(e.source) === a && toStrId(e.target) === b) ||
      (toStrId(e.source) === b && toStrId(e.target) === a),
  )
}

function edgeSign(e: any): number {
  const s = e?.sign ?? e?.value ?? 1
  return s >= 0 ? 1 : -1
}

// ===== 聚合：把所有 demo 图合成一张总图（命名空间避免 id 冲突）=====
function aggregateAllGraphs(demoGraphs: Record<string, GraphData>): GraphData {
  const nodes: any[] = []
  const edges: any[] = []
  let edgeId = 0

  for (const [k, g] of Object.entries(demoGraphs)) {
    for (const n of g.nodes ?? []) {
      const oldId = toStrId((n as any).id)
      const newId = `${k}::${oldId}`
      nodes.push({ ...n, id: newId, _originGraph: k, _originId: oldId })
    }

    const es = getEdges(g)
    for (const e of es) {
      const src = `${k}::${toStrId((e as any).source)}`
      const dst = `${k}::${toStrId((e as any).target)}`
      const id =
        (e as any).id != null ? `${k}::${toStrId((e as any).id)}` : `agg_e${edgeId++}`
      edges.push({ ...e, id, source: src, target: dst })
    }
  }

  const agg: any = { nodes }
  setEdges(agg, edges)
  return agg as GraphData
}

// ===== 特征：签名网络节点特征（固定维度）=====
function computeSignedNodeFeatures(graph: GraphData): { nodeIds: string[]; features: number[][] } {
  const nodes = (graph.nodes ?? []) as any[]
  const edges = getEdges(graph) as any[]

  const nodeIds = nodes.map((n) => toStrId(n.id))
  const idx = new Map<string, number>()
  for (let i = 0; i < nodeIds.length; i++) idx.set(nodeIds[i]!, i)

  const posDeg = new Array(nodeIds.length).fill(0)
  const negDeg = new Array(nodeIds.length).fill(0)

  for (const e of edges) {
    const a = idx.get(toStrId(e.source))
    const b = idx.get(toStrId(e.target))
    if (a == null || b == null) continue

    if (edgeSign(e) > 0) {
      posDeg[a]++
      posDeg[b]++
    } else {
      negDeg[a]++
      negDeg[b]++
    }
  }

  const features: number[][] = []
  for (let i = 0; i < nodeIds.length; i++) {
    const p = posDeg[i]
    const n = negDeg[i]
    const t = p + n
    const pr = t === 0 ? 0 : p / t
    const nr = t === 0 ? 0 : n / t
    features.push([p, n, p - n, pr, nr, t])
  }

  return { nodeIds, features }
}

interface StandardizeStats {
  mean: number[]
  std: number[]
}

function fitStandardize(data: number[][]): StandardizeStats {
  const dim = data[0]?.length ?? 0
  const mean: number[] = new Array(dim).fill(0)
  const std: number[] = new Array(dim).fill(0)

  // mean
  for (const x of data) {
    for (let j = 0; j < dim; j++) {
      mean[j] = (mean[j] ?? 0) + (x[j] ?? 0)
    }
  }

  const denom = Math.max(1, data.length)
  for (let j = 0; j < dim; j++) {
    mean[j] = (mean[j] ?? 0) / denom
  }

  // std
  for (const x of data) {
    for (let j = 0; j < dim; j++) {
      const mj = mean[j] ?? 0
      const d = (x[j] ?? 0) - mj
      std[j] = (std[j] ?? 0) + d * d
    }
  }

  const denom2 = Math.max(1, data.length - 1)
  for (let j = 0; j < dim; j++) {
    let s = Math.sqrt((std[j] ?? 0) / denom2)
    if (!Number.isFinite(s) || s === 0) s = 1
    std[j] = s
  }

  return { mean, std }
}

function standardize(data: number[][], stats: StandardizeStats): number[][] {
  const dim = stats.mean.length
  return data.map((x) => {
    const out: number[] = new Array(dim)
    for (let j = 0; j < dim; j++) {
      const xj = x[j] ?? 0
      const mj = stats.mean[j] ?? 0
      const sj = stats.std[j] ?? 1
      out[j] = (xj - mj) / sj
    }
    return out
  })
}

// ===== K-means =====
interface KMeansResult {
  centroids: number[][]
  labels: number[]
  inertia: number
  iters: number
}

function dist2(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    const d = ai - bi
    s += d * d
  }
  return s
}

function meanVec(points: number[][], dim: number): number[] {
  const c: number[] = new Array(dim).fill(0)
  if (points.length === 0) return c
  for (const p of points) {
    for (let i = 0; i < dim; i++) {
      c[i] = (c[i] ?? 0) + (p[i] ?? 0)
    }
  }
  for (let i = 0; i < dim; i++) c[i] = (c[i] ?? 0) / points.length
  return c
}

function pickWeightedIndex(rng: () => number, weights: number[]): number {
  let total = 0
  for (const w of weights) total += w ?? 0
  if (total <= 0) return 0

  let r = rng() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0
    if (r <= 0) return i
  }
  return weights.length - 1
}

function initKMeansPlusPlus(data: number[][], k: number, rng: () => number): number[][] {
  const n = data.length
  const centroids: number[][] = []
  centroids.push(data[Math.floor(rng() * n)]!.slice())

  const d2 = new Array(n).fill(0)
  while (centroids.length < k) {
    for (let i = 0; i < n; i++) {
      let best = Number.POSITIVE_INFINITY
      for (const c of centroids) {
        const v = dist2(data[i]!, c)
        if (v < best) best = v
      }
      d2[i] = best
    }
    const idx = pickWeightedIndex(rng, d2)
    centroids.push(data[idx]!.slice())
  }
  return centroids
}

function kmeans(data: number[][], k: number, seed: number): KMeansResult {
  const n = data.length
  if (n === 0) return { centroids: [], labels: [], inertia: 0, iters: 0 }

  const kk = Math.max(1, Math.min(k, n))
  const rng = mulberry32(seed)
  const dim = data[0]!.length

  let centroids = initKMeansPlusPlus(data, kk, rng)
  let labels = new Array(n).fill(0)

  let prevInertia = Number.POSITIVE_INFINITY
  let it = 0

  for (; it < KMEANS_MAX_ITER; it++) {
    let inertia = 0

    for (let i = 0; i < n; i++) {
      let bestK = 0
      let bestD = Number.POSITIVE_INFINITY
      for (let c = 0; c < kk; c++) {
        const d = dist2(data[i]!, centroids[c]!)
        if (d < bestD) {
          bestD = d
          bestK = c
        }
      }
      labels[i] = bestK
      inertia += bestD
    }

    const buckets: number[][][] = Array.from({ length: kk }, () => [])
    for (let i = 0; i < n; i++) buckets[labels[i]]!.push(data[i]!)

    const newCentroids: number[][] = []
    for (let c = 0; c < kk; c++) {
      if (buckets[c]!.length === 0) newCentroids.push(data[Math.floor(rng() * n)]!.slice())
      else newCentroids.push(meanVec(buckets[c]!, dim))
    }

    let shift = 0
    for (let c = 0; c < kk; c++) shift += dist2(centroids[c]!, newCentroids[c]!)
    centroids = newCentroids

    if (
      Math.abs(prevInertia - inertia) <=
      KMEANS_TOL * (prevInertia === Number.POSITIVE_INFINITY ? 1 : prevInertia)
    ) {
      prevInertia = inertia
      break
    }
    prevInertia = inertia
    if (shift <= KMEANS_TOL) break
  }

  return { centroids, labels, inertia: prevInertia, iters: it + 1 }
}

function kmeansPredict(data: number[][], centroids: number[][]): number[] {
  const k = centroids.length
  const labels = new Array(data.length).fill(0)
  for (let i = 0; i < data.length; i++) {
    let bestK = 0
    let bestD = Number.POSITIVE_INFINITY
    for (let c = 0; c < k; c++) {
      const d = dist2(data[i]!, centroids[c]!)
      if (d < bestD) {
        bestD = d
        bestK = c
      }
    }
    labels[i] = bestK
  }
  return labels
}

// ===== 写回 clusters，同时兼容 node.group / node.clusterId =====
function attachClusters(graph: GraphData, nodeIds: string[], labels: number[]): GraphData {
  const g: any = deepCloneGraph(graph)

  const clusters: Record<string, number> = {}
  for (let i = 0; i < nodeIds.length; i++) clusters[nodeIds[i]!] = labels[i] ?? 0
  g.clusters = clusters

  const idToCluster = new Map<string, number>()
  for (let i = 0; i < nodeIds.length; i++) idToCluster.set(nodeIds[i]!, labels[i] ?? 0)
  g.nodes = (g.nodes ?? []).map((n: any) => {
    const cid = idToCluster.get(toStrId(n.id)) ?? 0
    return { ...n, group: cid, clusterId: cid }
  })

  return g as GraphData
}

function clusterGraphKMeans(
  graph: GraphData,
  k: number,
  seed: number,
): { clustered: GraphData; stats: StandardizeStats; centroids: number[][] } {
  const { nodeIds, features } = computeSignedNodeFeatures(graph)
  if (nodeIds.length === 0) {
    return { clustered: attachClusters(graph, [], []), stats: { mean: [], std: [] }, centroids: [] }
  }
  const stats = fitStandardize(features)
  const data = standardize(features, stats)
  const km = kmeans(data, k, seed)
  return { clustered: attachClusters(graph, nodeIds, km.labels), stats, centroids: km.centroids }
}

// ===== 扰动（边翻转/删边/重连/加边）=====
function perturbGraph(original: GraphData, seed: number): GraphData {
  const rand = mulberry32(seed)
  const g: any = deepCloneGraph(original)

  if ('clusters' in g) delete g.clusters
  g.nodes = (g.nodes ?? []).map((n: any) => {
    const nn = { ...n }
    delete nn.group
    delete nn.clusterId
    return nn
  })

  const nodes = (g.nodes ?? []) as any[]
  const edges = (getEdges(g) ?? []) as any[]
  setEdges(g, edges)

  if (nodes.length < 2) return g as GraphData
  const nodeIds = nodes.map((n) => toStrId(n.id))

  for (let i = 0; i < PERTURB_REMOVE_EDGE_COUNT && edges.length > 0; i++) {
    const idx = Math.floor(rand() * edges.length)
    if (idx >= 0 && idx < edges.length) edges.splice(idx, 1)
  }

  const flipCount = Math.floor(edges.length * PERTURB_FLIP_EDGE_RATE)
  for (let i = 0; i < flipCount && edges.length > 0; i++) {
    const idx = Math.floor(rand() * edges.length)
    const e = edges[idx]
    if (!e) continue
    e.sign = edgeSign(e) > 0 ? -1 : 1
  }

  const rewireCount = Math.floor(edges.length * PERTURB_REWIRE_EDGE_RATE)
  for (let i = 0; i < rewireCount && edges.length > 0; i++) {
    const idx = Math.floor(rand() * edges.length)
    const e = edges[idx]
    if (!e) continue

    const changeSource = rand() < 0.5
    const fixed = changeSource ? toStrId(e.target) : toStrId(e.source)

    let newNode = nodeIds[Math.floor(rand() * nodeIds.length)]!
    let guard = 0
    while (
      guard++ < 30 &&
      (newNode === fixed ||
        hasEdge(
          edges,
          changeSource ? newNode : toStrId(e.source),
          changeSource ? toStrId(e.target) : newNode,
        ))
    ) {
      newNode = nodeIds[Math.floor(rand() * nodeIds.length)]!
    }

    if (changeSource) e.source = newNode
    else e.target = newNode

    if (toStrId(e.source) === toStrId(e.target)) {
      const others = nodeIds.filter((x) => x !== toStrId(e.source))
      if (others.length > 0) e.target = others[Math.floor(rand() * others.length)]!
    }
  }

  let localId = 100000
  for (let i = 0; i < PERTURB_ADD_EDGE_COUNT; i++) {
    let a = nodeIds[Math.floor(rand() * nodeIds.length)]!
    let b = nodeIds[Math.floor(rand() * nodeIds.length)]!
    let guard = 0
    while (guard++ < 30 && (a === b || hasEdge(edges, a, b))) {
      a = nodeIds[Math.floor(rand() * nodeIds.length)]!
      b = nodeIds[Math.floor(rand() * nodeIds.length)]!
    }
    if (a !== b && !hasEdge(edges, a, b)) {
      edges.push({
        id: `p_e${localId++}`,
        source: a,
        target: b,
        sign: rand() < 0.5 ? 1 : -1,
      })
    }
  }

  setEdges(g, edges)
  return g as GraphData
}

// ===== composable =====
export function useDemoGraphPipeline(args: UseDemoGraphPipelineArgs) {
  const { demoGraphs, initialKey } = args

  const selectedDemoKey = ref<string>(initialKey)

  // 总图模式：聚合全部示例网络为一张图再跑管线
  const aggregateGraphOn = ref(false)

  // 隐私子模式：聚合展示（SymbolNetworkView.vue 已在用）
  const aggregateOn = ref(false)

  const privacyOn = ref(false)
  const compareOn = ref(false)

  watch(privacyOn, (on) => {
    if (!on) compareOn.value = false
  })

  const aggregatedRawGraph: ComputedRef<GraphData> = computed(() => aggregateAllGraphs(demoGraphs))

  const activeKey = computed(() => (aggregateGraphOn.value ? AGG_KEY : selectedDemoKey.value))

  const activeRawGraph: ComputedRef<GraphData> = computed(() => {
    if (aggregateGraphOn.value) return aggregatedRawGraph.value
    return demoGraphs[selectedDemoKey.value] ?? ({ nodes: [], edges: [] } as any as GraphData)
  })
  const rawGraph = computed<GraphData>(() => activeRawGraph.value)

  // 必须是 {}，并且必须 return
  const encryptedGraphs = ref<Record<string, GraphData>>({})
  const encryptedSeeds = ref<Record<string, number>>({})

  function ensureEncryptedCurrent() {
    if (!privacyOn.value) return
    const k = activeKey.value
    if (encryptedGraphs.value[k]) return

    const baseSeed = Date.now() >>> 0
    const seed = (baseSeed ^ hashStrToSeed(k)) >>> 0
    encryptedSeeds.value = { ...encryptedSeeds.value, [k]: seed }
    encryptedGraphs.value = { ...encryptedGraphs.value, [k]: perturbGraph(activeRawGraph.value, seed) }
  }

  watch([privacyOn, selectedDemoKey, aggregateGraphOn], () => {
    if (privacyOn.value) ensureEncryptedCurrent()
  })

  function reEncryptCurrent() {
    if (!privacyOn.value) return
    const k = activeKey.value
    const baseSeed = Date.now() >>> 0
    const seed = (baseSeed ^ hashStrToSeed(k)) >>> 0
    encryptedSeeds.value = { ...encryptedSeeds.value, [k]: seed }
    encryptedGraphs.value = { ...encryptedGraphs.value, [k]: perturbGraph(activeRawGraph.value, seed) }
  }

  function clearEncryptionAll() {
    encryptedGraphs.value = {}
    encryptedSeeds.value = {}
    privacyOn.value = false
  }

  function selectDemo(k: string) {
    selectedDemoKey.value = k
  }

  // Step1：对 activeRawGraph 聚簇
  const baseModel = computed(() => {
    const k = activeKey.value
    const seed = hashStrToSeed(`kmeans:base:${k}`)
    return clusterGraphKMeans(activeRawGraph.value, KMEANS_K, seed)
  })

  const baseGraph = computed<GraphData>(() => baseModel.value.clustered)

  // Step2：对扰动图再聚簇
  const encryptedCurrentGraph = computed<GraphData>(() => {
    const k = activeKey.value
    const raw = encryptedGraphs.value[k]
    if (!raw) return baseGraph.value

    if (RECLUSTER_MODE === 'refit') {
      const seed = hashStrToSeed(`kmeans:enc_refit:${k}:${encryptedSeeds.value[k] ?? 0}`)
      return clusterGraphKMeans(raw, KMEANS_K, seed).clustered
    }

    const { stats, centroids } = baseModel.value
    const { nodeIds, features } = computeSignedNodeFeatures(raw)
    if (nodeIds.length === 0) return attachClusters(raw, [], [])
    const data = standardize(features, stats)
    const labels = kmeansPredict(data, centroids)
    return attachClusters(raw, nodeIds, labels)
  })

  const compareGraph = computed<GraphDataWithEdgeKind>(() => {
    return makeCompareGraph(baseGraph.value, encryptedCurrentGraph.value)
  })

  const displayMode = computed<DisplayMode>(() => {
    if (!privacyOn.value) return 'normal'
    if (compareOn.value) return 'compare'
    return 'privacy'
  })

  const graphForRender = computed<GraphData | GraphDataWithEdgeKind>(() => {
    // 默认展示“原始图”（不带 clusters/group）
    if (!privacyOn.value) return rawGraph.value
  
    // 隐私模式下：要么对比，要么展示扰动后再聚簇的结果
    if (compareOn.value) return compareGraph.value
    return encryptedCurrentGraph.value
  })
  
  

  return {
    selectedDemoKey,
    aggregateGraphOn, // 总图模式按钮用
    aggregateOn,      // 隐私子模式“聚合展示”用
    privacyOn,
    compareOn,

    rawGraph,

    encryptedGraphs,  // 模板 Object.keys 需要这个
    encryptedSeeds,   // 可选但建议保留

    baseGraph,
    encryptedCurrentGraph,
    compareGraph,

    graphForRender,
    displayMode,

    selectDemo,
    reEncryptCurrent,
    clearEncryptionAll,
  }
}
