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
              <input type="radio" value="demo" v-model="dataSource" :disabled="pgsbcLoading" />
              示例网络
            </label>
            <label>
              <input type="radio" value="custom" v-model="dataSource" :disabled="pgsbcLoading" />
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
              :class="{ active: selectedDemoKey === k }"
              @click="selectDemo(k)"
            >
              <div class="net-title">{{ demoGraphMeta[k]?.title ?? k }}</div>
              <div class="net-meta">
                节点 {{ demoGraphs[k]?.nodes.length ?? 0 }} · 边 {{ demoGraphs[k]?.edges.length ?? 0 }}
              </div>
            </button>
          </div>
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
            <button class="btn btn-small" type="button" :disabled="pgsbcLoading" @click="createPgsbcTask">
              {{ pgsbcHasTask ? '重建任务' : '创建任务' }}
            </button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="!pgsbcHasTask || pgsbcLoading || pgsbcIsDone"
              @click="iteratePgsbcTask"
            >
              下一轮
            </button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="!pgsbcHasTask || pgsbcLoading || pgsbcIsDone"
              @click="togglePgsbcAutoplay"
            >
              {{ pgsbcAutoplayOn ? '停止自动' : '自动运行' }}
            </button>
            <button class="btn btn-small" type="button" :disabled="!pgsbcHasTask || pgsbcLoading" @click="resetPgsbcTask">
              重置
            </button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="!pgsbcHasTask || pgsbcLoading"
              @click="refreshPgsbcTask"
            >
              刷新
            </button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="!pgsbcHasTask || pgsbcLoading || exportLoading"
              @click="exportPgsbcResult('json')"
            >
              {{ exportLoading ? '导出中...' : '导出 JSON' }}
            </button>
            <button
              class="btn btn-small"
              type="button"
              :disabled="!pgsbcHasTask || pgsbcLoading || exportLoading"
              @click="exportPgsbcResult('csv')"
            >
              {{ exportLoading ? '导出中...' : '导出 CSV' }}
            </button>
          </div>

          <p class="hint">API：{{ apiBaseUrl }}</p>
          <p class="hint" v-if="pgsbcTaskState">
            task={{ pgsbcTaskState.id }} · {{ pgsbcTaskState.status }} · t={{ pgsbcTaskState.t }}/{{ pgsbcTaskState.max_iter }}
          </p>
          <p class="hint" v-if="pgsbcTaskState">已记录轮次：{{ pgsbcRoundCount }}</p>
          <p class="hint task-error" v-if="pgsbcError">{{ pgsbcError }}</p>
        </section>
      </div>
    </aside>

    <main class="sync-main">
      <section class="process-board">
        <div class="process-head">
          <span class="pill">{{ taskGraphTitle }}</span>
          <span class="pill" v-if="pgsbcTaskState">状态 {{ pgsbcTaskState.status }}</span>
          <span class="pill" v-if="pgsbcTaskState">当前步骤 {{ activeStepText }}</span>
          <span class="pill decision-pill" v-if="lastDecision !== null">
            c_t = {{ lastDecision === 1 ? 'accept' : 'reject' }}
          </span>
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
        <div class="graph-stage">
          <div ref="chartDom" class="chart-root"></div>
          <div class="graph-overlay">
            <span class="overlay-badge">渲染图：{{ taskGraphTitle }}</span>
            <span class="overlay-badge">聚类来源：{{ pgsbcTaskState ? '后端 current_labels' : '无' }}</span>
            <span class="overlay-badge">步骤动画：{{ activeStepText }}</span>
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
            <div class="insight-title">最近轮次</div>
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
            <div class="insight-title">最近事件（后端 timeline）</div>
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
import { computed, onBeforeUnmount, ref } from 'vue';
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

const taskGraph = computed<GraphData>(() => {
  if (pgsbcHasTask.value) return boundTaskGraph.value ?? inputGraph.value;
  return inputGraph.value;
});

