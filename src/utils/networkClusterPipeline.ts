import type { BasicNetwork } from './signedNodeFeatures'
import { computeSignedNodeFeatures, fitStandardize, standardize, type StandardizeStats } from './signedNodeFeatures'
import { kmeans, kmeansPredict, type KMeansResult } from './kmeans'
import { perturbNetwork, type PerturbOptions } from './networkPerturbation'

export interface ClusterPipelineOptions {
  k: number
  seed?: number
  perturb?: PerturbOptions
}

export interface ClusteredNetworkResult {
  original: BasicNetwork
  clusteredOriginal: BasicNetwork
  perturbed: BasicNetwork
  clusteredPerturbed: BasicNetwork
  model: {
    stats: StandardizeStats
    kmeans: KMeansResult
  }
}

function applyLabels(net: BasicNetwork, labels: number[], field: 'clusterId' | 'group' = 'group'): BasicNetwork {
  const nodes = net.nodes.map((n, i) => {
    const c = labels[i] ?? 0
    return field === 'group' ? { ...n, group: c, clusterId: c } : { ...n, clusterId: c }
  })
  return { ...net, nodes }
}

export function runClusterPipeline(networks: BasicNetwork[], opts: ClusterPipelineOptions) {
  const allRaw: number[][] = []
  const counts: number[] = []

  for (const net of networks) {
    const raw = computeSignedNodeFeatures(net)
    counts.push(raw.length)
    allRaw.push(...raw)
  }

  const stats = fitStandardize(allRaw)
  const allStd = standardize(allRaw, stats)
  const km = kmeans(allStd, { k: opts.k, seed: opts.seed ?? 7 })

  let offset = 0
  const clusteredOriginalList: BasicNetwork[] = []
  const perturbedList: BasicNetwork[] = []
  const clusteredPerturbedList: BasicNetwork[] = []

  networks.forEach((net, ni) => {
    const count = counts[ni] ?? net.nodes.length

    const labels0 = km.labels.slice(offset, offset + count)
    offset += count

    const clustered0 = applyLabels(net, labels0, 'group')
    clusteredOriginalList.push(clustered0)

    const p = perturbNetwork(net, { ...(opts.perturb ?? {}), seed: (opts.perturb?.seed ?? 1000) + ni })
    perturbedList.push(p)

    const pRaw = computeSignedNodeFeatures(p)
    const pStd = standardize(pRaw, stats)

    const labels1 = kmeansPredict(pStd, km.centroids)
    const clustered1 = applyLabels(p, labels1, 'group')
    clusteredPerturbedList.push(clustered1)
  })

  return {
    clusteredOriginalList,
    perturbedList,
    clusteredPerturbedList,
    model: { stats, kmeans: km },
  }
}

