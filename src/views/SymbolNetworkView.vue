<!-- File: src/views/SymbolNetworkView.vue -->
<template>
  <div class="symbol-page">
    <aside class="symbol-sidebar">
      <h2 class="sidebar-title">PGSBC Process Studio</h2>
      <p class="sidebar-subtitle">统一主线：数据建模 -> 隐私处理 -> 迭代求解 -> 证据回放</p>

      <div class="sidebar-scroll">
        <section class="sidebar-section">
          <label class="section-label">数据来源</label>
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
        </section>

        <section v-if="dataSource === 'demo'" class="sidebar-section">
          <div class="section-title-row">
            <label class="section-label">网络集合</label>
            <button
              class="btn btn-small"
              type="button"
              title="总图模式会将全部示例网络合并后再分析，适合展示全局趋势"
              @click="toggleAggregateGraph"
            >
              {{ aggregateGraphOn ? '退出总图' : '聚合总图' }}
            </button>
          </div>

          <div class="privacy-toolbar">
            <label class="toggle">
              <input
                type="checkbox"
                v-model="privacyOn"
                title="开启后会使用扰动后的图进行隐私展示与后续分析流程"
              />
              隐私模式
            </label>
            <button
              class="btn btn-small"
              type="button"
              title="在同一网络上重新执行扰动，便于对比不同匿名化结果"
              @click="reEncryptCurrent"
              :disabled="!privacyOn"
            >
              重新扰动
            </button>
            <button
              class="btn btn-small"
              type="button"
              title="删除当前缓存的扰动图，恢复初始状态"
              @click="clearEncryptionAll"
              :disabled="Object.keys(encryptedGraphs).length === 0"
            >
              清除扰动
            </button>
          </div>

          <div class="sub-toolbar">
            <div class="seg">
              <button
                class="seg-btn"
                :class="{ active: privacySubMode === 'compare' }"
                type="button"
                title="显示原图与扰动图的边级差异：real / missing / spurious"
                :disabled="!privacyOn"
                @click="togglePrivacySubMode('compare')"
              >
                结构对比
              </button>
              <button
                class="seg-btn"
                :class="{ active: privacySubMode === 'aggregate' }"
                type="button"
                title="只展示聚合统计，不显示具体边，突出宏观指标"
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
              :class="{ active: !aggregateGraphOn && k === selectedDemoKey }"
              @click="selectDemo(k)"
              :disabled="aggregateGraphOn"
              :title="aggregateGraphOn ? '当前为总图模式，单图选择已禁用' : ''"
            >
              <div class="net-title">{{ demoGraphMeta[k]?.title ?? k }}</div>
              <div class="net-meta">
                节点 {{ demoGraphs[k]?.nodes.length ?? 0 }} · 边 {{ demoGraphs[k]?.edges.length ?? 0 }}
              </div>
            </button>
          </div>

          <p class="hint">
            当前图：{{ graphTitle }}（{{ graphSummary }}）
          </p>
          <p class="hint">
            模式：{{ analysisModeLabel }}
          </p>
        </section>

        <section v-else class="sidebar-section">
          <label class="section-label">自定义网络</label>

          <div class="form-block">
            <div class="form-label">添加节点</div>
            <div class="form-row">
              <input v-model="newNodeLabel" type="text" placeholder="节点名称，如 A / B / C" class="input" />
              <button class="btn" type="button" @click="addNode">添加</button>
            </div>
            <p class="hint">当前节点：{{ customGraph.nodes.length }} 个</p>
          </div>

          <div class="form-block">
            <div class="form-label">添加边</div>
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
        </section>

        <section class="sidebar-section pgsbc-control">
          <label class="section-label">PGSBC 任务（双服务器）</label>

          <div class="form-block">
            <div class="form-row">
              <input
                v-model.number="pgsbcMaxIter"
                class="input"
                type="number"
                min="1"
                step="1"
                title="max_iter：最大迭代轮数 t_max；轮数越大，收敛机会更多但耗时更高"
                placeholder="max_iter"
              />
              <input
                v-model.number="pgsbcRb"
                class="input"
                type="number"
                min="0"
                max="1"
                step="0.05"
                title="rb：R() 匿名化伪边比例；值越高，隐私更强但结构失真更大"
                placeholder="rb"
              />
            </div>

            <div class="task-actions">
              <button
                class="btn btn-small"
                type="button"
                title="根据当前网络和参数创建一个新的任务上下文，并初始化密钥请求"
                :disabled="pgsbcLoading"
                @click="createPgsbcTask"
              >
                {{ pgsbcHasTask ? '重建任务' : '创建任务' }}
              </button>
              <button
                class="btn btn-small"
                type="button"
                title="执行一轮 Step2-Step7，并更新 h_t 与 c_t"
                :disabled="!pgsbcHasTask || pgsbcLoading || pgsbcIsDone"
                @click="iteratePgsbcTask"
              >
                下一轮
              </button>
              <button
                class="btn btn-small"
                type="button"
                title="按固定间隔连续执行迭代，直到停止或达到 max_iter"
                :disabled="!pgsbcHasTask || pgsbcLoading || pgsbcIsDone"
                @click="togglePgsbcAutoplay"
              >
                {{ pgsbcAutoplayOn ? '停止自动' : '自动运行' }}
              </button>
              <button
                class="btn btn-small"
                type="button"
                title="清空当前任务的迭代进度和事件流，保留图与参数重新开始"
                :disabled="!pgsbcHasTask || pgsbcLoading"
                @click="resetPgsbcTask"
              >
                重置
              </button>
              <button
                class="btn btn-small"
                type="button"
                title="从后端重新拉取任务状态与时间线，适合联调排错"
                :disabled="!pgsbcHasTask || pgsbcLoading"
                @click="refreshPgsbcTask"
              >
                刷新
              </button>
            </div>

            <p class="hint">API：{{ apiBaseUrl }}</p>
            <p class="hint" v-if="pgsbcTaskState">
              任务 {{ pgsbcTaskState.id }} · 状态 {{ pgsbcTaskState.status }} · t={{ pgsbcTaskState.t }}/{{
                pgsbcTaskState.max_iter
              }}
            </p>
            <p class="hint task-error" v-if="pgsbcError">{{ pgsbcError }}</p>
          </div>
        </section>
      </div>
    </aside>

    <main class="symbol-main">
      <section class="process-board">
        <div class="process-head">
          <span class="mode-pill">{{ analysisModeLabel }}</span>
          <span class="mode-pill">{{ graphTitle }}</span>
          <span class="mode-pill">{{ graphSummary }}</span>
          <span class="mode-pill replay-pill" v-if="isReplayMode">Step 回放中</span>
          <span class="mode-pill task-pill" v-if="pgsbcTaskState">
            task={{ pgsbcTaskState.id }} · {{ pgsbcTaskState.status }}
          </span>
          <span class="mode-pill muted" v-else>未创建 PGSBC 任务</span>
        </div>

        <div class="process-replay">
          <div class="replay-actions">
            <button
              class="btn btn-small"
              type="button"
              title="按时间顺序逐事件回放 Step1-Step8"
              :disabled="!replayHasEvents || replayPlaying"
              @click="startStepReplay"
            >
              播放回放
            </button>
            <button
              class="btn btn-small"
              type="button"
              title="暂停回放，停在当前事件"
              :disabled="!replayPlaying"
              @click="pauseStepReplay"
            >
              暂停
            </button>
            <button
              class="btn btn-small"
              type="button"
              title="回到上一事件"
              :disabled="!replayHasEvents"
              @click="replayPrevEvent"
            >
              上一步
            </button>
            <button
              class="btn btn-small"
              type="button"
              title="前进到下一事件"
              :disabled="!replayHasEvents"
              @click="replayNextEvent"
            >
              下一步
            </button>
            <button
              class="btn btn-small"
              type="button"
              title="退出回放并回到最新实时状态"
              :disabled="!isReplayMode && !replayPlaying"
              @click="exitStepReplay"
            >
              退出回放
            </button>
          </div>

          <div class="replay-meta" v-if="replayCurrentEvent">
            回放 {{ replayCursor + 1 }}/{{ replayTotal }} · t={{ replayCurrentEvent.t }} · S{{ replayCurrentEvent.step }} ·
            {{ replayCurrentEvent.actor }}
          </div>
          <div class="replay-meta" v-else-if="replayHasEvents">
            未进入回放，当前显示实时最新状态
          </div>
          <div class="replay-meta" v-else>暂无可回放事件（先执行至少一轮迭代）</div>
        </div>

        <div class="replay-progress">
          <span class="replay-progress-bar" :style="{ width: `${replayProgressPct}%` }"></span>
        </div>

        <div class="step-track">
          <div v-for="step in stepTrack" :key="step.id" class="step-node" :class="step.status" :title="step.desc">
            <div class="step-index">S{{ step.id }}</div>
            <div class="step-name">{{ step.label }}</div>
          </div>
        </div>

        <div class="actor-lanes">
          <div class="actor-lane" v-for="lane in actorLaneStats" :key="lane.actor" :class="{ active: lane.active }">
            <div class="actor-top">
              <span class="actor-name">{{ lane.actor }}</span>
              <span class="actor-count">{{ lane.count }} events</span>
            </div>
            <div class="actor-bar">
              <span class="actor-bar-fill" :style="{ width: `${lane.ratio}%` }"></span>
            </div>
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
            <span class="overlay-badge">渲染模式：{{ displayModeLabel }}</span>
            <span class="overlay-badge">{{ drawEdges ? '边可见' : '边隐藏（聚合展示）' }}</span>
          </div>
        </div>

        <aside class="insight-panel">
          <section class="insight-card">
            <div class="insight-title">结构概览</div>
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

          <section v-if="showAggregateCard" class="insight-card">
            <div class="insight-title">聚合展示说明</div>
            <p class="insight-text">
              当前处于“隐私聚合展示”子模式：隐藏具体边，仅保留全局统计，突出宏观结构信号，避免泄露单边细节。
            </p>
          </section>

          <section v-if="showTriadPanel" class="insight-card">
            <div class="insight-title">不平衡 Triad 浏览器</div>
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
          </section>

          <section v-if="pgsbcTaskState" class="insight-card">
            <div class="insight-title">PGSBC 迭代证据</div>

            <div class="pgsbc-meta">
              <div>last accepted h: {{ formatNumber(pgsbcTaskState.last_accepted_h) }}</div>
              <div>current real h: {{ formatNumber(pgsbcTaskState.current_h_real) }}</div>
              <div>c_history: {{ pgsbcTaskState.c_history.join(', ') || '-' }}</div>
            </div>

            <div class="pgsbc-chart">
              <svg viewBox="0 0 320 96" preserveAspectRatio="none">
                <rect x="0" y="0" width="320" height="96" fill="transparent" />
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
              <div class="pgsbc-legend">曲线=observed h_t · 绿点=accept · 黄点=reject</div>
            </div>

            <div class="pgsbc-events">
              <div class="pgsbc-events-title">最近事件</div>
              <div class="pgsbc-event" v-for="(event, idx) in recentTimelineEvents" :key="`${event.ts}-${idx}`">
                <div class="pgsbc-event-main">
                  <span class="pgsbc-step">S{{ event.step }}</span>
                  <span class="pgsbc-actor">{{ event.actor }}</span>
                  <span class="pgsbc-msg">{{ event.message }}</span>
                </div>
                <div class="pgsbc-payload" v-if="formatPayload(event.payload)">
                  {{ formatPayload(event.payload) }}
                </div>
              </div>
            </div>
          </section>

          <section v-else class="insight-card">
            <div class="insight-title">PGSBC 迭代证据</div>
            <p class="insight-text">先创建任务，再执行迭代，即可看到 h_t 曲线、c_t 决策和 Step1-8 事件流。</p>
          </section>
        </aside>
      </section>
    </main>

    <button class="param-help-fab" type="button" title="打开参数说明" @click="showParamHelp = true">
      参数说明
    </button>

    <div v-if="showParamHelp" class="param-modal-mask" @click.self="showParamHelp = false">
      <div class="param-modal" role="dialog" aria-modal="true" aria-label="参数说明">
        <div class="param-modal-head">
          <h3>参数说明</h3>
          <button class="btn btn-small" type="button" @click="showParamHelp = false">关闭</button>
        </div>

        <div class="param-modal-body">
          <div class="param-help-group">
            <div class="param-help-title">控制参数</div>
            <div class="param-help-list">
              <div class="param-help-item" v-for="item in controlParamNotes" :key="`ctrl-${item.name}`">
                <div class="param-help-key">{{ item.name }}</div>
                <div class="param-help-value">{{ item.desc }}</div>
              </div>
            </div>
          </div>

          <div class="param-help-group">
            <div class="param-help-title">核心状态变量</div>
            <div class="param-help-list">
              <div class="param-help-item" v-for="item in symbolParamNotes" :key="`sym-${item.name}`">
                <div class="param-help-key">{{ item.name }}</div>
                <div class="param-help-value">{{ item.desc }}</div>
              </div>
            </div>
          </div>

          <div class="param-help-group">
            <div class="param-help-title">结果判读</div>
            <div class="param-help-list">
              <div class="param-help-item" v-for="item in metricParamNotes" :key="`metric-${item.name}`">
                <div class="param-help-key">{{ item.name }}</div>
                <div class="param-help-value">{{ item.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { GraphData } from '../types/symbolNetwork';
import { demoGraphs, demoGraphMeta, demoKeys } from '../data/demoGraphs';

import { useDemoGraphPipeline } from '../composables/useDemoGraphPipeline';
import { useSphereChart } from '../composables/useSphereChart';
import { computeBalanceStats } from '../utils/graphStats';
import { useTriadExplorer } from '../composables/useTriadExplorer';
import { usePgsbcTask, type PgsbcTimelineEvent } from '../composables/usePgsbcTask';

type DataSourceType = 'demo' | 'custom';
type PrivacySubMode = 'none' | 'compare' | 'aggregate';
type StepStatus = 'pending' | 'active' | 'completed';
type ActorName = 'Individuals' | 'Server1' | 'Server2';
type ParamNote = {
  name: string;
  desc: string;
};

const dataSource = ref<DataSourceType>('demo');
const showParamHelp = ref(false);
const replayCursor = ref(-1);
const replayPlaying = ref(false);
const replayIntervalMs = 850;
let replayTimer: number | null = null;

const {
  selectedDemoKey,
  aggregateGraphOn,
  privacyOn,
  compareOn,
  aggregateOn,
  encryptedGraphs,
  graphForRender,
  displayMode,
  selectDemo,
  reEncryptCurrent,
  clearEncryptionAll,
  rawGraph,
} = useDemoGraphPipeline({
  demoGraphs,
  initialKey: demoKeys[0] ?? '',
});

function toggleAggregateGraph() {
  aggregateGraphOn.value = !aggregateGraphOn.value;
}

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

const currentGraph = computed(() => {
  return dataSource.value === 'demo' ? graphForRender.value : customGraph.value;
});
const graphForTask = computed<GraphData>(() => {
  return dataSource.value === 'demo' ? rawGraph.value : customGraph.value;
});

const drawEdges = computed(() => {
  if (dataSource.value !== 'demo') return true;
  return !(privacyOn.value && aggregateOn.value);
});

const stats = computed(() => computeBalanceStats(rawGraph.value));
const showAggregateCard = computed(() => dataSource.value === 'demo' && privacyOn.value && aggregateOn.value);
const showTriadPanel = computed(() => dataSource.value === 'demo' && privacyOn.value && !aggregateOn.value && !compareOn.value);

const privacySubMode = computed<PrivacySubMode>(() => {
  if (compareOn.value) return 'compare';
  if (aggregateOn.value) return 'aggregate';
  return 'none';
});

function togglePrivacySubMode(target: Exclude<PrivacySubMode, 'none'>) {
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
  baseGraph: rawGraph,
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
  startAutoplay: startPgsbcAutoplay,
  stopAutoplay: stopPgsbcAutoplay,
} = usePgsbcTask();

const pgsbcTaskState = computed(() => pgsbcTask.value);
const replayHasEvents = computed(() => pgsbcTimeline.value.length > 0);
const replayTotal = computed(() => pgsbcTimeline.value.length);
const isReplayMode = computed(() => replayHasEvents.value && replayCursor.value >= 0);
const replayCurrentEvent = computed<PgsbcTimelineEvent | null>(() => {
  if (!isReplayMode.value) return null;
  return pgsbcTimeline.value[replayCursor.value] ?? null;
});
const replayProgressPct = computed(() => {
  if (!replayHasEvents.value || replayCursor.value < 0) return 0;
  return Math.round(((replayCursor.value + 1) / replayTotal.value) * 100);
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
    if (!advanced) {
      pauseStepReplay();
    }
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

const timelineForState = computed(() => {
  if (!isReplayMode.value) return pgsbcTimeline.value;
  return pgsbcTimeline.value.slice(0, replayCursor.value + 1);
});

const recentTimelineEvents = computed(() => {
  const events = pgsbcTimeline.value;
  if (!events.length) return [];
  if (isReplayMode.value) {
    const end = replayCursor.value + 1;
    const start = Math.max(0, end - 10);
    return events.slice(start, end).reverse();
  }
  return events.slice(-10).reverse();
});

function createPgsbcTask() {
  exitStepReplay();
  void createTask(graphForTask.value);
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

const graphTitle = computed(() => {
  if (dataSource.value === 'custom') return '自定义网络';
  if (aggregateGraphOn.value) return '总图（聚合示例网络）';
  return demoGraphMeta[selectedDemoKey.value]?.title ?? selectedDemoKey.value;
});

const graphSummary = computed(() => `${rawGraph.value.nodes.length} 节点 · ${rawGraph.value.edges.length} 边`);

const analysisModeLabel = computed(() => {
  if (dataSource.value === 'custom') return '自定义建图模式';
  if (!privacyOn.value) return aggregateGraphOn.value ? '总图浏览模式' : '原图浏览模式';
  if (compareOn.value) return '隐私结构对比模式';
  if (aggregateOn.value) return '隐私聚合展示模式';
  return '隐私 Triad 证据模式';
});

const displayModeLabel = computed(() => {
  if (displayMode.value === 'compare') return 'compare';
  if (displayMode.value === 'privacy') return 'privacy';
  return 'normal';
});

const controlParamNotes: ParamNote[] = [
  {
    name: 'max_iter',
    desc: '最大迭代轮数 t_max。越大越可能找到更优聚类，但总耗时上升。',
  },
  {
    name: 'rb',
    desc: 'R() 伪边比例。值越高，匿名性更强，但 A^m 与原图偏差也更大。',
  },
  {
    name: '隐私模式',
    desc: '开启后使用扰动图和隐私子模式进行展示与分析。',
  },
  {
    name: '结构对比',
    desc: '显示 real/missing/spurious 边，观察扰动前后差异。',
  },
  {
    name: '聚合展示',
    desc: '隐藏具体边，仅显示统计指标，适合隐私友好演示。',
  },
];

const symbolParamNotes: ParamNote[] = [
  {
    name: 'A',
    desc: '原始符号网络（真实节点和真实边）。',
  },
  {
    name: 'A^m',
    desc: '匿名化后网络（加入伪边后的结构）。',
  },
  {
    name: 'S_t',
    desc: '第 t 轮候选聚类/当前聚类状态。',
  },
  {
    name: 'H_t',
    desc: '真实图上按当前聚类计算的不平衡状态统计。',
  },
  {
    name: 'Ĥ_t',
    desc: 'F() 扰动后状态，用于隐私保护下的后续计算。',
  },
  {
    name: 'E(Ĥ_t)',
    desc: '扰动状态加密后的上传数据（同态聚合输入）。',
  },
  {
    name: 'h_t',
    desc: 'Server2 解密得到的全局目标值（越小越好）。',
  },
  {
    name: 'c_t',
    desc: '更新判定：1=接受新聚类，0=拒绝并回退。',
  },
];

const metricParamNotes: ParamNote[] = [
  {
    name: 'last accepted h',
    desc: '历史上最近一次被接受的 h_t，代表当前最优已确认结果。',
  },
  {
    name: 'current real h',
    desc: '当前聚类在真实图 A 上的不平衡值，用于解释实际效果。',
  },
  {
    name: 'observed h_t',
    desc: '每轮观测到的 h_t 序列；曲线趋势用于判断是否收敛。',
  },
  {
    name: 'c_history',
    desc: '每轮决策序列；1 多表示持续改进，0 多表示进入平台期。',
  },
];

const STEP_DEFS = [
  { id: 1, label: 'Init / R()', desc: '初始化并构建匿名图 A^m' },
  { id: 2, label: 'Candidate S_t', desc: '生成候选聚类 S_t' },
  { id: 3, label: 'H_t + F()', desc: '计算真实状态并执行 F() 扰动' },
  { id: 4, label: 'E() Upload', desc: '加密扰动结果并上传' },
  { id: 5, label: 'Cipher Aggregate', desc: 'Server1 做密文同态聚合' },
  { id: 6, label: 'Decrypt h_t', desc: 'Server2 解密得到 h_t' },
  { id: 7, label: 'Compare c_t', desc: '比较并返回 c_t 决策' },
  { id: 8, label: 'Terminate', desc: '达到终止条件输出结果' },
] as const;

const latestStep = computed(() => {
  const events = timelineForState.value;
  if (!events.length) return 0;
  return events[events.length - 1]?.step ?? 0;
});

const effectiveStep = computed(() => {
  if (!pgsbcHasTask.value) return 0;
  return Math.max(1, latestStep.value);
});

const stepTrack = computed(() => {
  return STEP_DEFS.map((step) => {
    let status: StepStatus = 'pending';
    if (pgsbcHasTask.value) {
      if (isReplayMode.value) {
        if (step.id < effectiveStep.value) status = 'completed';
        else if (step.id === effectiveStep.value) status = 'active';
      } else if (pgsbcIsDone.value) status = 'completed';
      else if (step.id < effectiveStep.value) status = 'completed';
      else if (step.id === effectiveStep.value) status = 'active';
    }
    return {
      id: step.id,
      label: step.label,
      desc: step.desc,
      status,
    };
  });
});

const ACTORS: ActorName[] = ['Individuals', 'Server1', 'Server2'];
const replayActiveActor = computed<ActorName | ''>(() => {
  const actor = replayCurrentEvent.value?.actor;
  if (actor === 'Individuals' || actor === 'Server1' || actor === 'Server2') return actor;
  return '';
});

const actorLaneStats = computed(() => {
  const counts: Record<ActorName, number> = {
    Individuals: 0,
    Server1: 0,
    Server2: 0,
  };

  for (const event of timelineForState.value) {
    if (event.actor === 'Individuals' || event.actor === 'Server1' || event.actor === 'Server2') {
      counts[event.actor] += 1;
    }
  }

  const maxCount = Math.max(1, ...ACTORS.map((actor) => counts[actor]));
  return ACTORS.map((actor) => {
    const count = counts[actor];
    return {
      actor,
      count,
      ratio: Math.round((count / maxCount) * 100),
      active: isReplayMode.value && replayActiveActor.value === actor,
    };
  });
});

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function getLatestStepEvent(step: number): PgsbcTimelineEvent | null {
  for (let i = timelineForState.value.length - 1; i >= 0; i -= 1) {
    const event = timelineForState.value[i];
    if (event?.step === step) return event;
  }
  return null;
}

const latestStep3Payload = computed(() => getLatestStepEvent(3)?.payload ?? {});
const latestStep4Event = computed(() => getLatestStepEvent(4));

const observedHHistory = computed<number[]>(() => {
  if (!isReplayMode.value) return pgsbcTaskState.value?.observed_h_history ?? [];

  const replayValues: number[] = [];
  for (const event of timelineForState.value) {
    if (event.step !== 6) continue;
    const value = parseNumber((event.payload as Record<string, unknown>).h_t);
    if (value !== null) replayValues.push(value);
  }
  return replayValues;
});

const cHistory = computed<number[]>(() => {
  if (!isReplayMode.value) return pgsbcTaskState.value?.c_history ?? [];

  const replayValues: number[] = [];
  for (const event of timelineForState.value) {
    if (event.step !== 7) continue;
    const value = parseNumber((event.payload as Record<string, unknown>).c_t);
    if (value !== null) replayValues.push(value >= 0.5 ? 1 : 0);
  }
  return replayValues;
});

const clusterCount = computed(() => {
  const labels = pgsbcTaskState.value?.current_labels ?? {};
  const all = Object.values(labels);
  if (!all.length) return 0;
  return new Set(all).size;
});

const lastObservedH = computed<number | null>(() => {
  const arr = observedHHistory.value;
  return arr.length ? arr[arr.length - 1] ?? null : null;
});

const lastDecision = computed<number | null>(() => {
  const arr = cHistory.value;
  return arr.length ? arr[arr.length - 1] ?? null : null;
});

const processStateChips = computed(() => {
  const task = pgsbcTaskState.value;
  const realUnbalanced = parseNumber((latestStep3Payload.value as Record<string, unknown>).real_unbalanced);
  const disturbedUnbalanced = parseNumber((latestStep3Payload.value as Record<string, unknown>).disturbed_unbalanced);

  return [
    {
      key: 'A',
      value: task ? `${task.node_count}N / ${task.real_edge_count}E` : '-',
      desc: '原始图规模（节点数与真实边数）',
    },
    {
      key: 'A^m',
      value: task?.initialized ? `${task.anon_edge_count}E` : '-',
      desc: '匿名图边数（含伪边）',
    },
    {
      key: 'S_t',
      value: clusterCount.value > 0 ? `${clusterCount.value} clusters` : '-',
      desc: '当前聚类簇数量',
    },
    {
      key: 'H_t',
      value: formatNumber(realUnbalanced ?? task?.current_h_real ?? null),
      desc: '真实状态统计（未扰动）',
    },
    {
      key: 'Ĥ_t',
      value: formatNumber(disturbedUnbalanced),
      desc: '扰动后状态统计',
    },
    {
      key: 'E(Ĥ_t)',
      value: latestStep4Event.value ? 'uploaded' : '-',
      desc: '加密上传状态',
    },
    {
      key: 'h_t',
      value: formatNumber(lastObservedH.value),
      desc: '解密后的全局目标值',
    },
    {
      key: 'c_t',
      value: lastDecision.value === null ? '-' : lastDecision.value === 1 ? 'accept' : 'reject',
      desc: '更新决策（accept/reject）',
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
      value: v,
      accepted: (cHistory.value[i] ?? 0) === 1,
    };
  });
});

const hCurvePoints = computed(() => hCurveDots.value.map((d) => `${d.x},${d.y}`).join(' '));

function formatPayload(payload: Record<string, unknown> | undefined) {
  if (!payload) return '';
  const entries = Object.entries(payload).filter(([, v]) => v !== null && v !== undefined);
  if (!entries.length) return '';
  return entries
    .slice(0, 4)
    .map(([k, v]) => {
      if (typeof v === 'number') return `${k}=${Number(v).toFixed(2)}`;
      return `${k}=${String(v)}`;
    })
    .join(' · ');
}

function formatNumber(v: number | null | undefined) {
  if (v === null || v === undefined) return '-';
  return Number(v).toFixed(2);
}

watch(
  () => pgsbcTimeline.value.length,
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

watch(pgsbcHasTask, (hasTask) => {
  if (!hasTask) {
    exitStepReplay();
  }
});

onBeforeUnmount(() => {
  stopReplayTimer();
});

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
