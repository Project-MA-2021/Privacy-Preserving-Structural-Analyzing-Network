<template>
  <div class="sync-page" :class="[animationClass, decisionClass]">
    <aside class="sync-sidebar">
      <h2 class="sidebar-title">PGSBC Backend Sync Console</h2>
      <p class="sidebar-subtitle">前端只作为后端任务的可视化终端，状态全部以后端为准。</p>

      <div class="sidebar-scroll">
        <section class="sidebar-section">
          <label class="section-label">数据来源</label>
          <div class="radio-group">
            <label>
              <input type="radio" value="demo" v-model="dataSource" :disabled="pgsbcLoading || batchRunning" />
              示例网络
            </label>
            <label>
              <input type="radio" value="custom" v-model="dataSource" :disabled="pgsbcLoading || batchRunning" />
              自定义网络
            </label>
          </div>
          <p class="hint" v-if="pgsbcHasTask">任务图已锁定，修改数据源后需点击“重建任务”生效。</p>
        </section>

        <section v-if="dataSource === 'demo'" class="sidebar-section">
          <label class="section-label">示例网络</label>
          <div class="net-list">
            <button
              v-for="k in demoKeys"
              :key="k"
              type="button"
              class="net-item"
              :class="{ active: selectedDemoKey === k, running: batchRunning && batchCurrentKey === k }"
              @click="selectDemo(k)"
              :disabled="batchRunning"
            >
              <div class="net-title">{{ demoGraphMeta[k]?.title ?? k }}</div>
              <div class="net-meta">
                节点 {{ demoGraphs[k]?.nodes.length ?? 0 }} · 边 {{ demoGraphs[k]?.edges.length ?? 0 }}
              </div>
            </button>
          </div>

          <p class="hint" v-if="batchRunning">
            外层流程进行中：{{ demoGraphMeta[batchCurrentKey]?.title ?? batchCurrentKey }}（{{ batchDoneCount }}/{{ demoKeys.length }}）
          </p>
          <p class="hint" v-else-if="batchResults.length">
            外层流程完成：成功 {{ batchSuccessCount }} / 失败 {{ batchFailCount }} / 中断 {{ batchStoppedCount }}
          </p>
        </section>

        <section v-else class="sidebar-section">
          <label class="section-label">自定义网络</label>

          <div class="form-block">
            <div class="form-label">添加节点</div>
            <div class="form-row">
              <input v-model="newNodeLabel" type="text" class="input" placeholder="节点名称，如 A / B / C" />
              <button class="btn" type="button" @click="addNode">添加</button>
            </div>
            <p class="hint">当前节点：{{ customGraph.nodes.length }} 个</p>
          </div>

          <div class="form-block">
            <div class="form-label">添加边</div>
            <div class="form-row">
              <select v-model="newEdgeSource" class="select">
                <option value="" disabled>起点</option>
                <option v-for="n in customGraph.nodes" :key="`s-${n.id}`" :value="n.id">{{ n.label }}</option>
              </select>
              <select v-model="newEdgeTarget" class="select">
                <option value="" disabled>终点</option>
                <option v-for="n in customGraph.nodes" :key="`t-${n.id}`" :value="n.id">{{ n.label }}</option>
              </select>
            </div>
            <div class="form-row form-row-small">
              <label><input type="radio" value="1" v-model.number="newEdgeSign" /> 正边（+）</label>
              <label><input type="radio" value="-1" v-model.number="newEdgeSign" /> 负边（-）</label>
              <button class="btn btn-small" type="button" @click="clearCustomGraph">清空</button>
            </div>
            <button class="btn" type="button" @click="addEdge" :disabled="customGraph.nodes.length < 2">添加边</button>
            <p class="hint">当前边：{{ customGraph.edges.length }} 条</p>
          </div>
        </section>

        <section class="sidebar-section">
          <label class="section-label">PGSBC 任务（后端同步）</label>
          <div class="form-row">
            <input
              v-model.number="pgsbcMaxIter"
              class="input"
              type="number"
              min="1"
              step="1"
              title="max_iter：最大迭代轮数 t_max"
              placeholder="max_iter"
            />
            <input
              v-model.number="pgsbcRb"
              class="input"
              type="number"
              min="0"
              max="1"
              step="0.05"
              title="rb：匿名化伪边比例"
              placeholder="rb"
            />
          </div>

          <div class="task-actions">
            <button class="btn btn-small" type="button" :disabled="pgsbcLoading && !batchRunning" @click="createPgsbcTask">
              {{ dataSource === 'demo' ? (batchRunning ? '停止流程' : '运行 PGSBC 流程') : pgsbcHasTask ? '重建任务' : '创建任务' }}
            </button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="dataSource === 'demo' || !pgsbcHasTask || pgsbcLoading || pgsbcIsDone || batchRunning"
              @click="iteratePgsbcTask"
            >
              下一轮
            </button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="dataSource === 'demo' || !pgsbcHasTask || pgsbcLoading || pgsbcIsDone || batchRunning"
              @click="togglePgsbcAutoplay"
            >
              {{ pgsbcAutoplayOn ? '停止自动' : '自动运行' }}
            </button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="!pgsbcHasTask || pgsbcLoading || batchRunning"
              @click="resetPgsbcTask"
            >
              重置
            </button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="!pgsbcHasTask || pgsbcLoading || batchRunning"
              @click="refreshPgsbcTask"
            >
              刷新
            </button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="!pgsbcHasTask || pgsbcLoading || exportLoading || batchRunning"
              @click="exportPgsbcResult('json')"
            >
              {{ exportLoading ? '导出中...' : '导出 JSON' }}
            </button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="!pgsbcHasTask || pgsbcLoading || exportLoading || batchRunning"
              @click="exportPgsbcResult('csv')"
            >
              {{ exportLoading ? '导出中...' : '导出 CSV' }}
            </button>
          </div>

          <p class="hint">API：{{ apiBaseUrl }}</p>
          <p class="hint" v-if="pgsbcTaskState">
            task={{ pgsbcTaskState.id }} · {{ pgsbcTaskState.status }} · t={{ pgsbcTaskState.t }}/{{ pgsbcTaskState.max_iter }}
          </p>
          <p class="hint">流程语义：外层按网络集循环，内层按单网络执行 Step1-Step8。</p>
          <p class="hint" v-if="pgsbcTaskState">已记录轮次：{{ pgsbcRoundCount }}</p>
          <p class="hint task-error" v-if="pgsbcError">{{ pgsbcError }}</p>
        </section>
      </div>
    </aside>

    <main class="sync-main">
      <section class="process-board">
        <div class="process-head">
          <span class="pill">{{ taskGraphTitle }}</span>
          <span class="pill" v-if="batchRunning">网络集流程 {{ Math.min(batchDoneCount + 1, demoKeys.length) }}/{{ demoKeys.length }}</span>
          <span class="pill" v-if="pgsbcTaskState">状态 {{ pgsbcTaskState.status }}</span>
          <span class="pill" v-if="pgsbcTaskState">当前步骤 {{ activeStepText }}</span>
          <span class="pill replay-pill" v-if="isReplayMode">Step 回放中</span>
          <span class="pill decision-pill" v-if="lastDecision !== null">
            c_t = {{ lastDecision === 1 ? 'accept' : 'reject' }}
          </span>
        </div>

        <div class="replay-control">
          <div class="replay-actions">
            <button class="btn btn-small" type="button" :disabled="!replayHasEvents || replayPlaying" @click="startStepReplay">
              播放回放
            </button>
            <button class="btn btn-small" type="button" :disabled="!replayPlaying" @click="pauseStepReplay">暂停</button>
            <button class="btn btn-small" type="button" :disabled="!replayHasEvents" @click="replayPrevEvent">上一步</button>
            <button class="btn btn-small" type="button" :disabled="!replayHasEvents" @click="replayNextEvent">下一步</button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="(!isReplayMode && !replayPlaying) || !replayHasEvents"
              @click="exitStepReplay"
            >
              退出回放
            </button>
          </div>
          <div class="replay-meta" v-if="replayCurrentEvent">
            回放 {{ replayCursor + 1 }}/{{ replayTotal }} · t={{ replayCurrentEvent.t }} · S{{ replayCurrentEvent.step }} ·
            {{ replayCurrentEvent.actor }} · {{ replayCurrentEvent.network_title ?? taskGraphTitle }}
          </div>
          <div class="replay-meta" v-else-if="replayHasEvents">未进入回放，当前显示实时最新状态</div>
          <div class="replay-meta" v-else>暂无可回放事件（先执行至少一轮迭代）</div>
        </div>

        <div class="replay-progress">
          <span class="replay-progress-bar" :style="{ width: `${replayProgressPct}%` }"></span>
        </div>

        <div class="step-track">
          <div v-for="step in stepTrack" :key="step.id" class="step-node" :class="step.status">
            <div class="step-index">S{{ step.id }}</div>
            <div class="step-name">{{ step.label }}</div>
          </div>
        </div>

        <div class="state-grid">
          <div class="state-chip" v-for="item in processStateChips" :key="item.key" :title="item.desc">
            <span class="state-key">{{ item.key }}</span>
            <span class="state-value">{{ item.value }}</span>
          </div>
        </div>
      </section>

      <section class="workspace-grid">
        <div class="graph-column">
          <div class="graph-stage">
            <div ref="chartDomRaw" class="chart-root"></div>
            <div class="graph-overlay">
              <span class="overlay-badge">视图 A：当前网络（结构/符号）</span>
              <span class="overlay-badge">{{ taskGraphTitle }}</span>
              <span class="overlay-badge">模式：{{ isReplayMode ? '回放视角' : '实时视角' }}</span>
            </div>
          </div>

          <div class="graph-stage cluster-stage">
            <div ref="chartDomCluster" class="chart-root"></div>
            <div class="graph-overlay">
              <span class="overlay-badge">视图 B：聚类状态 S_t</span>
              <span class="overlay-badge">簇数：{{ clusterCount }}</span>
              <span class="overlay-badge">更新规则：c_t=1 接受 / c_t=0 回退</span>
            </div>
            <div class="chart-empty-tip" v-if="!hasClusterLabels">尚无已接受聚类，执行至少一轮迭代后显示。</div>
          </div>
        </div>

        <aside class="evidence-panel">
          <section class="insight-card">
            <div class="insight-title">图结构概览</div>
            <div class="metric-grid">
              <div class="metric-cell">
                <div class="metric-k">节点</div>
                <div class="metric-v">{{ stats.nodes }}</div>
              </div>
              <div class="metric-cell">
                <div class="metric-k">边</div>
                <div class="metric-v">{{ stats.edges }}</div>
              </div>
              <div class="metric-cell">
                <div class="metric-k">正边</div>
                <div class="metric-v">{{ stats.posEdges }}</div>
              </div>
              <div class="metric-cell">
                <div class="metric-k">负边</div>
                <div class="metric-v">{{ stats.negEdges }}</div>
              </div>
              <div class="metric-cell wide">
                <div class="metric-k">闭三角</div>
                <div class="metric-v">{{ stats.triangles }}</div>
              </div>
              <div class="metric-cell wide">
                <div class="metric-k">平衡率</div>
                <div class="metric-v">{{ (stats.balancedRatio * 100).toFixed(1) }}%</div>
              </div>
            </div>
          </section>

          <section class="insight-card" :class="{ empty: !pgsbcTaskState }">
            <div class="insight-title">h_t 趋势（后端）</div>
            <div class="trend-chart" v-if="pgsbcTaskState">
              <svg viewBox="0 0 320 96" preserveAspectRatio="none">
                <polyline
                  v-if="hCurvePoints"
                  :points="hCurvePoints"
                  fill="none"
                  stroke="rgba(125, 211, 252, 0.95)"
                  stroke-width="2.5"
                />
                <circle
                  v-for="dot in hCurveDots"
                  :key="dot.i"
                  :cx="dot.x"
                  :cy="dot.y"
                  r="3.6"
                  :fill="dot.accepted ? '#34d399' : '#f59e0b'"
                />
              </svg>
            </div>
            <p class="insight-text" v-else>创建任务并迭代后显示。</p>
          </section>

          <section class="insight-card">
            <div class="insight-title">论文流程证据（Step3-Step7）</div>
            <div class="kv-list">
              <div class="kv-item">
                <span class="kv-k">H_t（真实）</span>
                <span class="kv-v">{{ formatNumber(latestRealUnbalanced) }}</span>
              </div>
              <div class="kv-item">
                <span class="kv-k">Ĥ_t（扰动）</span>
                <span class="kv-v">{{ formatNumber(latestDisturbedUnbalanced) }}</span>
              </div>
              <div class="kv-item">
                <span class="kv-k">A^m 边数</span>
                <span class="kv-v">{{ pgsbcTaskState?.anon_edge_count ?? '-' }}</span>
              </div>
              <div class="kv-item">
                <span class="kv-k">h_t（全局目标）</span>
                <span class="kv-v">{{ formatNumber(lastObservedH) }}</span>
              </div>
              <div class="kv-item">
                <span class="kv-k">c_t（更新标签）</span>
                <span class="kv-v">{{ lastDecision === null ? '-' : lastDecision }}</span>
              </div>
              <div class="kv-item">
                <span class="kv-k">Step6 payload.h_t</span>
                <span class="kv-v">{{ formatNumber(latestStep6H) }}</span>
              </div>
              <div class="kv-item">
                <span class="kv-k">Step7 payload.c_t</span>
                <span class="kv-v">{{ formatNumber(latestStep7C) }}</span>
              </div>
              <div class="kv-item">
                <span class="kv-k">accepted_h</span>
                <span class="kv-v">{{ formatNumber(lastAcceptedH) }}</span>
              </div>
            </div>
            <p class="insight-text">
              语义对应：S2 产生候选 S_t；S3 在当前 S_t 上评估 H_t 并扰动为 Ĥ_t；S4-S6 得到 h_t；S7 根据 c_t
              决定是否接受该轮聚类。
            </p>
          </section>

          <section class="insight-card">
            <div class="insight-title">轮次证据（{{ isReplayMode ? '回放' : '实时' }}）</div>
            <div class="round-table-wrap" v-if="recentRounds.length">
              <table class="round-table">
                <thead>
                  <tr>
                    <th>round</th>
                    <th>h_t</th>
                    <th>c_t</th>
                    <th>accepted_h</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in recentRounds" :key="`r-${row.round}`">
                    <td>{{ row.round }}</td>
                    <td>{{ formatNumber(row.h) }}</td>
                    <td>{{ row.c }}</td>
                    <td>{{ formatNumber(row.accepted) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="insight-text" v-else>暂无轮次数据。</p>
          </section>

          <section class="insight-card">
            <div class="insight-title">网络集 PGSBC 结果</div>
            <div class="round-table-wrap" v-if="batchResults.length">
              <table class="round-table">
                <thead>
                  <tr>
                    <th>network</th>
                    <th>status</th>
                    <th>rounds</th>
                    <th>accepted_h</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in batchResults" :key="`b-${row.key}-${row.startedAt}`">
                    <td>{{ row.title }}</td>
                    <td>{{ batchStatusText(row.status) }}</td>
                    <td>{{ row.rounds }}</td>
                    <td>{{ formatNumber(row.acceptedH) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="insight-text" v-else>尚未运行网络集 PGSBC。</p>
          </section>

          <section class="insight-card">
            <div class="insight-title">事件流（后端 timeline）</div>
            <div class="event-list" v-if="recentTimelineEvents.length">
              <div class="event-item" v-for="(event, idx) in recentTimelineEvents" :key="`${event.ts}-${idx}`">
                <div class="event-main">
                  <span class="event-step">S{{ event.step }}</span>
                  <span class="event-actor">{{ event.actor }}</span>
                  <span>{{ event.message }}</span>
                </div>
                <div class="event-payload" v-if="formatPayload(event.payload)">{{ formatPayload(event.payload) }}</div>
              </div>
            </div>
            <p class="insight-text" v-else>暂无事件，请先执行迭代。</p>
          </section>
        </aside>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { GraphData } from '../types/symbolNetwork';
import { demoGraphs, demoGraphMeta, demoKeys } from '../data/demoGraphs';
import { computeBalanceStats } from '../utils/graphStats';
import { useSphereChart } from '../composables/useSphereChart';
import { usePgsbcTask, type PgsbcExportRow, type PgsbcTimelineEvent } from '../composables/usePgsbcTask';

type DataSourceType = 'demo' | 'custom';
type StepStatus = 'pending' | 'active' | 'completed';
type ParamChip = {
  key: string;
  value: string;
  desc: string;
};
type BatchStatus = 'success' | 'failed' | 'stopped';
type BatchResult = {
  key: string;
  title: string;
  status: BatchStatus;
  rounds: number;
  acceptedH: number | null;
  error?: string;
  startedAt: string;
  endedAt: string;
};
type ReplayEvent = PgsbcTimelineEvent & {
  network_key?: string;
  network_title?: string;
};

const dataSource = ref<DataSourceType>('demo');
const selectedDemoKey = ref(demoKeys[0] ?? '');

const customGraph = ref<GraphData>({ nodes: [], edges: [] });
const newNodeLabel = ref('');
const newEdgeSource = ref('');
const newEdgeTarget = ref('');
const newEdgeSign = ref<1 | -1>(1);
let edgeIdCounter = 1;

function edgeKey(a: string, b: string) {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function cloneGraph(graph: GraphData): GraphData {
  return {
    nodes: (graph.nodes ?? []).map((n) => ({
      id: String(n.id),
      label: String(n.label ?? n.id),
    })),
    edges: (graph.edges ?? []).map((e) => ({
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
      sign: e.sign === -1 ? -1 : 1,
    })),
    clusters: graph.clusters ? { ...graph.clusters } : undefined,
  };
}

function selectDemo(key: string) {
  selectedDemoKey.value = key;
}

function addNode() {
  const label = newNodeLabel.value.trim();
  if (!label) return;
  const id = label;
  if (customGraph.value.nodes.some((n) => n.id === id)) return;

  customGraph.value.nodes.push({ id, label });
  newNodeLabel.value = '';

  if (!newEdgeSource.value) newEdgeSource.value = id;
  if (!newEdgeTarget.value && customGraph.value.nodes.length >= 2) {
    const first = customGraph.value.nodes[0]?.id ?? '';
    newEdgeTarget.value = first === id ? customGraph.value.nodes[1]?.id ?? '' : first;
  }
}

function addEdge() {
  if (!newEdgeSource.value || !newEdgeTarget.value) return;
  if (newEdgeSource.value === newEdgeTarget.value) return;

  const key = edgeKey(newEdgeSource.value, newEdgeTarget.value);
  const exists = customGraph.value.edges.some((e) => edgeKey(e.source, e.target) === key);
  if (exists) return;

  customGraph.value.edges.push({
    id: `e${edgeIdCounter++}`,
    source: newEdgeSource.value,
    target: newEdgeTarget.value,
    sign: newEdgeSign.value,
  });
}

function clearCustomGraph() {
  customGraph.value = { nodes: [], edges: [] };
  newEdgeSource.value = '';
  newEdgeTarget.value = '';
}

const inputGraph = computed<GraphData>(() => {
  if (dataSource.value === 'custom') return customGraph.value;
  return demoGraphs[selectedDemoKey.value] ?? { nodes: [], edges: [] };
});

const boundTaskGraph = ref<GraphData | null>(null);

const {
  apiBaseUrl,
  task: pgsbcTask,
  timeline: pgsbcTimeline,
  maxIter: pgsbcMaxIter,
  rb: pgsbcRb,
  loading: pgsbcLoading,
  error: pgsbcError,
  hasTask: pgsbcHasTask,
  isDone: pgsbcIsDone,
  autoplayOn: pgsbcAutoplayOn,
  createTask,
  iterateOnce,
  resetTask,
  refreshState,
  refreshTimeline,
  fetchExportData,
  startAutoplay: startPgsbcAutoplay,
  stopAutoplay: stopPgsbcAutoplay,
} = usePgsbcTask();

const pgsbcTaskState = computed(() => pgsbcTask.value);
const pgsbcRoundCount = computed(() => pgsbcTaskState.value?.round_count ?? pgsbcTaskState.value?.t ?? 0);
const exportLoading = ref(false);
const batchRunning = ref(false);
const batchStopRequested = ref(false);
const batchCurrentKey = ref('');
const batchResults = ref<BatchResult[]>([]);

const batchDoneCount = computed(() => batchResults.value.length);
const batchSuccessCount = computed(() => batchResults.value.filter((x) => x.status === 'success').length);
const batchFailCount = computed(() => batchResults.value.filter((x) => x.status === 'failed').length);
const batchStoppedCount = computed(() => batchResults.value.filter((x) => x.status === 'stopped').length);
const flowReplayEvents = ref<ReplayEvent[]>([]);
const activeDemoKeyForView = computed(() => selectedDemoKey.value);
const batchNetworkSwitchPauseMs = 320;
const batchRoundPauseMs = 130;

const replayCursor = ref(-1);
const replayPlaying = ref(false);
const replayIntervalMs = 850;
let replayTimer: number | null = null;

const replaySourceEvents = computed<ReplayEvent[]>(() => {
  if (flowReplayEvents.value.length > 0) return flowReplayEvents.value;
  const fallbackKey = dataSource.value === 'demo' ? selectedDemoKey.value : undefined;
  const fallbackTitle = fallbackKey ? demoGraphMeta[fallbackKey]?.title ?? fallbackKey : '自定义网络';
  return pgsbcTimeline.value.map((event) => ({
    ...event,
    network_key: fallbackKey,
    network_title: fallbackTitle,
  }));
});

const replayHasEvents = computed(() => replaySourceEvents.value.length > 0);
const replayTotal = computed(() => replaySourceEvents.value.length);
const isReplayMode = computed(() => replayHasEvents.value && replayCursor.value >= 0);
const replayCurrentEvent = computed<ReplayEvent | null>(() => {
  if (!isReplayMode.value) return null;
  return replaySourceEvents.value[replayCursor.value] ?? null;
});
const replayProgressPct = computed(() => {
  if (!replayHasEvents.value || replayCursor.value < 0) return 0;
  return Math.round(((replayCursor.value + 1) / replayTotal.value) * 100);
});

const replayNetworkKey = computed(() => {
  if (!isReplayMode.value) return '';
  return replayCurrentEvent.value?.network_key ?? '';
});

const timelineForState = computed(() => {
  if (!isReplayMode.value) return pgsbcTimeline.value;
  if (!flowReplayEvents.value.length) return replaySourceEvents.value.slice(0, replayCursor.value + 1);

  const currentKey = replayCurrentEvent.value?.network_key;
  if (!currentKey) return replaySourceEvents.value.slice(0, replayCursor.value + 1);
  return replaySourceEvents.value.slice(0, replayCursor.value + 1).filter((event) => event.network_key === currentKey);
});

const taskGraph = computed<GraphData>(() => {
  if (dataSource.value === 'demo') {
    const key = replayNetworkKey.value || activeDemoKeyForView.value;
    const demoGraph = demoGraphs[key];
    if (demoGraph) return demoGraph;
  }
  if (pgsbcHasTask.value) return boundTaskGraph.value ?? inputGraph.value;
  return inputGraph.value;
});

const rawGraphForRender = computed<GraphData>(() => {
  return cloneGraph(taskGraph.value);
});

const clusteredGraphForRender = computed<GraphData>(() => {
  const base = cloneGraph(taskGraph.value);
  const labels = clusterLabelsForView.value;
  if (Object.keys(labels).length > 0) {
    base.clusters = { ...labels };
  }
  return base;
});

const hasClusterLabels = computed(() => {
  const labels = clusterLabelsForView.value;
  return Object.keys(labels).length > 0;
});

const clusterCount = computed(() => {
  const labels = clusterLabelsForView.value;
  const values = Object.values(labels);
  if (!values.length) return 0;
  return new Set(values).size;
});

const taskGraphTitle = computed(() => {
  if (dataSource.value === 'custom') return '自定义网络';
  const key = replayNetworkKey.value || activeDemoKeyForView.value;
  return demoGraphMeta[key]?.title ?? key;
});

const stats = computed(() => computeBalanceStats(taskGraph.value));

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function buildInitialLabels(graph: GraphData): Record<string, number> {
  const labels: Record<string, number> = {};
  (graph.nodes ?? []).forEach((node, idx) => {
    labels[String(node.id)] = idx;
  });
  return labels;
}

function parseLabelMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input)) {
    const n = parseNumber(v);
    if (n === null) return null;
    out[String(k)] = Math.trunc(n);
  }
  return out;
}

const clusterLabelsForView = computed<Record<string, number>>(() => {
  if (!isReplayMode.value) {
    return pgsbcTaskState.value?.current_labels ?? {};
  }

  let accepted = buildInitialLabels(taskGraph.value);
  let candidate: Record<string, number> | null = null;
  let display = { ...accepted };

  for (const event of timelineForState.value) {
    if (event.step === 2) {
      const labels = parseLabelMap((event.payload as Record<string, unknown>).candidate_labels);
      if (labels && Object.keys(labels).length > 0) {
        candidate = labels;
        display = { ...labels };
      }
      continue;
    }

    if (event.step >= 3 && event.step <= 6) {
      if (candidate) display = { ...candidate };
      continue;
    }

    if (event.step === 7) {
      const cRaw = parseNumber((event.payload as Record<string, unknown>).c_t);
      const c = cRaw !== null && cRaw >= 0.5 ? 1 : 0;
      if (c === 1 && candidate) {
        accepted = { ...candidate };
      } else {
        const acceptedFromPayload = parseLabelMap((event.payload as Record<string, unknown>).accepted_labels);
        if (acceptedFromPayload && Object.keys(acceptedFromPayload).length > 0) {
          accepted = acceptedFromPayload;
        }
      }
      display = { ...accepted };
      candidate = null;
      continue;
    }

    if (event.step === 8) {
      display = { ...accepted };
    }
  }

  return display;
});

function buildReplayHistories(events: PgsbcTimelineEvent[]) {
  const observed: number[] = [];
  const decisions: number[] = [];
  const accepted: number[] = [];

  let pendingH: number | null = null;
  let lastAccepted: number | null = null;

  for (const event of events) {
    if (event.step === 6) {
      const h = parseNumber((event.payload as Record<string, unknown>).h_t);
      if (h !== null) pendingH = h;
      continue;
    }

    if (event.step === 7) {
      const cRaw = parseNumber((event.payload as Record<string, unknown>).c_t);
      const c = cRaw !== null && cRaw >= 0.5 ? 1 : 0;
      if (pendingH === null) continue;

      observed.push(pendingH);
      decisions.push(c);
      if (c === 1 || lastAccepted === null) {
        lastAccepted = pendingH;
      }
      accepted.push(lastAccepted);
      pendingH = null;
    }
  }

  if (pendingH !== null) {
    observed.push(pendingH);
    decisions.push(-1);
    accepted.push(lastAccepted ?? pendingH);
  }

  return { observed, decisions, accepted };
}

const replayHistories = computed(() => buildReplayHistories(timelineForState.value));

const observedHHistory = computed<number[]>(() => {
  if (!isReplayMode.value) return pgsbcTaskState.value?.observed_h_history ?? [];
  return replayHistories.value.observed;
});

const cHistory = computed<number[]>(() => {
  if (!isReplayMode.value) return pgsbcTaskState.value?.c_history ?? [];
  return replayHistories.value.decisions;
});

const acceptedHHistory = computed<number[]>(() => {
  if (!isReplayMode.value) return pgsbcTaskState.value?.accepted_h_history ?? [];
  return replayHistories.value.accepted;
});

const lastObservedH = computed<number | null>(() => {
  const list = observedHHistory.value;
  return list.length ? list[list.length - 1] ?? null : null;
});
const lastAcceptedH = computed<number | null>(() => {
  const list = acceptedHHistory.value;
  return list.length ? list[list.length - 1] ?? null : null;
});

const lastDecision = computed<number | null>(() => {
  const list = cHistory.value;
  const last = list.length ? list[list.length - 1] : null;
  if (last === 0 || last === 1) return last;
  return null;
});

function getLatestStepEvent(step: number): PgsbcTimelineEvent | null {
  for (let i = timelineForState.value.length - 1; i >= 0; i -= 1) {
    const event = timelineForState.value[i];
    if (!event) continue;
    if (event.step === step) return event;
  }
  return null;
}

const latestStep3Payload = computed(() => getLatestStepEvent(3)?.payload ?? {});
const latestStep6Payload = computed(() => getLatestStepEvent(6)?.payload ?? {});
const latestStep7Payload = computed(() => getLatestStepEvent(7)?.payload ?? {});
const latestRealUnbalanced = computed(() =>
  parseNumber((latestStep3Payload.value as Record<string, unknown>).real_unbalanced)
);
const latestDisturbedUnbalanced = computed(() =>
  parseNumber((latestStep3Payload.value as Record<string, unknown>).disturbed_unbalanced)
);
const latestStep6H = computed(() => parseNumber((latestStep6Payload.value as Record<string, unknown>).h_t));
const latestStep7C = computed(() => parseNumber((latestStep7Payload.value as Record<string, unknown>).c_t));

const STEP_DEFS = [
  { id: 1, label: 'Init / R()' },
  { id: 2, label: 'Candidate S_t' },
  { id: 3, label: 'H_t + F()' },
  { id: 4, label: 'E() Upload' },
  { id: 5, label: 'Cipher Aggregate' },
  { id: 6, label: 'Decrypt h_t' },
  { id: 7, label: 'Compare c_t' },
  { id: 8, label: 'Terminate' },
] as const;

const latestStep = computed(() => {
  if (!timelineForState.value.length) return 0;
  return timelineForState.value[timelineForState.value.length - 1]?.step ?? 0;
});

const activeStep = computed(() => {
  if (!pgsbcHasTask.value || !isReplayMode.value) return 0;
  return Math.max(1, latestStep.value);
});

const activeStepText = computed(() => {
  if (!pgsbcHasTask.value) return '未开始';
  if (!isReplayMode.value) {
    return pgsbcIsDone.value ? '实时运行已完成（步骤联动在回放）' : '实时运行中（步骤联动在回放）';
  }
  const step = STEP_DEFS.find((x) => x.id === activeStep.value);
  if (!step) return '回放未定位';
  return `S${step.id} ${step.label}`;
});

const stepTrack = computed(() => {
  return STEP_DEFS.map((step) => {
    let status: StepStatus = 'pending';
    if (pgsbcHasTask.value) {
      if (!isReplayMode.value) {
        status = pgsbcIsDone.value ? 'completed' : step.id === 1 ? 'active' : 'pending';
      } else if (pgsbcIsDone.value) {
        status = 'completed';
      } else if (step.id < activeStep.value) {
        status = 'completed';
      } else if (step.id === activeStep.value) {
        status = 'active';
      }
    }
    return {
      id: step.id,
      label: step.label,
      status,
    };
  });
});

const processStateChips = computed<ParamChip[]>(() => {
  const task = pgsbcTaskState.value;
  const realUnbalanced = parseNumber((latestStep3Payload.value as Record<string, unknown>).real_unbalanced);
  const disturbedUnbalanced = parseNumber((latestStep3Payload.value as Record<string, unknown>).disturbed_unbalanced);

  return [
    {
      key: 'A',
      value: task ? `${task.node_count}N / ${task.real_edge_count}E` : '-',
      desc: '原始图规模',
    },
    {
      key: 'A^m',
      value: task?.initialized ? `${task.anon_edge_count}E` : '-',
      desc: '匿名图规模',
    },
    {
      key: 'H_t',
      value: formatNumber(realUnbalanced ?? task?.current_h_real ?? null),
      desc: '真实状态统计',
    },
    {
      key: 'Ĥ_t',
      value: formatNumber(disturbedUnbalanced),
      desc: '扰动后状态统计',
    },
    {
      key: 'h_t',
      value: formatNumber(lastObservedH.value),
      desc: '解密后的全局目标值',
    },
    {
      key: 'c_t',
      value: lastDecision.value === null ? '-' : lastDecision.value === 1 ? 'accept' : 'reject',
      desc: '后端更新决策',
    },
  ];
});

const CHART_W = 320;
const CHART_H = 96;
const CHART_PAD_X = 16;
const CHART_PAD_Y = 12;

const hCurveDots = computed(() => {
  const values = observedHHistory.value;
  if (!values.length) return [];

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = Math.max(1e-6, maxVal - minVal);
  const innerW = CHART_W - CHART_PAD_X * 2;
  const innerH = CHART_H - CHART_PAD_Y * 2;
  const denom = Math.max(1, values.length - 1);

  return values.map((v, i) => {
    const x = CHART_PAD_X + (innerW * i) / denom;
    const y = CHART_PAD_Y + innerH - ((v - minVal) / span) * innerH;
    return {
      i,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      accepted: (cHistory.value[i] ?? 0) === 1,
    };
  });
});

const hCurvePoints = computed(() => hCurveDots.value.map((d) => `${d.x},${d.y}`).join(' '));

const recentRounds = computed(() => {
  const h = observedHHistory.value;
  const c = cHistory.value;
  const accepted = acceptedHHistory.value;
  const rows = h.map((value, idx) => ({
    round: idx + 1,
    h: value,
    c: c[idx] === 0 || c[idx] === 1 ? String(c[idx]) : '-',
    accepted: accepted[idx] ?? value,
  }));
  return rows.slice(-8).reverse();
});

const recentTimelineEvents = computed(() => {
  return timelineForState.value.slice(-12).reverse();
});

const animationClass = computed(() => {
  if (!isReplayMode.value || !activeStep.value) return '';
  return `step-anim-s${Math.min(8, Math.max(1, activeStep.value))}`;
});

const decisionClass = computed(() => {
  if (!isReplayMode.value) return '';
  if (lastDecision.value === 1) return 'decision-accept';
  if (lastDecision.value === 0) return 'decision-reject';
  return '';
});

function stopReplayTimer() {
  if (replayTimer !== null) {
    window.clearInterval(replayTimer);
    replayTimer = null;
  }
}

function pauseStepReplay() {
  replayPlaying.value = false;
  stopReplayTimer();
}

function replayStepForward(): boolean {
  if (!replayHasEvents.value) return false;
  if (replayCursor.value < 0) {
    replayCursor.value = 0;
    return true;
  }
  if (replayCursor.value >= replayTotal.value - 1) return false;
  replayCursor.value += 1;
  return true;
}

function startStepReplay() {
  if (!replayHasEvents.value) return;
  if (replayCursor.value < 0) replayCursor.value = 0;
  if (replayPlaying.value) return;

  replayPlaying.value = true;
  stopReplayTimer();
  replayTimer = window.setInterval(() => {
    const advanced = replayStepForward();
    if (!advanced) pauseStepReplay();
  }, replayIntervalMs);
}

function replayNextEvent() {
  pauseStepReplay();
  if (!replayHasEvents.value) return;
  void replayStepForward();
}

function replayPrevEvent() {
  pauseStepReplay();
  if (!replayHasEvents.value) return;
  if (replayCursor.value <= 0) {
    replayCursor.value = 0;
    return;
  }
  replayCursor.value -= 1;
}

function exitStepReplay() {
  pauseStepReplay();
  replayCursor.value = -1;
}

function createPgsbcTask() {
  if (dataSource.value === 'demo') {
    if (batchRunning.value) stopDemoBatch();
    else void startDemoBatch();
    return;
  }

  exitStepReplay();
  flowReplayEvents.value = [];
  const graph = cloneGraph(inputGraph.value);
  if (graph.nodes.length < 2) {
    pgsbcError.value = '图至少需要 2 个节点';
    return;
  }
  boundTaskGraph.value = graph;
  void createTask(graph);
}

function iteratePgsbcTask() {
  exitStepReplay();
  void iterateOnce();
}

function resetPgsbcTask() {
  exitStepReplay();
  void resetTask();
}

function refreshPgsbcTask() {
  void Promise.all([refreshState(), refreshTimeline()]);
}

function togglePgsbcAutoplay() {
  exitStepReplay();
  if (pgsbcAutoplayOn.value) stopPgsbcAutoplay();
  else startPgsbcAutoplay(1500);
}

function getAcceptedHSnapshot(): number | null {
  const accepted = pgsbcTaskState.value?.accepted_h_history ?? [];
  if (accepted.length > 0) return accepted[accepted.length - 1] ?? null;
  return pgsbcTaskState.value?.last_accepted_h ?? null;
}

function batchStatusText(status: BatchStatus): string {
  if (status === 'success') return '成功';
  if (status === 'failed') return '失败';
  return '中断';
}

function sleepMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function runTaskUntilDone() {
  let guard = 0;
  let stagnantCount = 0;
  const guardLimit = Math.max((pgsbcTaskState.value?.max_iter ?? pgsbcMaxIter.value) + 8, 24);

  while (!batchStopRequested.value && pgsbcHasTask.value && !pgsbcIsDone.value) {
    const beforeRound = pgsbcRoundCount.value;
    await iterateOnce();

    if (pgsbcError.value) {
      throw new Error(pgsbcError.value);
    }

    const afterRound = pgsbcRoundCount.value;
    stagnantCount = afterRound > beforeRound ? 0 : stagnantCount + 1;
    guard += 1;

    if (stagnantCount >= 2) {
      throw new Error('任务状态未推进，批处理已停止当前网络');
    }
    if (guard > guardLimit) {
      throw new Error(`迭代超过安全上限 ${guardLimit}`);
    }

    if (batchRoundPauseMs > 0) {
      await sleepMs(batchRoundPauseMs);
    }
  }
}

function stopDemoBatch() {
  batchStopRequested.value = true;
}

async function startDemoBatch() {
  if (batchRunning.value || pgsbcLoading.value) return;
  if (!demoKeys.length) {
    pgsbcError.value = '未找到示例网络';
    return;
  }

  exitStepReplay();
  stopPgsbcAutoplay();
  pgsbcError.value = '';
  dataSource.value = 'demo';

  batchRunning.value = true;
  batchStopRequested.value = false;
  batchCurrentKey.value = '';
  batchResults.value = [];
  flowReplayEvents.value = [];

  try {
    for (const key of demoKeys) {
      if (batchStopRequested.value) break;

      const title = demoGraphMeta[key]?.title ?? key;
      const startedAt = new Date().toISOString();
      batchCurrentKey.value = key;

      let status: BatchStatus = 'success';
      let errorMsg = '';

      try {
        const graph = cloneGraph(demoGraphs[key] ?? { nodes: [], edges: [] });
        if (graph.nodes.length < 2) {
          throw new Error('图至少需要 2 个节点');
        }

        boundTaskGraph.value = graph;
        pgsbcTimeline.value = [];
        await nextTick();
        if (batchNetworkSwitchPauseMs > 0) {
          await sleepMs(batchNetworkSwitchPauseMs);
        }
        if (batchStopRequested.value) {
          status = 'stopped';
          throw new Error('批处理已停止');
        }

        await createTask(graph);
        if (pgsbcError.value) {
          throw new Error(pgsbcError.value);
        }
        if (!pgsbcHasTask.value) {
          throw new Error('任务未创建成功');
        }

        await runTaskUntilDone();
        if (batchStopRequested.value) {
          status = 'stopped';
        } else if (!pgsbcIsDone.value) {
          status = 'failed';
          errorMsg = pgsbcError.value || '任务未正常结束';
        }
      } catch (ex: any) {
        status = batchStopRequested.value ? 'stopped' : 'failed';
        errorMsg = ex?.message ?? '批处理失败';
      }

      const replayChunk = pgsbcTimeline.value.map((event) => ({
        ...event,
        network_key: key,
        network_title: title,
      }));
      if (replayChunk.length) {
        flowReplayEvents.value.push(...replayChunk);
      }

      const endedAt = new Date().toISOString();
      batchResults.value.push({
        key,
        title,
        status,
        rounds: pgsbcRoundCount.value,
        acceptedH: getAcceptedHSnapshot(),
        error: errorMsg || undefined,
        startedAt,
        endedAt,
      });

      if (batchStopRequested.value) break;
    }
  } finally {
    batchCurrentKey.value = '';
    batchRunning.value = false;
    batchStopRequested.value = false;
  }
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildExportCsv(rows: PgsbcExportRow[]): string {
  const headers: Array<keyof PgsbcExportRow> = [
    'round',
    't_before_commit',
    'h_t',
    'c_t',
    'accepted_h',
    'candidate_h_real',
    'current_h_real',
    'real_unbalanced',
    'disturbed_unbalanced',
    'node_count',
    'real_edge_count',
    'anon_edge_count',
    'iter_ms',
    'ts',
  ];
  const lines: string[] = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(','));
  }
  return lines.join('\n');
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportPgsbcResult(format: 'json' | 'csv') {
  if (!pgsbcHasTask.value || exportLoading.value) return;
  exportLoading.value = true;
  pgsbcError.value = '';
  try {
    const payload = await fetchExportData();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `pgsbc-task-${payload.task_id}-${stamp}`;
    if (format === 'json') {
      downloadText(`${baseName}.json`, JSON.stringify(payload, null, 2), 'application/json');
      return;
    }
    downloadText(`${baseName}.csv`, buildExportCsv(payload.rows ?? []), 'text/csv');
  } catch (ex: any) {
    pgsbcError.value = ex?.message ?? '导出失败';
  } finally {
    exportLoading.value = false;
  }
}

function formatPayload(payload: Record<string, unknown> | undefined): string {
  if (!payload) return '';
  const entries = Object.entries(payload).filter(([, v]) => v !== null && v !== undefined);
  if (!entries.length) return '';
  return entries
    .slice(0, 4)
    .map(([k, v]) => {
      if (typeof v === 'number') return `${k}=${v.toFixed(2)}`;
      return `${k}=${String(v)}`;
    })
    .join(' · ');
}

function formatNumber(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return Number(v).toFixed(2);
}

watch(
  () => replaySourceEvents.value.length,
  (nextLength) => {
    if (nextLength <= 0) {
      exitStepReplay();
      return;
    }
    if (replayCursor.value >= nextLength) {
      replayCursor.value = nextLength - 1;
    }
  }
);

watch(replayCurrentEvent, (event) => {
  const key = event?.network_key;
  if (!key) return;
  if (dataSource.value !== 'demo') return;
  if (selectedDemoKey.value === key) return;
  selectedDemoKey.value = key;
});

watch(pgsbcHasTask, (hasTask) => {
  if (!hasTask) {
    exitStepReplay();
  }
});

watch(dataSource, (source) => {
  if (source !== 'demo') {
    flowReplayEvents.value = [];
  }
});

const chartDomRaw = ref<HTMLDivElement | null>(null);
const chartDomCluster = ref<HTMLDivElement | null>(null);
const displayMode = computed(() => 'normal' as const);
const rawLayoutMode = computed(() => 'sphere' as const);
const clusterLayoutMode = computed(() => 'clustered' as const);
const drawEdges = computed(() => true);

useSphereChart({
  chartDom: chartDomRaw,
  graph: rawGraphForRender,
  displayMode,
  layoutMode: rawLayoutMode,
  drawEdges,
});

useSphereChart({
  chartDom: chartDomCluster,
  graph: clusteredGraphForRender,
  displayMode,
  layoutMode: clusterLayoutMode,
  drawEdges,
});

onBeforeUnmount(() => {
  stopReplayTimer();
  stopPgsbcAutoplay();
});
</script>

<style scoped src="./SymbolNetworkView.css"></style>
