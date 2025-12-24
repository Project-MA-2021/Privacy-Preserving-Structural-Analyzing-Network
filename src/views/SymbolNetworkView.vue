<!-- File: src/views/SymbolNetworkView.vue -->
<template>
  <div class="symbol-page">
    <aside class="symbol-sidebar">
      <h2 class="sidebar-title">数据区：符号网络</h2>

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

      <!-- demo -->
      <div v-if="dataSource === 'demo'" class="sidebar-section">
        <div class="section-title-row">
          <label class="section-label">网络选择：</label>

          <div class="title-actions">
            <label class="toggle">
              <input type="checkbox" v-model="privacyOn" />
              隐私模式
            </label>

            <button class="btn btn-small" type="button" @click="reEncryptCurrent" :disabled="!privacyOn">
              重新扰动
            </button>

            <button
              class="btn btn-small"
              type="button"
              @click="clearEncryptionAll"
              :disabled="Object.keys(encryptedGraphs).length === 0"
            >
              清除扰动
            </button>
          </div>
        </div>

        <div class="sub-toolbar">
          <!-- compare 与 aggregate 互斥：UI 层互相禁用 -->
          <div class="seg">
            <button
              class="seg-btn"
              :class="{ active: privacySubMode === 'compare' }"
              type="button"
              :disabled="!privacyOn"
              @click="togglePrivacySubMode('compare')"
            >
              结构对比
            </button>

            <button
              class="seg-btn"
              :class="{ active: privacySubMode === 'aggregate' }"
              type="button"
              :disabled="!privacyOn"
              @click="togglePrivacySubMode('aggregate')"
            >
              聚合展示
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
              节点 {{ (demoGraphs[k]?.nodes.length ?? 0) }} · 边 {{ (demoGraphs[k]?.edges.length ?? 0) }}
            </div>
          </button>
        </div>

        <p class="hint">
          当前选中：{{ selectedDemoKey }}（节点 {{ baseGraph.nodes.length }} 个，边 {{ baseGraph.edges.length }} 条）
        </p>

        <p v-if="privacyOn && compareOn" class="hint">
          结构对比：绿色/红色=原有边（正/负），黄色=扰动新增边，灰色=扰动丢失边。
        </p>

        <p v-if="privacyOn && aggregateOn" class="hint">
          聚合展示：隐藏所有边，只显示全局统计。
        </p>

        <p v-if="privacyOn && (compareOn || aggregateOn)" class="hint">
          Triad 浏览与“结构对比/聚合展示”互斥：关闭它们即可进入 Triad 浏览。
        </p>

        <p v-if="showTriadPanel" class="hint">
          Triad 浏览器：展示原始网络里“不平衡三角形”的局部结构证据（图上会高亮为橙色）。
        </p>
      </div>

      <!-- custom -->
      <div v-else class="sidebar-section">
        <label class="section-label">自定义网络：</label>

        <div class="form-block">
          <div class="form-label">添加节点：</div>
          <div class="form-row">
            <input v-model="newNodeLabel" type="text" placeholder="节点名称，如 A / B / C" class="input" />
            <button class="btn" type="button" @click="addNode">添加</button>
          </div>
          <p class="hint">当前节点：{{ customGraph.nodes.length }} 个</p>
        </div>

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
              正边（+）
            </label>
            <label>
              <input type="radio" value="-1" v-model.number="newEdgeSign" />
              负边（-）
            </label>
          </div>

          <button class="btn" type="button" @click="addEdge" :disabled="customGraph.nodes.length < 2">
            添加边
          </button>

          <p class="hint">当前边：{{ customGraph.edges.length }} 条</p>
        </div>
      </div>
    </aside>

    <main class="symbol-main">
      <div class="chart-container">
        <div ref="chartDom" class="chart-root"></div>

        <!-- 聚合卡片 -->
        <div v-if="showAggregateCard" class="aggregate-card">
          <div class="agg-title">全局结构平衡（聚合）</div>

          <div class="agg-grid">
            <div class="agg-item">
              <div class="k">节点</div>
              <div class="v">{{ stats.nodes }}</div>
            </div>
            <div class="agg-item">
              <div class="k">边</div>
              <div class="v">{{ stats.edges }}</div>
            </div>
            <div class="agg-item">
              <div class="k">正边</div>
              <div class="v">{{ stats.posEdges }}</div>
            </div>
            <div class="agg-item">
              <div class="k">负边</div>
              <div class="v">{{ stats.negEdges }}</div>
            </div>

            <div class="agg-item wide">
              <div class="k">闭三角</div>
              <div class="v">{{ stats.triangles }}</div>
            </div>
            <div class="agg-item wide">
              <div class="k">平衡三角</div>
              <div class="v">{{ stats.balancedTriangles }}</div>
            </div>
            <div class="agg-item wide">
              <div class="k">不平衡三角</div>
              <div class="v">{{ stats.unbalancedTriangles }}</div>
            </div>
            <div class="agg-item wide">
              <div class="k">平衡率</div>
              <div class="v">{{ (stats.balancedRatio * 100).toFixed(1) }}%</div>
            </div>
          </div>
          <!--
          <div class="agg-foot">聚合展示用于模拟“只给全局结果，不给边级细节”。</div>
          -->
        </div>

        <!-- triad 卡片 -->
        <div v-if="showTriadPanel" class="triad-card">
          <div class="triad-title">不平衡 Triad 浏览器</div>

          <div class="triad-row">
            <div class="triad-k">数量</div>
            <div class="triad-v">{{ totalUnbalanced }}</div>
          </div>

          <div class="triad-row" v-if="currentTriad">
            <div class="triad-k">当前</div>
            <div class="triad-v">
              {{ index + 1 }} / {{ totalUnbalanced }} · 类型 {{ currentTriad.type }} · 节点
              ({{ currentTriad.a }}, {{ currentTriad.b }}, {{ currentTriad.c }})
            </div>
          </div>

          <div class="triad-controls">
            <button class="btn btn-small" type="button" @click="prevTriad" :disabled="totalUnbalanced === 0">
              上一个
            </button>
            <button class="btn btn-small" type="button" @click="nextTriad" :disabled="totalUnbalanced === 0">
              下一个
            </button>
            <button class="btn btn-small" type="button" @click="toggleAutoplay" :disabled="totalUnbalanced <= 1">
              {{ autoplayOn ? '停止' : '轮播' }}
            </button>
          </div>

          <div class="triad-sub" v-if="typeBuckets.length">
            <div class="triad-sub-title">类型分布（Top）</div>
            <div class="triad-tags">
              <span v-for="x in typeBuckets.slice(0, 3)" :key="x.type" class="triad-tag">
                {{ x.type }} × {{ x.count }}
              </span>
            </div>
          </div>

          <div class="triad-foot">图上高亮规则：当前 triad 的 3 条边会加粗并统一显示为橙色。</div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GraphData } from '../types/symbolNetwork';
