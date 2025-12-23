<template>
  <div class="symbol-page">
    <!-- 左侧数据区 -->
    <aside class="symbol-sidebar">
      <h2 class="sidebar-title">数据区：符号网络</h2>

      <!-- 数据来源切换 -->
      <div class="sidebar-section">
        <label class="section-label">数据来源：</label>
        <div class="radio-group">
          <label>
            <input type="radio" value="demo" v-model="dataSource" />
            示例网络
          </label>
          <label>
            <input type="radio" value="custom" v-model="dataSource" />
            自定义网络
          </label>
        </div>
      </div>

      <!-- 示例网络：网络选择区（点击切换） -->
      <div v-if="dataSource === 'demo'" class="sidebar-section">
        <div class="section-title-row">
          <label class="section-label">网络选择：</label>

          <div class="title-actions">
            <button
              class="btn btn-small"
              type="button"
              @click="encryptAllDemo"
              :disabled="demoKeys.length === 0"
              title="对所有示例网络生成加密副本"
            >
              加密
            </button>

            <button
              class="btn btn-small"
              type="button"
              @click="resetEncryption"
              :disabled="Object.keys(encryptedGraphs).length === 0"
              title="还原为原始示例网络"
            >
              解密
            </button>
          </div>
        </div>

        <div class="net-list">
          <button
            v-for="k in demoKeys"
            :key="k"
            type="button"
            class="net-item"
            :class="{ active: k === selectedDemoKey }"
            @click="selectDemo(k)"
          >
            <div class="net-title">{{ demoGraphMeta[k]?.title ?? k }}</div>
            <div class="net-meta">
              节点 {{ (encryptedGraphs[k] ?? demoGraphs[k])?.nodes.length ?? 0 }}
              · 边 {{ (encryptedGraphs[k] ?? demoGraphs[k])?.edges.length ?? 0 }}
            </div>
          </button>
        </div>

        <p class="hint">
          当前选中：{{ selectedDemoKey }}（节点 {{ currentGraph.nodes.length }} 个，边
          {{ currentGraph.edges.length }} 条）
        </p>
      </div>

      <!-- 自定义网络：添加节点 / 边 -->
      <div v-else class="sidebar-section">
        <label class="section-label">自定义网络：</label>

        <!-- 添加节点 -->
        <div class="form-block">
          <div class="form-label">添加节点：</div>
          <div class="form-row">
            <input
              v-model="newNodeLabel"
              type="text"
              placeholder="节点名称，如 A / B / C"
              class="input"
            />
            <button class="btn" type="button" @click="addNode">添加</button>
          </div>
          <p class="hint">当前节点：{{ customGraph.nodes.length }} 个</p>
        </div>

        <!-- 添加边 -->
        <div class="form-block">
          <div class="form-label">添加边：</div>

          <div class="form-row">
            <select v-model="newEdgeSource" class="select">
              <option value="" disabled>起点</option>
              <option v-for="n in customGraph.nodes" :key="n.id" :value="n.id">
                {{ n.label }}
              </option>
            </select>

            <select v-model="newEdgeTarget" class="select">
              <option value="" disabled>终点</option>
              <option v-for="n in customGraph.nodes" :key="n.id" :value="n.id">
                {{ n.label }}
              </option>
            </select>
          </div>

          <div class="form-row form-row-small">
            <label>
              <input type="radio" value="1" v-model.number="newEdgeSign" />
              正边（+，友好）
            </label>
            <label>
              <input type="radio" value="-1" v-model.number="newEdgeSign" />
              负边（-，敌对）
            </label>
          </div>

          <button
            class="btn"
            type="button"
            @click="addEdge"
            :disabled="customGraph.nodes.length < 2"
          >
            添加边
          </button>

          <p class="hint">当前边：{{ customGraph.edges.length }} 条</p>
        </div>
      </div>
    </aside>

    <!-- 右侧图形区 -->
    <main class="symbol-main">
      <div class="chart-container">
        <div ref="chartDom" class="chart-root"></div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GraphData } from '../types/symbolNetwork';
import { demoGraphs, demoGraphMeta, demoKeys } from '../data/demoGraphs';

// ECharts 相关
import * as echarts from 'echarts';
import 'echarts-gl';

import { computeSphereLayout, type Coord3D } from '../utils/sphereLayout';

type DataSourceType = 'demo' | 'custom';

// 给 echarts-gl 用的宽松 Option 类型
type EChartsGLOption = echarts.EChartsOption & {
  xAxis3D?: any;
  yAxis3D?: any;
  zAxis3D?: any;
  grid3D?: any;
  globe?: any;
  series?: any;
};

// demo keys（用于左侧可点击列表）
const selectedDemoKey = ref<string>(demoKeys[0] ?? '');
const dataSource = ref<DataSourceType>('demo');

function selectDemo(k: string) {
  selectedDemoKey.value = k;
}

// ====== 加密态：只影响展示，不改 demoGraphs 原始数据 ======
const encryptedGraphs = ref<Record<string, GraphData>>({});