const graphForRender = computed<GraphData>(() => {
  const base = cloneGraph(taskGraph.value);
  const labels = pgsbcTaskState.value?.current_labels ?? {};
  if (Object.keys(labels).length > 0) {
    base.clusters = { ...labels };
  }
  return base;
});

const taskGraphTitle = computed(() => {
  if (dataSource.value === 'custom') return '自定义网络';
  return demoGraphMeta[selectedDemoKey.value]?.title ?? selectedDemoKey.value;
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

const observedHHistory = computed<number[]>(() => pgsbcTaskState.value?.observed_h_history ?? []);
const cHistory = computed<number[]>(() => pgsbcTaskState.value?.c_history ?? []);
const acceptedHHistory = computed<number[]>(() => pgsbcTaskState.value?.accepted_h_history ?? []);

const lastObservedH = computed<number | null>(() => {
  const list = observedHHistory.value;
  return list.length ? list[list.length - 1] ?? null : null;
});

const lastDecision = computed<number | null>(() => {
  const list = cHistory.value;
  return list.length ? list[list.length - 1] ?? null : null;
});

function getLatestStepEvent(step: number): PgsbcTimelineEvent | null {
  for (let i = pgsbcTimeline.value.length - 1; i >= 0; i -= 1) {
    const event = pgsbcTimeline.value[i];
    if (!event) continue;
    if (event.step === step) return event;
  }
  return null;
}

const latestStep3Payload = computed(() => getLatestStepEvent(3)?.payload ?? {});

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
  if (!pgsbcTimeline.value.length) return 0;
  return pgsbcTimeline.value[pgsbcTimeline.value.length - 1]?.step ?? 0;
});

const activeStep = computed(() => {
  if (!pgsbcHasTask.value) return 0;
  return Math.max(1, latestStep.value);
});

const activeStepText = computed(() => {
  const step = STEP_DEFS.find((x) => x.id === activeStep.value);
  if (!step) return '未开始';
  return `S${step.id} ${step.label}`;
});

const stepTrack = computed(() => {
  return STEP_DEFS.map((step) => {
    let status: StepStatus = 'pending';
    if (pgsbcHasTask.value) {
      if (pgsbcIsDone.value) status = 'completed';
      else if (step.id < activeStep.value) status = 'completed';
      else if (step.id === activeStep.value) status = 'active';
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
    c: c[idx] ?? 0,
    accepted: accepted[idx] ?? value,
  }));
  return rows.slice(-8).reverse();
});

const recentTimelineEvents = computed(() => {
  return pgsbcTimeline.value.slice(-12).reverse();
});

const animationClass = computed(() => {
  if (!activeStep.value) return '';
  return `step-anim-s${Math.min(8, Math.max(1, activeStep.value))}`;
});

const decisionClass = computed(() => {
  if (lastDecision.value === 1) return 'decision-accept';
  if (lastDecision.value === 0) return 'decision-reject';
  return '';
});

function createPgsbcTask() {
  const graph = cloneGraph(inputGraph.value);
  if (graph.nodes.length < 2) {
    pgsbcError.value = '图至少需要 2 个节点';
    return;
  }
  boundTaskGraph.value = graph;
  void createTask(graph);
}

function iteratePgsbcTask() {
  void iterateOnce();
}

function resetPgsbcTask() {
  void resetTask();
}

function refreshPgsbcTask() {
  void Promise.all([refreshState(), refreshTimeline()]);
}

function togglePgsbcAutoplay() {
  if (pgsbcAutoplayOn.value) stopPgsbcAutoplay();
  else startPgsbcAutoplay(1500);
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

const chartDom = ref<HTMLDivElement | null>(null);
const displayMode = computed(() => 'normal' as const);
const drawEdges = computed(() => true);

useSphereChart({
  chartDom,
  graph: graphForRender,
  displayMode,
  drawEdges,
});

onBeforeUnmount(() => {
  stopPgsbcAutoplay();
});
</script>

<style scoped src="./SymbolNetworkView.css"></style>