import { demoGraphs, demoGraphMeta, demoKeys } from '../data/demoGraphs';

import { useDemoGraphPipeline } from '../composables/useDemoGraphPipeline';
import { useSphereChart } from '../composables/useSphereChart';
import { computeBalanceStats } from '../utils/graphStats';
import { useTriadExplorer } from '../composables/useTriadExplorer';

type DataSourceType = 'demo' | 'custom';
const dataSource = ref<DataSourceType>('demo');

// demo pipeline
const {
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
} = useDemoGraphPipeline({
  demoGraphs,
  initialKey: demoKeys[0] ?? '',
});

// custom
const customGraph = ref<GraphData>({ nodes: [], edges: [] });
const newNodeLabel = ref('');
const newEdgeSource = ref<string>('');
const newEdgeTarget = ref<string>('');
const newEdgeSign = ref<1 | -1>(1);
let edgeIdCounter = 1;

function addNode() {
  const label = newNodeLabel.value.trim();
  if (!label) return;
  const id = label;
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

// graph used for render
const currentGraph = computed(() => {
  return dataSource.value === 'demo' ? graphForRender.value : customGraph.value;
});

// drawEdges：demo+隐私+聚合 => 不画边
const drawEdges = computed(() => {
  if (dataSource.value !== 'demo') return true;
  return !(privacyOn.value && aggregateOn.value);
});

// aggregate stats（按原图）
const stats = computed(() => computeBalanceStats(baseGraph.value));
const showAggregateCard = computed(() => dataSource.value === 'demo' && privacyOn.value && aggregateOn.value);

// triad 与 compare/aggregate 互斥
const showTriadPanel = computed(() => {
  return dataSource.value === 'demo' && privacyOn.value && !aggregateOn.value && !compareOn.value;
});

type PrivacySubMode = 'none' | 'compare' | 'aggregate';

const privacySubMode = computed<PrivacySubMode>(() => {
  if (compareOn.value) return 'compare';
  if (aggregateOn.value) return 'aggregate';
  return 'none';
});

function togglePrivacySubMode(target: Exclude<PrivacySubMode, 'none'>) {
  // 再点一次同一按钮 => 取消（none）
  const next: PrivacySubMode = privacySubMode.value === target ? 'none' : target;

  compareOn.value = next === 'compare';
  aggregateOn.value = next === 'aggregate';
}

const {
  index,
  currentTriad,
  totalUnbalanced,
  typeBuckets,
  highlightNodes,
  highlightEdges,
  next,
  prev,
  startAutoplay,
  stopAutoplay,
  autoplayOn,
} = useTriadExplorer({
  baseGraph,
  enabled: showTriadPanel,
});

function nextTriad() {
  next();
}
function prevTriad() {
  prev();
}
function toggleAutoplay() {
  if (autoplayOn.value) stopAutoplay();
  else startAutoplay(1200);
}

// chart
const chartDom = ref<HTMLDivElement | null>(null);

useSphereChart({
  chartDom,
  graph: currentGraph,
  displayMode,
  drawEdges,
  highlightNodes,
  highlightEdges,
});
</script>

<style scoped src="./SymbolNetworkView.css"></style>
