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

          <div class="form-block">
            <div class="form-label">上传与裁剪</div>
            <div class="form-row form-row-small">
              <label><input type="checkbox" v-model="cropEnabled" /> 导入时启用裁剪</label>
            </div>
            <div class="form-row">
              <input
                v-model.number="cropTargetNodes"
                class="input"
                type="number"
                min="20"
                step="10"
                title="裁剪后的目标节点数"
                placeholder="目标节点数"
              />
              <input
                v-model.number="cropTargetEdges"
                class="input"
                type="number"
                min="40"
                step="20"
                title="裁剪后的目标边数"
                placeholder="目标边数"
              />
            </div>
            <div class="form-row">
              <input
                v-model.number="cropSeed"
                class="input"
                type="number"
                step="1"
                title="裁剪随机种子（相同参数可复现）"
                placeholder="seed"
              />
              <button class="btn" type="button" :disabled="pgsbcLoading || batchRunning" @click="openCustomImportFile">
                上传 CSV/JSON
              </button>
              <button class="btn" type="button" :disabled="batchRunning" @click="exportCustomGraphJson">导出 JSON</button>
            </div>
            <input
              ref="customImportInput"
              class="file-input-hidden"
              type="file"
              accept=".csv,.txt,.json,text/csv,text/plain,application/json"
              @change="handleCustomImportFile"
            />
            <p class="hint">
              裁剪策略：先选结构锚点，再按邻域扩展，最后按正/负边比例保留关键边，尽量维持结构平衡特征。
            </p>
            <p class="hint">CSV 推荐格式：`source,target,sign`（`sign` 取 `1/-1`）。</p>
            <p class="hint">上传后会立即执行校验，并弹窗提示结果。</p>
            <p class="hint" v-if="cropSummaryText">{{ cropSummaryText }}</p>
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
          <div class="form-row form-row-small">
            <label>
              <input type="checkbox" v-model="backendOutlierFilterEnabled" :disabled="pgsbcLoading || batchRunning" />
              后端离群过滤
            </label>
          </div>
          <p class="hint">说明：该开关会影响后端计算，修改后请“重建任务”生效。</p>

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
            <button class="btn btn-small" type="button" @click="showParamHelp = !showParamHelp">
              {{ showParamHelp ? '收起参数说明' : '查看参数含义' }}
            </button>
          </div>
          <div class="param-help" v-if="showParamHelp">
            <div class="param-group-title">输入与任务</div>
            <div class="param-row"><span class="param-k">max_iter</span><span class="param-v">单网络最大迭代轮数 t_max。</span></div>
            <div class="param-row"><span class="param-k">rb</span><span class="param-v">匿名化伪边比例，越大隐私更强但精度可能下降。</span></div>
            <div class="param-row"><span class="param-k">task/status</span><span class="param-v">任务ID与状态（ready/running/done）。</span></div>
            <div class="param-row"><span class="param-k">t</span><span class="param-v">当前已执行轮次。</span></div>
            <div class="param-row"><span class="param-k">round_count</span><span class="param-v">后端累计有效轮次计数。</span></div>

            <div class="param-group-title">论文过程变量</div>
            <div class="param-row"><span class="param-k">A</span><span class="param-v">原始符号网络（真实结构与符号）。</span></div>
            <div class="param-row"><span class="param-k">A^m</span><span class="param-v">R() 后匿名图，真实边 + 伪边。</span></div>
            <div class="param-row"><span class="param-k">S_t</span><span class="param-v">第 t 轮候选聚类（Step2 产生）。</span></div>
            <div class="param-row"><span class="param-k">H_t</span><span class="param-v">真实不平衡状态计数（Step3）。</span></div>
            <div class="param-row"><span class="param-k">Ĥ_t</span><span class="param-v">扰动后状态计数（Step3，供隐私计算）。</span></div>
            <div class="param-row"><span class="param-k">h_t</span><span class="param-v">当前轮全局目标值，越小越好。</span></div>
            <div class="param-row"><span class="param-k">c_t</span><span class="param-v">更新决策标签，1=接受候选聚类，0=回退。</span></div>
            <div class="param-row"><span class="param-k">accepted_h</span><span class="param-v">当前已接受的最优目标值。</span></div>

            <div class="param-group-title">导出字段（JSON/CSV）</div>
            <div class="param-row"><span class="param-k">candidate_h_real</span><span class="param-v">候选聚类在真实图上的不平衡计数。</span></div>
            <div class="param-row"><span class="param-k">current_h_real</span><span class="param-v">当前已接受聚类在真实图上的不平衡计数。</span></div>
            <div class="param-row"><span class="param-k">real/disturbed</span><span class="param-v">`real_unbalanced` 与 `disturbed_unbalanced`。</span></div>
            <div class="param-row"><span class="param-k">iter_ms</span><span class="param-v">该轮耗时（毫秒）。</span></div>
            <div class="param-row"><span class="param-k">t_before_commit</span><span class="param-v">该轮提交前的轮次索引。</span></div>
            <div class="param-row"><span class="param-k">h_S</span><span class="param-v">论文目标：全局不平衡代价，PGSBC 通过迭代最小化它。</span></div>
          </div>

          <p class="hint">API：{{ apiBaseUrl }}</p>
          <p class="hint" v-if="pgsbcTaskState">
            task={{ pgsbcTaskState.id }} · {{ pgsbcTaskState.status }} · t={{ pgsbcTaskState.t }}/{{ pgsbcTaskState.max_iter }}
          </p>
          <p class="hint" v-if="backendOutlierSummary">{{ backendOutlierSummary }}</p>
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
              <span class="overlay-badge" v-if="backendOutlierOverlayText">
                {{ backendOutlierOverlayText }}
              </span>
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
type DemoFinalClusterState = {
  labels: Record<string, number>;
  rounds: number;
  acceptedH: number | null;
  status: BatchStatus;
};
type ReplayEvent = PgsbcTimelineEvent & {
  network_key?: string;
  network_title?: string;
};
type LooseRecord = Record<string, unknown>;
type NodeScore = {
  degree: number;
  posDegree: number;
  negDegree: number;
  mixedDegree: number;
  score: number;
};
type CropReport = {
  beforeNodes: number;
  beforeEdges: number;
  afterNodes: number;
  afterEdges: number;
  beforePos: number;
  beforeNeg: number;
  afterPos: number;
  afterNeg: number;
  cropped: boolean;
};
type CsvValidationIssue = {
  line: number;
  reason: string;
  raw: string;
};
type CsvValidationReport = {
  delimiter: ',' | '\t' | ' ';
  hasHeader: boolean;
  totalLines: number;
  dataLines: number;
  parsedNodes: number;
  parsedEdges: number;
  skippedShort: number;
  skippedSelfLoop: number;
  skippedInvalidSign: number;
  skippedDuplicate: number;
  issues: CsvValidationIssue[];
};

