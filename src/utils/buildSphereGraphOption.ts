// File: src/utils/buildSphereGraphOption.ts
import type * as echarts from 'echarts';
import type { GraphData } from '../types/symbolNetwork';
import type { GraphDataWithEdgeKind, EdgeKind } from './graphCompare';
import { computeSphereLayout, type Coord3D } from './sphereLayout';

export type DisplayMode = 'normal' | 'privacy' | 'compare';

export interface BuildSphereOptionArgs {
  graph: GraphData | GraphDataWithEdgeKind;
  displayMode: DisplayMode;
  drawEdges: boolean;
  layoutMode?: 'sphere' | 'clustered';

  radius?: number;

  // 节点配色
  clusterColors?: string[];
  defaultNodeColor?: string;

  // triad 高亮（无向 edgeKey: "A__B"）
  highlightNodes?: Set<string>;
  highlightEdges?: Set<string>;
}

type EChartsGLOption = echarts.EChartsOption & {
  xAxis3D?: any;
  yAxis3D?: any;
  zAxis3D?: any;
  grid3D?: any;
  globe?: any;
  series?: any;
};

function fibonacciPoints(count: number, radius: number): Coord3D[] {
  if (count <= 0) return [];
  if (count === 1) return [[0, 0, radius]];

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const out: Coord3D[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const y = 1 - 2 * t;
    const rr = Math.sqrt(1 - y * y);
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * rr;
    const z = Math.sin(theta) * rr;
    out.push([x * radius, y * radius, z * radius]);
  }
  return out;
}

function computeClusteredLayout(
  nodes: GraphData['nodes'],
  clusters: Record<string, number>,
  radius: number
): Record<string, Coord3D> {
  const coords: Record<string, Coord3D> = {};
  if (!nodes.length) return coords;

  const grouped = new Map<string, string[]>();
  for (const node of nodes) {
    const clusterId = clusters[node.id];
    const key = Number.isFinite(clusterId) ? String(clusterId) : `__solo_${node.id}`;
    const list = grouped.get(key) ?? [];
    list.push(node.id);
    grouped.set(key, list);
  }

  const clusterKeys = Array.from(grouped.keys());
  const clusterCenters = fibonacciPoints(clusterKeys.length, radius * 1.0);

  clusterKeys.forEach((key, i) => {
    const center = clusterCenters[i] ?? [0, 0, 0];
    const members = grouped.get(key) ?? [];
    const localRadius =
      members.length <= 1
        ? 0
        : Math.min(radius * 0.34, radius * (0.095 + Math.sqrt(members.length) * 0.045));
    const localOffsets = fibonacciPoints(Math.max(1, members.length), localRadius);

    members.forEach((nodeId, j) => {
      const offset = localOffsets[j] ?? [0, 0, 0];
      coords[nodeId] = [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]];
    });
  });

  return coords;
}

function edgeKeyUndirected(u: string, v: string) {
  return u < v ? `${u}__${v}` : `${v}__${u}`;
}

/** triad（不平衡三角形）高亮颜色：橙色 */
const TRIAD_HIGHLIGHT_COLOR = '#ff8a00';
/** triad 高亮边额外加粗 */
const TRIAD_EDGE_WIDTH_ADD = 4;
/** triad 高亮节点描边宽度 */
const TRIAD_NODE_BORDER_WIDTH = 2;

function edgeStyleByMode(
  mode: DisplayMode,
  sign: 1 | -1,
  kind?: EdgeKind
): { color: string; opacity: number; type?: 'solid' | 'dashed' | 'dotted'; width?: number } {
  if (mode === 'privacy') {
    return { color: '#9aa3ad', opacity: 0.75, type: 'dotted', width: 2 };
  }

  if (mode === 'compare') {
    if (kind === 'spurious') return { color: '#ffd166', opacity: 0.95, type: 'dashed', width: 2 };

    // missing（丢失边）——灰色不清晰就改这里
    if (kind === 'missing') return { color: '#cbd5e1', opacity: 0.95, type: 'dashed', width: 3 };

    // real：按 sign
    return {
      color: sign === 1 ? '#16a34a' : '#dc2626',
      opacity: 0.9,
      type: 'solid',
      width: 2,
    };
  }

  // normal
  return {
    color: sign === 1 ? '#16a34a' : '#dc2626',
    opacity: 0.9,
    type: 'solid',
    width: 2,
  };
}

