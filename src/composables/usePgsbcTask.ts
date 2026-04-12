import { computed, onBeforeUnmount, ref } from 'vue';
import type { GraphData } from '../types/symbolNetwork';

export interface PgsbcTaskState {
  id: string;
  status: 'ready' | 'running' | 'done' | string;
  t: number;
  max_iter: number;
  rb: number;
  initialized: boolean;
  input_node_count?: number;
  input_edge_count?: number;
  node_count: number;
  real_edge_count: number;
  anon_edge_count: number;
  effective_graph?: GraphData;
  outlier_filter_enabled?: boolean;
  outlier_filter_report?: Record<string, unknown>;
  last_accepted_h: number | null;
  current_h_real: number | null;
  current_labels: Record<string, number>;
  observed_h_history: number[];
  accepted_h_history: number[];
  c_history: number[];
  round_count?: number;
}

export interface PgsbcTimelineEvent {
  t: number;
  step: number;
  actor: string;
  message: string;
  payload: Record<string, unknown>;
  ts: string;
}

export interface PgsbcExportRow {
  round: number;
  t_before_commit: number;
  h_t: number;
  c_t: number;
  accepted_h: number;
  candidate_h_real: number;
  candidate_h_anon?: number;
  current_h_real: number | null;
  real_unbalanced: number;
  disturbed_unbalanced: number;
  node_count: number;
  real_edge_count: number;
  anon_edge_count: number;
  iter_ms: number;
  ts: string;
}

export interface PgsbcExportPayload {
  task_id: string;
  summary: {
    status: string;
    t: number;
    max_iter: number;
    rb: number;
    input_node_count?: number;
    input_edge_count?: number;
    node_count: number;
    real_edge_count: number;
    anon_edge_count: number;
    outlier_filter_enabled?: boolean;
    outlier_filter_report?: Record<string, unknown>;
    round_count: number;
  };
  rows: PgsbcExportRow[];
}

export interface CreateTaskOptions {
  outlier_filter?: boolean;
  outlier_max_remove_ratio?: number;
  outlier_min_nodes?: number;
}

function getApiBaseUrl() {
  const env = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (!env) return '/api/v1';
  return env.endsWith('/') ? env.slice(0, -1) : env;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    const msg = body?.error?.message || `${response.status} ${response.statusText}`;
    throw new Error(msg);
  }
  return body as T;
}

export function usePgsbcTask() {
  const apiBaseUrl = getApiBaseUrl();

  const task = ref<PgsbcTaskState | null>(null);
  const timeline = ref<PgsbcTimelineEvent[]>([]);
  const loading = ref(false);
  const error = ref('');

  const maxIter = ref(8);
  const rb = ref(0.25);

  const taskId = computed(() => task.value?.id ?? '');
  const hasTask = computed(() => !!task.value);
  const isDone = computed(() => task.value?.status === 'done');

  let timer: number | null = null;
  const autoplayOn = ref(false);

  function clearError() {
    error.value = '';
  }

  function stopAutoplay() {
    autoplayOn.value = false;
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  async function refreshState() {
    if (!taskId.value) return;
    const body = await requestJson<{ ok: boolean; data: { task: PgsbcTaskState } }>(
      `${apiBaseUrl}/tasks/${taskId.value}/state`
    );
    task.value = body.data.task;
  }

  async function refreshTimeline() {
    if (!taskId.value) return;
    const body = await requestJson<{ ok: boolean; data: { timeline: PgsbcTimelineEvent[] } }>(
      `${apiBaseUrl}/tasks/${taskId.value}/timeline`
    );
    timeline.value = body.data.timeline ?? [];
  }

  async function fetchExportData(): Promise<PgsbcExportPayload> {
    if (!taskId.value) {
      throw new Error('尚未创建任务');
    }
    const body = await requestJson<{ ok: boolean; data: PgsbcExportPayload }>(
      `${apiBaseUrl}/tasks/${taskId.value}/export`
    );
    return body.data;
  }

  async function createTask(graph: GraphData, options?: CreateTaskOptions) {
    loading.value = true;
    clearError();
    stopAutoplay();
    try {
      const body = await requestJson<{ ok: boolean; data: { task: PgsbcTaskState } }>(
        `${apiBaseUrl}/tasks`,
        {
          method: 'POST',
          body: JSON.stringify({
            graph,
            max_iter: maxIter.value,
            rb: rb.value,
            ...(options ?? {}),
          }),
        }
      );
      task.value = body.data.task;
      timeline.value = [];
      await refreshTimeline();
    } catch (ex: any) {
      error.value = ex?.message ?? '创建任务失败';
    } finally {
      loading.value = false;
    }
  }

  async function iterateOnce() {
    if (!taskId.value) return;
    if (isDone.value) return;

    loading.value = true;
    clearError();
    try {
      const body = await requestJson<{ ok: boolean; data: { task: PgsbcTaskState } }>(
        `${apiBaseUrl}/tasks/${taskId.value}/iterate`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      task.value = body.data.task;
      await refreshTimeline();
      if (task.value?.status === 'done') {
        stopAutoplay();
      }
    } catch (ex: any) {
      stopAutoplay();
      error.value = ex?.message ?? '迭代失败';
    } finally {
      loading.value = false;
    }
  }

  async function resetTask() {
    if (!taskId.value) return;
    loading.value = true;
    clearError();
    stopAutoplay();
    try {
      const body = await requestJson<{ ok: boolean; data: { task: PgsbcTaskState } }>(
        `${apiBaseUrl}/tasks/${taskId.value}/reset`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      task.value = body.data.task;
      await refreshTimeline();
    } catch (ex: any) {
      error.value = ex?.message ?? '重置任务失败';
    } finally {
      loading.value = false;
    }
  }

  function startAutoplay(intervalMs = 1500) {
    if (!taskId.value || isDone.value) return;
    stopAutoplay();
    autoplayOn.value = true;
    timer = window.setInterval(() => {
      if (loading.value) return;
      if (isDone.value) {
        stopAutoplay();
        return;
      }
      void iterateOnce();
    }, intervalMs);
  }

  onBeforeUnmount(() => {
    stopAutoplay();
  });

  return {
    apiBaseUrl,
    task,
    timeline,
    maxIter,
    rb,
    loading,
    error,
    hasTask,
    isDone,
    autoplayOn,
    createTask,
    iterateOnce,
    resetTask,
    refreshState,
    refreshTimeline,
    fetchExportData,
    startAutoplay,
    stopAutoplay,
  };
}