const dataSource = ref<DataSourceType>('demo');
const selectedDemoKey = ref(demoKeys[0] ?? '');

const customGraph = ref<GraphData>({ nodes: [], edges: [] });
const customImportInput = ref<HTMLInputElement | null>(null);
const cropEnabled = ref(true);
const cropTargetNodes = ref(220);
const cropTargetEdges = ref(420);
const cropSeed = ref(20260412);
const cropSummaryText = ref('');
const backendOutlierFilterEnabled = ref(true);
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

function isRecord(value: unknown): value is LooseRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toNodeId(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseSignValue(edge: LooseRecord): 1 | -1 {
  const signRaw = edge.sign;
  if (typeof signRaw === 'number') return signRaw < 0 ? -1 : 1;
  if (typeof signRaw === 'string') {
    const text = signRaw.trim().toLowerCase();
    if (text === '-1' || text === '-' || text === 'negative' || text === 'neg') return -1;
    if (text === '1' || text === '+' || text === 'positive' || text === 'pos') return 1;
  }
  const ratingRaw = edge.rating;
  if (typeof ratingRaw === 'number') return ratingRaw < 0 ? -1 : 1;
  if (typeof ratingRaw === 'string') {
    const rating = Number(ratingRaw);
    if (Number.isFinite(rating)) return rating < 0 ? -1 : 1;
  }
  return 1;
}

function normalizeImportedGraph(payload: unknown): GraphData {
  let data: unknown = payload;
  if (isRecord(data) && isRecord(data.graph)) data = data.graph;
  if (!isRecord(data)) {
    throw new Error('导入失败：JSON 根对象无效');
  }

  const rawNodes = Array.isArray(data.nodes) ? data.nodes : [];
  const rawEdges = Array.isArray(data.edges)
    ? data.edges
    : Array.isArray((data as LooseRecord).links)
      ? ((data as LooseRecord).links as unknown[])
      : [];

  const nodes: GraphData['nodes'] = [];
  const nodeSeen = new Set<string>();
  for (const item of rawNodes) {
    if (!isRecord(item)) continue;
    const id = toNodeId(item.id ?? item.name ?? item.label);
    if (!id || nodeSeen.has(id)) continue;
    nodeSeen.add(id);
    nodes.push({
      id,
      label: toNodeId(item.label ?? item.name ?? item.id) || id,
    });
  }

  const edges: GraphData['edges'] = [];
  const edgeSeen = new Set<string>();
  let edgeIdx = 1;
  for (const item of rawEdges) {
    if (!isRecord(item)) continue;
    const source = toNodeId(item.source ?? item.from);
    const target = toNodeId(item.target ?? item.to);
    if (!source || !target || source === target) continue;
    const key = edgeKey(source, target);
    if (edgeSeen.has(key)) continue;

    edgeSeen.add(key);
    if (!nodeSeen.has(source)) {
      nodeSeen.add(source);
      nodes.push({ id: source, label: source });
    }
    if (!nodeSeen.has(target)) {
      nodeSeen.add(target);
      nodes.push({ id: target, label: target });
    }

    edges.push({
      id: toNodeId(item.id) || `e${edgeIdx++}`,
      source,
      target,
      sign: parseSignValue(item),
    });
  }

  if (nodes.length < 2) {
    throw new Error('导入失败：节点数量至少为 2');
  }

  return { nodes, edges };
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.trunc(Number.isFinite(value) ? value : min);
  return Math.max(min, Math.min(max, n));
}

function makeSeededRandom(seed: number) {
  let t = (seed >>> 0) + 0x6d2b79f5;
  return () => {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function countSign(edges: GraphData['edges']) {
  let pos = 0;
  let neg = 0;
  for (const e of edges) {
    if (e.sign === -1) neg += 1;
    else pos += 1;
  }
  return { pos, neg };
}

function buildNodeScores(graph: GraphData): Record<string, NodeScore> {
  const stats: Record<string, NodeScore> = {};
  for (const node of graph.nodes) {
    stats[node.id] = {
      degree: 0,
      posDegree: 0,
      negDegree: 0,
      mixedDegree: 0,
      score: 0,
    };
  }

  for (const edge of graph.edges) {
    const src = stats[edge.source];
    const dst = stats[edge.target];
    if (!src || !dst) continue;
    src.degree += 1;
    dst.degree += 1;
    if (edge.sign === -1) {
      src.negDegree += 1;
      dst.negDegree += 1;
    } else {
      src.posDegree += 1;
      dst.posDegree += 1;
    }
  }

  for (const nodeId of Object.keys(stats)) {
    const s = stats[nodeId];
    if (!s) continue;
    s.mixedDegree = Math.min(s.posDegree, s.negDegree);
    s.score = s.degree * 1.0 + s.mixedDegree * 2.2 + Math.sqrt(Math.max(0, s.degree)) * 0.6;
  }

  return stats;
}

function cropLargeSignedGraph(
  graph: GraphData,
  targetNodesInput: number,
  targetEdgesInput: number,
  seedInput: number
): { graph: GraphData; report: CropReport } {
  const beforeNodes = graph.nodes.length;
  const beforeEdges = graph.edges.length;
  const beforeSign = countSign(graph.edges);

  if (beforeNodes <= 2 || beforeEdges <= 1) {
    return {
      graph: cloneGraph(graph),
      report: {
        beforeNodes,
        beforeEdges,
        afterNodes: beforeNodes,
        afterEdges: beforeEdges,
        beforePos: beforeSign.pos,
        beforeNeg: beforeSign.neg,
        afterPos: beforeSign.pos,
        afterNeg: beforeSign.neg,
        cropped: false,
      },
    };
  }

  const targetNodes = clampInt(targetNodesInput, 20, beforeNodes);
  const targetEdges = clampInt(targetEdgesInput, 40, beforeEdges);
  if (beforeNodes <= targetNodes && beforeEdges <= targetEdges) {
    return {
      graph: cloneGraph(graph),
      report: {
        beforeNodes,
        beforeEdges,
        afterNodes: beforeNodes,
        afterEdges: beforeEdges,
        beforePos: beforeSign.pos,
        beforeNeg: beforeSign.neg,
        afterPos: beforeSign.pos,
        afterNeg: beforeSign.neg,
        cropped: false,
      },
    };
  }

  const rng = makeSeededRandom(clampInt(seedInput, 0, 2147483647));
  const nodeScores = buildNodeScores(graph);
  const neighbors = new Map<string, Array<{ other: string; sign: 1 | -1 }>>();
  for (const node of graph.nodes) {
    neighbors.set(node.id, []);
  }
  for (const edge of graph.edges) {
    neighbors.get(edge.source)?.push({ other: edge.target, sign: edge.sign });
    neighbors.get(edge.target)?.push({ other: edge.source, sign: edge.sign });
  }

  const rankedNodes = [...graph.nodes]
    .map((n) => ({ id: n.id, score: nodeScores[n.id]?.score ?? 0 }))
    .sort((a, b) => b.score - a.score);

  const anchorCount = Math.max(3, Math.min(Math.ceil(Math.sqrt(targetNodes)), rankedNodes.length));
  const selected = new Set<string>(rankedNodes.slice(0, anchorCount).map((x) => x.id));

  while (selected.size < targetNodes) {
    let bestNode = '';
    let bestScore = -Infinity;

    for (const nodeId of selected) {
      const adj = neighbors.get(nodeId) ?? [];
      for (const item of adj) {
        const candidate = item.other;
        if (selected.has(candidate)) continue;
        const stats = nodeScores[candidate];
        if (!stats) continue;

        let linksToSelected = 0;
        let signMixLinks = 0;
        for (const n2 of neighbors.get(candidate) ?? []) {
          if (!selected.has(n2.other)) continue;
          linksToSelected += 1;
          if (n2.sign === -1) signMixLinks += 1;
        }

        const candidateScore =
          stats.score +
          linksToSelected * 1.4 +
          signMixLinks * 0.8 +
          (item.sign === -1 ? 0.25 : 0.1) +
          rng() * 0.08;

        if (candidateScore > bestScore) {
          bestScore = candidateScore;
          bestNode = candidate;
        }
      }
    }

    if (!bestNode) {
      for (const node of rankedNodes) {
        if (selected.has(node.id)) continue;
        const fallbackScore = node.score + rng() * 0.05;
        if (fallbackScore > bestScore) {
          bestScore = fallbackScore;
          bestNode = node.id;
        }
      }
    }

    if (!bestNode) break;
    selected.add(bestNode);
  }

  const selectedEdges = graph.edges.filter((e) => selected.has(e.source) && selected.has(e.target));
  let keptEdges = selectedEdges;
  if (selectedEdges.length > targetEdges) {
    const selectedIds = selected;
    const edgeScore = (edge: GraphData['edges'][number]) => {
      const a = nodeScores[edge.source];
      const b = nodeScores[edge.target];
      const base = (a?.score ?? 0) + (b?.score ?? 0);
      let common = 0;
      const aNbr = neighbors.get(edge.source) ?? [];
      const bNbrSet = new Set((neighbors.get(edge.target) ?? []).map((x) => x.other));
      for (const item of aNbr) {
        if (!selectedIds.has(item.other)) continue;
        if (bNbrSet.has(item.other)) common += 1;
      }
      const signBoost = edge.sign === -1 ? 0.45 : 0.2;
      return base + common * 0.9 + signBoost + rng() * 0.05;
    };

    const posEdges = selectedEdges.filter((e) => e.sign !== -1).sort((x, y) => edgeScore(y) - edgeScore(x));
    const negEdges = selectedEdges.filter((e) => e.sign === -1).sort((x, y) => edgeScore(y) - edgeScore(x));
    const totalSign = countSign(selectedEdges);
    const negRatio = totalSign.neg / Math.max(1, totalSign.pos + totalSign.neg);
    let keepNeg = Math.min(negEdges.length, Math.round(targetEdges * negRatio));
    if (negEdges.length > 0) {
      keepNeg = Math.max(1, keepNeg);
    }
    let keepPos = targetEdges - keepNeg;
    if (keepPos > posEdges.length) {
      keepPos = posEdges.length;
      keepNeg = Math.min(negEdges.length, targetEdges - keepPos);
    }
    if (keepNeg > negEdges.length) {
      keepNeg = negEdges.length;
      keepPos = Math.min(posEdges.length, targetEdges - keepNeg);
    }

    keptEdges = [...posEdges.slice(0, keepPos), ...negEdges.slice(0, keepNeg)];
    if (keptEdges.length < targetEdges) {
      const used = new Set(keptEdges.map((e) => edgeKey(e.source, e.target)));
      const tail = selectedEdges
        .filter((e) => !used.has(edgeKey(e.source, e.target)))
        .sort((x, y) => edgeScore(y) - edgeScore(x));
      for (const e of tail) {
        if (keptEdges.length >= targetEdges) break;
        keptEdges.push(e);
      }
    }
  }

  const nodeIdSet = new Set<string>();
  for (const edge of keptEdges) {
    nodeIdSet.add(edge.source);
    nodeIdSet.add(edge.target);
  }
  for (const id of selected) {
    if (nodeIdSet.size >= targetNodes) break;
    nodeIdSet.add(id);
  }

  const keptNodes = graph.nodes
    .filter((node) => nodeIdSet.has(node.id))
    .slice(0, targetNodes)
    .map((node) => ({ id: node.id, label: node.label }));

  const finalNodeSet = new Set(keptNodes.map((n) => n.id));
  const finalEdges: GraphData['edges'] = keptEdges
    .filter((edge) => finalNodeSet.has(edge.source) && finalNodeSet.has(edge.target))
    .slice(0, targetEdges)
    .map((edge, idx) => ({
      id: edge.id || `e${idx + 1}`,
      source: edge.source,
      target: edge.target,
      sign: edge.sign === -1 ? (-1 as const) : (1 as const),
    }));

  const afterSign = countSign(finalEdges);
  return {
    graph: {
      nodes: keptNodes,
      edges: finalEdges,
    },
    report: {
      beforeNodes,
      beforeEdges,
      afterNodes: keptNodes.length,
      afterEdges: finalEdges.length,
      beforePos: beforeSign.pos,
      beforeNeg: beforeSign.neg,
      afterPos: afterSign.pos,
      afterNeg: afterSign.neg,
      cropped: true,
    },
  };
}

function buildCropSummary(report: CropReport): string {
  if (!report.cropped) return '导入网络未触发裁剪（规模已在阈值内）。';
  const beforeNegRatio = report.beforeNeg / Math.max(1, report.beforePos + report.beforeNeg);
  const afterNegRatio = report.afterNeg / Math.max(1, report.afterPos + report.afterNeg);
  return [
    `裁剪完成：N ${report.beforeNodes} -> ${report.afterNodes}`,
    `E ${report.beforeEdges} -> ${report.afterEdges}`,
    `负边占比 ${(beforeNegRatio * 100).toFixed(1)}% -> ${(afterNegRatio * 100).toFixed(1)}%`,
  ].join(' · ');
}

async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('导入失败：JSON 解析错误');
  }
}

function parseSignToken(token: string): 1 | -1 | null {
  const text = token.trim().toLowerCase();
  if (!text) return null;

  if (text === '1' || text === '+1' || text === '+' || text === 'pos' || text === 'positive' || text === 'trust') {
    return 1;
  }
  if (text === '-1' || text === '-' || text === 'neg' || text === 'negative' || text === 'distrust') {
    return -1;
  }

  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return numeric < 0 ? -1 : 1;
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

function detectDelimiter(line: string): ',' | '\t' | ' ' {
  if (line.includes(',')) return ',';
  if (line.includes('\t')) return '\t';
  return ' ';
}

function splitLineByDelimiter(line: string, delimiter: ',' | '\t' | ' '): string[] {
  if (delimiter === ',') return parseCsvLine(line);
  if (delimiter === '\t') return line.split('\t');
  return line.trim().split(/\s+/);
}

function looksLikeHeader(tokens: string[]): boolean {
  const t0 = (tokens[0] ?? '').trim().toLowerCase();
  const t1 = (tokens[1] ?? '').trim().toLowerCase();
  const t2 = (tokens[2] ?? '').trim().toLowerCase();
  if (!t0 || !t1) return false;
  const firstIsSource = ['source', 'from', 'src', 'fromnodeid', 'node1'].includes(t0);
  const secondIsTarget = ['target', 'to', 'dst', 'tonodeid', 'node2'].includes(t1);
  const thirdIsSignLike = ['sign', 'rating', 'weight', 'label'].includes(t2);
  return firstIsSource || secondIsTarget || thirdIsSignLike;
}

function normalizeImportedCsv(text: string): { graph: GraphData; report: CsvValidationReport } {
  const rawLines = text.split(/\r?\n/);
  const effective: Array<{ lineNo: number; text: string }> = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const line = (rawLines[i] ?? '').trim();
    if (!line || line.startsWith('#')) continue;
    effective.push({ lineNo: i + 1, text: line });
  }

  if (!effective.length) {
    throw new Error('导入失败：CSV 内容为空');
  }

  const delimiter = detectDelimiter(effective[0]?.text ?? '');
  const firstTokens = splitLineByDelimiter(effective[0]?.text ?? '', delimiter).map((x) => x.trim());
  const hasHeader = looksLikeHeader(firstTokens);
  const startIndex = hasHeader ? 1 : 0;

  const nodes: GraphData['nodes'] = [];
  const edges: GraphData['edges'] = [];
  const nodeSeen = new Set<string>();
  const edgeSeen = new Set<string>();

  const issues: CsvValidationIssue[] = [];
  const maxIssueCount = 8;
  const pushIssue = (line: number, reason: string, raw: string) => {
    if (issues.length >= maxIssueCount) return;
    issues.push({ line, reason, raw });
  };

  let edgeIdx = 1;
  let skippedShort = 0;
  let skippedSelfLoop = 0;
  let skippedInvalidSign = 0;
  let skippedDuplicate = 0;

  for (let i = startIndex; i < effective.length; i += 1) {
    const item = effective[i];
    if (!item) continue;
    const tokens = splitLineByDelimiter(item.text, delimiter).map((x) => x.trim());
    if (tokens.length < 3) {
      skippedShort += 1;
      pushIssue(item.lineNo, '列数不足（至少需要 source,target,sign）', item.text);
      continue;
    }

    const source = toNodeId(tokens[0]);
    const target = toNodeId(tokens[1]);
    if (!source || !target) {
      skippedShort += 1;
      pushIssue(item.lineNo, 'source 或 target 为空', item.text);
      continue;
    }
    if (source === target) {
      skippedSelfLoop += 1;
      pushIssue(item.lineNo, '检测到自环边（source=target）', item.text);
      continue;
    }

    let sign = parseSignToken(tokens[2] ?? '');
    if (sign === null && tokens.length >= 4) {
      sign = parseSignToken(tokens[3] ?? '');
    }
    if (sign === null) {
      skippedInvalidSign += 1;
      pushIssue(item.lineNo, '无法识别 sign（应为 1/-1 或可转为正负）', item.text);
      continue;
    }

    const key = edgeKey(source, target);
    if (edgeSeen.has(key)) {
      skippedDuplicate += 1;
      pushIssue(item.lineNo, '重复边（无向去重后重复）', item.text);
      continue;
    }
    edgeSeen.add(key);

    if (!nodeSeen.has(source)) {
      nodeSeen.add(source);
      nodes.push({ id: source, label: source });
    }
    if (!nodeSeen.has(target)) {
      nodeSeen.add(target);
      nodes.push({ id: target, label: target });
    }

    edges.push({
      id: `e${edgeIdx++}`,
      source,
      target,
      sign,
    });
  }

  if (nodes.length < 2) {
    throw new Error('导入失败：CSV 至少需要 2 个节点');
  }
  if (!edges.length) {
    const detail = issues.map((x) => `第${x.line}行：${x.reason}`).join('；');
    throw new Error(`导入失败：CSV 未解析出有效边${detail ? `（${detail}）` : ''}`);
  }

  const report: CsvValidationReport = {
    delimiter,
    hasHeader,
    totalLines: rawLines.length,
    dataLines: Math.max(0, effective.length - startIndex),
    parsedNodes: nodes.length,
    parsedEdges: edges.length,
    skippedShort,
    skippedSelfLoop,
    skippedInvalidSign,
    skippedDuplicate,
    issues,
  };

  return { graph: { nodes, edges }, report };
}

function delimiterName(delimiter: ',' | '\t' | ' '): string {
  if (delimiter === ',') return '逗号';
  if (delimiter === '\t') return 'Tab';
  return '空格';
}

function showUploadValidationAlert(message: string) {
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message);
  }
}

