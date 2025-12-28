// File: src/data/demoGraphs.ts
import type { GraphData } from '../types/symbolNetwork'

type GraphMeta = { title: string; desc?: string }
type AnyModule = Record<string, any>

// 读取 ./networks 目录下所有 ts（按你的工程结构调整：demoGraphs.ts 与 networks 同级）
const modules = import.meta.glob('./networks/*.ts', { eager: true }) as Record<string, AnyModule>

function isGraphData(x: any): x is GraphData {
  return (
    !!x &&
    typeof x === 'object' &&
    Array.isArray(x.nodes) &&
    (Array.isArray((x as any).edges) || Array.isArray((x as any).links))
  )
}

function getEdgesCount(g: any): number {
  return ((g?.edges ?? g?.links) as any[])?.length ?? 0
}

/**
 * 支持两种 networks 文件导出形式：
 * 1) export default GraphData
 * 2) export default { id, title, desc?, graph: GraphData }
 */
function pickNetwork(mod: AnyModule, fallbackKey: string): { key: string; graph: GraphData; meta: GraphMeta } | null {
  const d = mod?.default ?? mod

  // 形式 2：包装对象
  if (d && typeof d === 'object' && isGraphData(d.graph) && typeof d.title === 'string') {
    const key = typeof d.id === 'string' && d.id ? d.id : fallbackKey
    return {
      key,
      graph: d.graph as GraphData,
      meta: { title: d.title, desc: typeof d.desc === 'string' ? d.desc : undefined },
    }
  }

  // 形式 1：直接 GraphData
  if (isGraphData(d)) {
    return {
      key: fallbackKey,
      graph: d as GraphData,
      meta: { title: fallbackKey },
    }
  }

  // 也兼容命名导出 graph
  if (isGraphData(mod?.graph)) {
    return {
      key: fallbackKey,
      graph: mod.graph as GraphData,
      meta: { title: fallbackKey },
    }
  }

  return null
}

const list: Array<{ key: string; graph: GraphData; meta: GraphMeta }> = []

for (const [path, mod] of Object.entries(modules)) {
  const file = path.split('/').pop() ?? path
  const fallbackKey = file.replace(/\.ts$/, '')
  const x = pickNetwork(mod, fallbackKey)
  if (x) list.push(x)
}

// 稳定排序：优先 title，再 key
list.sort((a, b) => (a.meta.title || a.key).localeCompare(b.meta.title || b.key, 'zh-Hans-CN'))

export const demoGraphs: Record<string, GraphData> = Object.fromEntries(list.map((x) => [x.key, x.graph]))
export const demoGraphMeta: Record<string, GraphMeta> = Object.fromEntries(list.map((x) => [x.key, x.meta]))
export const demoKeys: string[] = list.map((x) => x.key)

// 可选：方便你调试确认是否读到了边
export const demoSummary = list.map((x) => ({
  key: x.key,
  title: x.meta.title,
  nodes: x.graph.nodes?.length ?? 0,
  edges: getEdgesCount(x.graph as any),
}))