export function buildSphereGraphOption(args: BuildSphereOptionArgs): EChartsGLOption {
  const {
    graph,
    displayMode,
    drawEdges,
    layoutMode = 'sphere',
    radius = 5.5,
    clusterColors = ['#66ccff', '#ffcc66', '#9cff7a', '#ff7ad9'],
    defaultNodeColor = '#ffffff',
    highlightNodes = new Set<string>(),
    highlightEdges = new Set<string>(),
  } = args;

  if (!graph.nodes.length) return { series: [] };

  const clusters = ((graph as any).clusters || {}) as Record<string, number>;
  const baseCoords =
    layoutMode === 'clustered' && Object.keys(clusters).length > 0
      ? computeClusteredLayout(graph.nodes, clusters, radius)
      : computeSphereLayout(graph.nodes, radius);
  // Keep x/y/z isotropic so a sphere stays visually spherical even on larger graphs.
  const coords: Record<string, Coord3D> = {};
  let maxAbsCoord = radius;
  for (const [nodeId, coord] of Object.entries(baseCoords)) {
    coords[nodeId] = [coord[0], coord[1], coord[2]];
    maxAbsCoord = Math.max(maxAbsCoord, Math.abs(coord[0]), Math.abs(coord[1]), Math.abs(coord[2]));
  }
  const axisPadding = layoutMode === 'clustered' ? 1.16 : 1.08;
  const axisExtent = maxAbsCoord * axisPadding;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const node of graph.nodes) {
    const coord = coords[node.id];
    if (!coord) continue;
    cx += coord[0];
    cy += coord[1];
    cz += coord[2];
  }
  const denom = Math.max(1, graph.nodes.length);
  const targetCoord: Coord3D = [cx / denom, cy / denom, cz / denom];

  const nodeData = graph.nodes.map((node) => {
    const [x, y, z] = coords[node.id] as Coord3D;
    const cIndex = (clusters as any)[node.id] as number | undefined;

    const baseColor =
      typeof cIndex === 'number' ? clusterColors[cIndex % clusterColors.length] : defaultNodeColor;

    const hi = highlightNodes.has(node.id);

    return {
      name: node.label,
      value: [x, y, z],
      nodeId: node.id,
      clusterIndex: cIndex,

      // per-node 大小
      symbolSize: hi ? (layoutMode === 'clustered' ? 11 : 10) : layoutMode === 'clustered' ? 7 : 6,

      itemStyle: {
        color: baseColor,
        opacity: 1,

        // triad 节点：用橙色描边提示
        borderWidth: hi ? TRIAD_NODE_BORDER_WIDTH : 0,
        borderColor: hi ? TRIAD_HIGHLIGHT_COLOR : 'rgba(0,0,0,0)',
      },
    };
  });

  const edgeSeries = drawEdges
    ? (graph.edges as any[]).map((e: any) => {
        const c1 = coords[e.source] as Coord3D;
        const c2 = coords[e.target] as Coord3D;
        const sign: 1 | -1 = e.sign === 1 ? 1 : -1;

        const st = edgeStyleByMode(displayMode, sign, e.kind);

        // triad 高亮：命中的边直接染成橙色，更直观
        const key = edgeKeyUndirected(e.source, e.target);
        const hi = highlightEdges.has(key);

        return {
          type: 'line3D',
          coordinateSystem: 'cartesian3D',
          data: [
            [c1[0], c1[1], c1[2]],
            [c2[0], c2[1], c2[2]],
          ],
          lineStyle: {
            width: (st.width ?? 2) + (hi ? TRIAD_EDGE_WIDTH_ADD : 0),
            color: hi ? TRIAD_HIGHLIGHT_COLOR : st.color,
            opacity: hi ? 1 : st.opacity,
            // 保留 compare 模式下 dashed/dotted 语义（只换颜色）
            type: st.type ?? 'solid',
          },
        };
      })
    : [];

  const option: EChartsGLOption = {
    tooltip: {
      axisPointer: { show: false },
      formatter: (params: any) => {
        if (params.seriesType === 'scatter3D') {
          const c = params.data?.clusterIndex;
          if (typeof c === 'number') return `节点：${params.data.nodeId}<br/>簇：${c}`;
          return `节点：${params.data.nodeId}`;
        }
        return '';
      },
    },

    xAxis3D: {
      type: 'value',
      min: -axisExtent,
      max: axisExtent,
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisTick: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisLabel: { show: true, textStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisPointer: { show: false },
    },
    yAxis3D: {
      type: 'value',
      min: -axisExtent,
      max: axisExtent,
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisTick: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisLabel: { show: true, textStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisPointer: { show: false },
    },
    zAxis3D: {
      type: 'value',
      min: -axisExtent,
      max: axisExtent,
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisTick: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisLabel: { show: true, textStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisPointer: { show: false },
    },

    grid3D: {
      boxWidth: layoutMode === 'clustered' ? 168 : 158,
      boxHeight: layoutMode === 'clustered' ? 168 : 158,
      boxDepth: layoutMode === 'clustered' ? 168 : 158,
      viewControl: {
        autoRotate: true,
        autoRotateSpeed: 5,
        projection: 'perspective',
        distance: layoutMode === 'clustered' ? 186 : 196,
        minDistance: 108,
        maxDistance: 420,
        targetCoord,
      },
    },

    globe: { show: false },

    series: [
      {
        type: 'scatter3D',
        coordinateSystem: 'cartesian3D',
        // 这里保持一个默认值，单点可被 data[i].symbolSize 覆盖
        symbolSize: layoutMode === 'clustered' ? 7 : 6,
        data: nodeData,
        label: {
          show: true,
          formatter: '{b}',
          distance: 2,
        },
      },
      ...edgeSeries,
    ],
  };

  return option;
}