function buildCsvValidationMessage(fileName: string, report: CsvValidationReport, cropReport: CropReport): string {
  const skippedTotal =
    report.skippedShort + report.skippedSelfLoop + report.skippedInvalidSign + report.skippedDuplicate;
  const lines: string[] = [
    `文件：${fileName}`,
    'CSV 校验完成',
    `分隔符：${delimiterName(report.delimiter)} · 表头：${report.hasHeader ? '是' : '否'}`,
    `数据行：${report.dataLines} · 解析成功边：${report.parsedEdges} · 节点：${report.parsedNodes}`,
    `跳过行：${skippedTotal}（列不足 ${report.skippedShort} / 自环 ${report.skippedSelfLoop} / sign异常 ${report.skippedInvalidSign} / 重复 ${report.skippedDuplicate}）`,
  ];

  if (report.issues.length > 0) {
    lines.push('问题示例：');
    for (const issue of report.issues) {
      lines.push(`- 第${issue.line}行：${issue.reason}`);
    }
  }

  lines.push(cropReport.cropped ? buildCropSummary(cropReport) : '本次未触发裁剪。');
  return lines.join('\n');
}

function buildJsonValidationMessage(fileName: string, graph: GraphData, cropReport: CropReport): string {
  const sign = countSign(graph.edges);
  const lines = [
    `文件：${fileName}`,
    'JSON 校验完成',
    `节点：${graph.nodes.length} · 边：${graph.edges.length} · 正边：${sign.pos} · 负边：${sign.neg}`,
    cropReport.cropped ? buildCropSummary(cropReport) : '本次未触发裁剪。',
  ];
  return lines.join('\n');
}