// ====== 加密参数（常量，后续要做强度滑条就改这里）======
const ENCRYPT_FLIP_EDGE_RATE = 0.18; // 翻转边符号比例
const ENCRYPT_REWIRE_EDGE_RATE = 0.12; // 重连端点比例
const ENCRYPT_ADD_EDGE_COUNT = 2; // 额外加边
const ENCRYPT_REMOVE_EDGE_COUNT = 1; // 额外删边

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
  return arr[Math.floor(rand() * arr.length)];
}

function deepCloneGraph(g: GraphData): GraphData {
  return {
    nodes: g.nodes.map((n) => ({ ...n })),
    edges: g.edges.map((e) => ({ ...e })),
    clusters: g.clusters ? { ...g.clusters } : undefined,
  };
}

// 无向意义下的重复边检测（你也可以改成有向）
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
    g.edges.splice(idx, 1);
  }

  // 1) 翻转一部分边 sign
  const flipCount = Math.floor(g.edges.length * ENCRYPT_FLIP_EDGE_RATE);
  for (let i = 0; i < flipCount && g.edges.length > 0; i++) {
    const idx = Math.floor(rand() * g.edges.length);
    g.edges[idx].sign = g.edges[idx].sign === 1 ? -1 : 1;
  }

  // 2) 重连一部分边：随机换一个端点（避免自环、尽量避免重复边）
  const rewireCount = Math.floor(g.edges.length * ENCRYPT_REWIRE_EDGE_RATE);
  for (let i = 0; i < rewireCount && g.edges.length > 0; i++) {
    const idx = Math.floor(rand() * g.edges.length);
    const e = g.edges[idx];

    const changeSource = rand() < 0.5;

    let newNode = pickOne(nodeIds, rand);
    let guard = 0;
    while (
      guard++ < 20 &&
      (newNode === (changeSource ? e.target : e.source) ||
        hasEdge(g.edges, changeSource ? newNode : e.source, changeSource ? e.target : newNode))
    ) {
      newNode = pickOne(nodeIds, rand);
    }

    if (changeSource) e.source = newNode;
    else e.target = newNode;

    // 兜底：避免自环
    if (e.source === e.target) {
      e.target = pickOne(nodeIds.filter((x) => x !== e.source), rand);
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

// 一键加密：对所有 demo 网络生成加密副本
function encryptAllDemo() {
  const baseSeed = Date.now() >>> 0; // 每次点击产生不同加密结果
  const out: Record<string, GraphData> = {};

  for (const k of demoKeys) {
    const g = demoGraphs[k];
    if (!g) continue;

    const seed = (baseSeed ^ hashStrToSeed(k)) >>> 0;
    out[k] = encryptGraph(g, seed);
  }

  encryptedGraphs.value = out;
}

function resetEncryption() {
  encryptedGraphs.value = {};
}

// ====== 自定义网络数据 ======
const customGraph = ref<GraphData>({
  nodes: [],
  edges: [],
});

// ---------- 自建网表单状态 & 方法 ----------
const newNodeLabel = ref('');
const newEdgeSource = ref<string>('');
const newEdgeTarget = ref<string>('');
const newEdgeSign = ref<1 | -1>(1);

let edgeIdCounter = 1;

function addNode() {
  const label = newNodeLabel.value.trim();
  if (!label) return;

  const id = label; // 简单起见：id 直接用名称
  if (customGraph.value.nodes.some((n) => n.id === id)) return;

  customGraph.value.nodes.push({ id, label });
  newNodeLabel.value = '';

  if (!newEdgeSource.value) newEdgeSource.value = id;
  if (!newEdgeTarget.value && customGraph.value.nodes.length >= 2) {
    const n0 = customGraph.value.nodes[0]?.id;
    const n1 = customGraph.value.nodes[1]?.id;
    newEdgeTarget.value = n0 === id ? (n1 ?? '') : (n0 ?? '');
  }
}

function addEdge() {
  if (!newEdgeSource.value || !newEdgeTarget.value) return;
  if (newEdgeSource.value === newEdgeTarget.value) return;

  const id = `e${edgeIdCounter++}`;
  customGraph.value.edges.push({
    id,
    source: newEdgeSource.value,
    target: newEdgeTarget.value,
    sign: newEdgeSign.value,
  });
}

// ---------- 当前用于展示的图 ----------
const currentGraph = computed<GraphData>(() => {
  if (dataSource.value === 'demo') {
    const k = selectedDemoKey.value;
    return encryptedGraphs.value[k] ?? demoGraphs[k] ?? { nodes: [], edges: [] };
  }
  return customGraph.value;
});

// ---------- ECharts 初始化与更新 ----------
const chartDom = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;

// 簇颜色表（示例网络若带 clusters，则会按簇上色）
const clusterColors = ['#66ccff', '#ffcc66', '#9cff7a', '#ff7ad9'];
const defaultNodeColor = '#ffffff';

function buildSphereGraphOption(graph: GraphData): EChartsGLOption {
  if (!graph.nodes.length) {
    return { series: [] };
  }

  const radius = 10;
  const coords = computeSphereLayout(graph.nodes, radius);

  const clusters = graph.clusters || {};

  const nodeData = graph.nodes.map((node) => {
    const [x, y, z] = coords[node.id] as Coord3D;
    const cIndex = (clusters as any)[node.id] as number | undefined;
    const color =
      typeof cIndex === 'number'
        ? clusterColors[cIndex % clusterColors.length]
        : defaultNodeColor;

    return {
      name: node.label,
      value: [x, y, z],
      nodeId: node.id,
      clusterIndex: cIndex,
      itemStyle: { color },
    };
  });

  const edgeSeries = graph.edges.map((e) => {
    const c1 = coords[e.source] as Coord3D;
    const c2 = coords[e.target] as Coord3D;
    const isPositive = e.sign === 1;

    return {
      type: 'line3D',
      coordinateSystem: 'cartesian3D',
      data: [
        [c1[0], c1[1], c1[2]],
        [c2[0], c2[1], c2[2]],
      ],
      lineStyle: {
        width: 2,
        color: isPositive ? '#00aa00' : '#dd0000',
        opacity: 0.9,
      },
    };
  });

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

    // 不要 show:false（echarts-gl 某些版本会崩），用“透明”隐藏
    xAxis3D: {
      type: 'value',
      min: -radius * 1.2,
      max: radius * 1.2,
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisTick: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisLabel: { show: true, textStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisPointer: { show: false },
    },
    yAxis3D: {
      type: 'value',
      min: -radius * 1.2,
      max: radius * 1.2,
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisTick: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisLabel: { show: true, textStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisPointer: { show: false },
    },
    zAxis3D: {
      type: 'value',
      min: -radius * 1.2,
      max: radius * 1.2,
      axisLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisTick: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisLabel: { show: true, textStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0)', opacity: 0 } },
      axisPointer: { show: false },
    },

    grid3D: {
      boxWidth: 200,
      boxHeight: 200,
      boxDepth: 200,
      viewControl: {
        autoRotate: true,
        autoRotateSpeed: 5,
        projection: 'perspective',
      },
    },

    globe: { show: false },

    series: [
      {
        type: 'scatter3D',
        coordinateSystem: 'cartesian3D',
        symbolSize: 10,
        data: nodeData,
        itemStyle: { opacity: 1 },
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

function initChart() {
  if (!chartDom.value) return;
  chart = echarts.init(chartDom.value);
  chart.setOption(buildSphereGraphOption(currentGraph.value) as any);
}

function resizeChart() {
  chart?.resize();
}

onMounted(() => {
  initChart();
  window.addEventListener('resize', resizeChart);
});

watch(
  () => currentGraph.value,
  (newVal) => {
    if (!chart && chartDom.value) {
      initChart();
      return;
    }
    chart?.setOption(buildSphereGraphOption(newVal) as any, true);
  },
  { deep: true }
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart);
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.symbol-page {
  display: flex;
  width: 100vw;
  height: 100vh;
}

/* 左侧：固定比例 + min/max */
.symbol-sidebar {
  flex: 0 0 22%;
  min-width: 280px;
  max-width: 360px;
  padding: 16px 20px;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(6px);
}

/* 右侧 */
.symbol-main {
  flex: 1 1 auto;
  padding: 12px;
  box-sizing: border-box;
}

.chart-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.chart-root {
  width: 100%;
  height: 100%;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* 基础样式 */
.sidebar-title {
  font-size: 16px;
  margin: 0 0 16px;
}

.sidebar-section {
  margin-bottom: 18px;
}

.section-label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
}

.radio-group {
  display: flex;
  gap: 16px;
  font-size: 14px;
}

.hint {
  font-size: 12px;
  color: #aaa;
  margin-top: 10px;
  line-height: 1.4;
}

/* —— 网络选择区（点击列表）—— */
.net-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.net-item {
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(0, 0, 0, 0.10);
  padding: 10px 10px;
  border-radius: 10px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.9);
}

.net-item:hover {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.14);
}

.net-item.active {
  border-color: rgba(102, 204, 255, 0.55);
  background: rgba(102, 204, 255, 0.12);
}

.net-title {
  font-weight: 700;
  font-size: 14px;
}

.net-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  margin-top: 4px;
}

/* —— 自定义网络表单 —— */
.form-block {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.10);
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.9);
}

.form-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.form-row-small {
  margin-top: 10px;
  font-size: 13px;
  display: flex;
  gap: 14px;
  color: rgba(255, 255, 255, 0.85);
}

.input,
.select {
  flex: 1 1 auto;
  height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.18);
  color: rgba(255, 255, 255, 0.9);
  outline: none;
}

.btn {
  height: 34px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* —— 标题行右侧按钮 —— */
.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.title-actions {
  display: flex;
  gap: 8px;
}

.btn-small {
  height: 28px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 12px;
}
</style>
