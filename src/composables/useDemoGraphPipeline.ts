// File: src/composables/useDemoGraphPipeline.ts
import { computed, ref, watch, type ComputedRef } from 'vue';
import type { GraphData } from '../types/symbolNetwork';
import { makeCompareGraph, type GraphDataWithEdgeKind } from '../utils/graphCompare';
import type { DisplayMode } from '../utils/buildSphereGraphOption';

export interface UseDemoGraphPipelineArgs {
  demoGraphs: Record<string, GraphData>;
  initialKey: string;
}

/** ====== 扰动参数（常量）====== */
const ENCRYPT_FLIP_EDGE_RATE = 0.18;
const ENCRYPT_REWIRE_EDGE_RATE = 0.12;
const ENCRYPT_ADD_EDGE_COUNT = 2;
const ENCRYPT_REMOVE_EDGE_COUNT = 1;

function hashStrToSeed(s: string): number {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne<T>(arr: T[], rand: () => number): T {
  if (arr.length === 0) {
    throw new Error('pickOne: empty array');
  }
  const idx = Math.floor(rand() * arr.length);
  return arr[idx]!; // arr 非空，idx 一定有效
}

function deepCloneGraph(g: GraphData): GraphData {
  return {
    nodes: g.nodes.map((n) => ({ ...n })),
    edges: g.edges.map((e) => ({ ...e })),
    clusters: g.clusters ? { ...g.clusters } : undefined,
  };
}

// 无向意义下重复边检测
function hasEdge(edges: GraphData['edges'], a: string, b: string) {
  return edges.some(
    (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a)
  );
}

// 对单个网络做“随机扰动”，返回新图（不修改原图）
function encryptGraph(original: GraphData, seed: number): GraphData {
  const rand = mulberry32(seed);
  const g = deepCloneGraph(original);

  if (g.nodes.length < 2) return g;
  const nodeIds = g.nodes.map((n) => n.id);

  // 0) 先随机删几条边
  for (let i = 0; i < ENCRYPT_REMOVE_EDGE_COUNT && g.edges.length > 0; i++) {
    const idx = Math.floor(rand() * g.edges.length);
    if (idx < 0 || idx >= g.edges.length) continue;
    g.edges.splice(idx, 1);
  }

  // 1) 翻转一部分边 sign
  const flipCount = Math.floor(g.edges.length * ENCRYPT_FLIP_EDGE_RATE);
  for (let i = 0; i < flipCount && g.edges.length > 0; i++) {
    const idx = Math.floor(rand() * g.edges.length);
    const e = g.edges[idx];
    if (!e) continue;
    e.sign = e.sign === 1 ? -1 : 1;
  }

  // 2) 重连一部分边：随机换一个端点（避免自环、尽量避免重复边）
  const rewireCount = Math.floor(g.edges.length * ENCRYPT_REWIRE_EDGE_RATE);
  for (let i = 0; i < rewireCount && g.edges.length > 0; i++) {
    const idx = Math.floor(rand() * g.edges.length);
    const e = g.edges[idx];
    if (!e) continue;

    const changeSource = rand() < 0.5;

    let newNode = pickOne(nodeIds, rand);
    let guard = 0;

    while (
      guard++ < 20 &&
      (newNode === (changeSource ? e.target : e.source) ||
        hasEdge(
          g.edges,
          changeSource ? newNode : e.source,
          changeSource ? e.target : newNode
        ))
    ) {
      newNode = pickOne(nodeIds, rand);
    }

    if (changeSource) e.source = newNode;
    else e.target = newNode;

    // 兜底：避免自环
    if (e.source === e.target) {
      const others = nodeIds.filter((x) => x !== e.source);
      if (others.length > 0) e.target = pickOne(others, rand);
    }
  }

  // 3) 额外随机加几条边
  let edgeIdCounterLocal = 10000;
  for (let i = 0; i < ENCRYPT_ADD_EDGE_COUNT; i++) {
    let a = pickOne(nodeIds, rand);
    let b = pickOne(nodeIds, rand);

    let guard = 0;
    while (guard++ < 20 && (a === b || hasEdge(g.edges, a, b))) {
      a = pickOne(nodeIds, rand);
      b = pickOne(nodeIds, rand);
    }

    if (a !== b && !hasEdge(g.edges, a, b)) {
      g.edges.push({
        id: `enc_e${edgeIdCounterLocal++}`,
        source: a,
        target: b,
        sign: rand() < 0.5 ? 1 : -1,
      });
    }
  }

  return g;
}

/** ====== pipeline 主体 ====== */
export function useDemoGraphPipeline(args: UseDemoGraphPipelineArgs) {
  const { demoGraphs, initialKey } = args;

  const selectedDemoKey = ref<string>(initialKey);
  const privacyOn = ref(false);
  const compareOn = ref(false);
  const aggregateOn = ref(false);

  // 隐私模式关掉时，两个都关
  watch(privacyOn, (on) => {
    if (!on) {
      compareOn.value = false;
      aggregateOn.value = false;
    }
  });

  // compare 与 aggregate 互斥：开一个就关另一个
  watch(compareOn, (on) => {
    if (on) aggregateOn.value = false;
  });
  watch(aggregateOn, (on) => {
    if (on) compareOn.value = false;
  });

  // 扰动副本（仅 demo）
  const encryptedGraphs = ref<Record<string, GraphData>>({});

  function selectDemo(k: string) {
    selectedDemoKey.value = k;
  }

  const baseGraph: ComputedRef<GraphData> = computed(() => {
    return demoGraphs[selectedDemoKey.value] ?? { nodes: [], edges: [] };
  });

  const encryptedCurrentGraph = computed<GraphData>(() => {
    const k = selectedDemoKey.value;
    return encryptedGraphs.value[k] ?? baseGraph.value;
  });

  function ensureEncryptedCurrent() {
    const k = selectedDemoKey.value;
    const g = demoGraphs[k];
    if (!g) return;
    if (encryptedGraphs.value[k]) return;

    const baseSeed = Date.now() >>> 0;
    const seed = (baseSeed ^ hashStrToSeed(k)) >>> 0;

    encryptedGraphs.value = {
      ...encryptedGraphs.value,
      [k]: encryptGraph(g, seed),
    };
  }

  // 只要隐私模式打开，就确保当前网络有扰动副本
  watch([privacyOn, selectedDemoKey], ([p]) => {
    if (p) ensureEncryptedCurrent();
  });

  function reEncryptCurrent() {
    const k = selectedDemoKey.value;
    const g = demoGraphs[k];
    if (!g) return;
    if (!privacyOn.value) return;

    const baseSeed = Date.now() >>> 0;
    const seed = (baseSeed ^ hashStrToSeed(k)) >>> 0;

    encryptedGraphs.value = {
      ...encryptedGraphs.value,
      [k]: encryptGraph(g, seed),
    };
  }

  function clearEncryptionAll() {
    encryptedGraphs.value = {};
    privacyOn.value = false; // watch 会自动关 compare/aggregate
  }

  // 这里改成你项目现有的导出：makeCompareGraph
  const compareGraph = computed<GraphDataWithEdgeKind>(() => {
    return makeCompareGraph(baseGraph.value, encryptedCurrentGraph.value);
  });

  const displayMode = computed<DisplayMode>(() => {
    if (!privacyOn.value) return 'normal';
    if (compareOn.value) return 'compare';
    return 'privacy';
  });

  const graphForRender = computed<GraphData | GraphDataWithEdgeKind>(() => {
    if (!privacyOn.value) return baseGraph.value;
    if (compareOn.value) return compareGraph.value;
    return encryptedCurrentGraph.value;
  });

  return {
    selectedDemoKey,
    privacyOn,
    compareOn,
    aggregateOn,

    encryptedGraphs,
    baseGraph,
    graphForRender,
    displayMode,

    selectDemo,
    reEncryptCurrent,
    clearEncryptionAll,
  };
}