function openCustomImportFile() {
  customImportInput.value?.click();
}

async function handleCustomImportFile(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const fileName = file.name.toLowerCase();
    let graph: GraphData;
    let csvReport: CsvValidationReport | null = null;
    let importFormat: 'csv' | 'json' = 'json';
    if (fileName.endsWith('.json')) {
      const payload = await readJsonFile(file);
      graph = normalizeImportedGraph(payload);
      importFormat = 'json';
    } else if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
      const text = await file.text();
      const parsed = normalizeImportedCsv(text);
      graph = parsed.graph;
      csvReport = parsed.report;
      importFormat = 'csv';
    } else {
      const text = await file.text();
      try {
        graph = normalizeImportedGraph(JSON.parse(text));
        importFormat = 'json';
      } catch {
        const parsed = normalizeImportedCsv(text);
        graph = parsed.graph;
        csvReport = parsed.report;
        importFormat = 'csv';
      }
    }

    let report: CropReport = {
      beforeNodes: graph.nodes.length,
      beforeEdges: graph.edges.length,
      afterNodes: graph.nodes.length,
      afterEdges: graph.edges.length,
      beforePos: countSign(graph.edges).pos,
      beforeNeg: countSign(graph.edges).neg,
      afterPos: countSign(graph.edges).pos,
      afterNeg: countSign(graph.edges).neg,
      cropped: false,
    };

    if (cropEnabled.value) {
      const cropped = cropLargeSignedGraph(graph, cropTargetNodes.value, cropTargetEdges.value, cropSeed.value);
      graph = cropped.graph;
      report = cropped.report;
    }

    customGraph.value = graph;
    edgeIdCounter = Math.max(edgeIdCounter, graph.edges.length + 1);
    newEdgeSource.value = graph.nodes[0]?.id ?? '';
    newEdgeTarget.value = graph.nodes[1]?.id ?? '';
    dataSource.value = 'custom';
    cropSummaryText.value = buildCropSummary(report);
    pgsbcError.value = '';

    if (importFormat === 'csv' && csvReport) {
      showUploadValidationAlert(buildCsvValidationMessage(file.name, csvReport, report));
    } else {
      showUploadValidationAlert(buildJsonValidationMessage(file.name, graph, report));
    }
  } catch (ex: any) {
    const msg = ex?.message ?? '导入失败';
    pgsbcError.value = msg;
    showUploadValidationAlert(`导入失败：${file.name}\n${msg}`);
  } finally {
    if (input) input.value = '';
  }
}

function exportCustomGraphJson() {
  if (!customGraph.value.nodes.length) {
    pgsbcError.value = '当前自定义网络为空，无法导出';
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const payload = {
    meta: {
      source: 'paper-visualization-custom',
      exported_at: new Date().toISOString(),
      node_count: customGraph.value.nodes.length,
      edge_count: customGraph.value.edges.length,
    },
    graph: cloneGraph(customGraph.value),
  };
  downloadText(`custom-network-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
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
const backendOutlierSummary = computed(() => {
  const task = pgsbcTaskState.value;
  if (!task) return '';

  const report = (task.outlier_filter_report ?? {}) as Record<string, unknown>;
  const applied = Boolean(report.applied);
  const removedNodes = parseNumber(report.removed_nodes) ?? 0;
  const removedEdges = parseNumber(report.removed_edges) ?? 0;
  const beforeNodes = parseNumber(report.before_nodes) ?? task.input_node_count ?? task.node_count;
  const afterNodes = parseNumber(report.after_nodes) ?? task.node_count;
  const reasonRaw = report.reason;
  const reason = typeof reasonRaw === 'string' ? reasonRaw : '';

  if (task.outlier_filter_enabled === false) {
    return '后端离群过滤：关闭';
  }
  if (applied) {
    return `后端离群过滤：${beforeNodes}N -> ${afterNodes}N，移除 ${removedNodes} 节点 / ${removedEdges} 边`;
  }
  if (reason) {
    return `后端离群过滤：未触发（${reason}）`;
  }
  return '';
});
const backendOutlierOverlayText = computed(() => {
  const task = pgsbcTaskState.value;
  if (!task) return '';
  const report = (task.outlier_filter_report ?? {}) as Record<string, unknown>;
  const applied = Boolean(report.applied);
  if (!applied) return '';
  const removedNodes = parseNumber(report.removed_nodes) ?? 0;
  const removedEdges = parseNumber(report.removed_edges) ?? 0;
  if (removedNodes <= 0 && removedEdges <= 0) return '';
  return `后端过滤：-${removedNodes} 节点 / -${removedEdges} 边`;
});
const exportLoading = ref(false);
const showParamHelp = ref(false);
const batchRunning = ref(false);
const batchStopRequested = ref(false);
const batchCurrentKey = ref('');
const batchResults = ref<BatchResult[]>([]);

const batchDoneCount = computed(() => batchResults.value.length);
const batchSuccessCount = computed(() => batchResults.value.filter((x) => x.status === 'success').length);
const batchFailCount = computed(() => batchResults.value.filter((x) => x.status === 'failed').length);
const batchStoppedCount = computed(() => batchResults.value.filter((x) => x.status === 'stopped').length);
const flowReplayEvents = ref<ReplayEvent[]>([]);
const demoFinalStateByKey = ref<Record<string, DemoFinalClusterState>>({});
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
  if (pgsbcHasTask.value) {
    const effective = pgsbcTaskState.value?.effective_graph;
    if (effective && Array.isArray(effective.nodes) && effective.nodes.length >= 2) {
      return cloneGraph(effective);
    }
    return boundTaskGraph.value ?? inputGraph.value;
  }
  return inputGraph.value;
});

const rawGraphForRender = computed<GraphData>(() => {
  return cloneGraph(taskGraph.value);
});

const clusterBaseGraphForRender = computed<GraphData>(() => {
  const base = cloneGraph(taskGraph.value);
  const labels = clusterLabelsForView.value;
  if (Object.keys(labels).length > 0) {
    base.clusters = { ...labels };
  }
  return base;
});

const clusteredGraphForRender = computed<GraphData>(() => clusterBaseGraphForRender.value);

const hasClusterLabels = computed(() => {
  const labels = clusteredGraphForRender.value.clusters ?? {};
  return Object.keys(labels).length > 0;
});

const clusterCount = computed(() => {
  const labels = clusteredGraphForRender.value.clusters ?? {};
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
    if (dataSource.value === 'demo') {
      const key = activeDemoKeyForView.value;
      const saved = demoFinalStateByKey.value[key]?.labels;
      if (saved && Object.keys(saved).length > 0) return saved;
      if (batchRunning.value && key === batchCurrentKey.value) {
        return pgsbcTaskState.value?.current_labels ?? {};
      }
      return {};
    }
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
  void createTask(graph, {
    outlier_filter: backendOutlierFilterEnabled.value,
  });
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
  demoFinalStateByKey.value = {};

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

        await createTask(graph, {
          outlier_filter: backendOutlierFilterEnabled.value,
        });
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
      const finalLabels = { ...(pgsbcTaskState.value?.current_labels ?? {}) };
      demoFinalStateByKey.value = {
        ...demoFinalStateByKey.value,
        [key]: {
          labels: finalLabels,
          rounds: pgsbcRoundCount.value,
          acceptedH: getAcceptedHSnapshot(),
          status,
        },
      };

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
    'candidate_h_anon',
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
