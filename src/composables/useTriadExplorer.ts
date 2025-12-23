// File: src/composables/useTriadExplorer.ts
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { GraphData } from '../types/symbolNetwork';
import { findUnbalancedTriads, type Triad } from '../utils/graphTriads';

export interface UseTriadExplorerArgs {
  baseGraph: Ref<GraphData>;
  enabled: Ref<boolean>;
}

export function useTriadExplorer(args: UseTriadExplorerArgs) {
  const { baseGraph, enabled } = args;

  const triads = ref<Triad[]>([]);
  const index = ref(0);

  const autoplayOn = ref(false);
  let timer: number | null = null;

  function stopAutoplay() {
    autoplayOn.value = false;
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function startAutoplay(intervalMs = 1200) {
    if (!enabled.value) return;
    if (triads.value.length <= 1) return;

    autoplayOn.value = true;
    if (timer !== null) window.clearInterval(timer);

    timer = window.setInterval(() => {
      next();
    }, intervalMs);
  }

  function next() {
    if (!triads.value.length) return;
    index.value = (index.value + 1) % triads.value.length;
  }

  function prev() {
    if (!triads.value.length) return;
    index.value = (index.value - 1 + triads.value.length) % triads.value.length;
  }

  const currentTriad = computed<Triad | null>(() => {
    if (!enabled.value) return null;
    if (!triads.value.length) return null;
    const i = Math.min(index.value, triads.value.length - 1);
    return triads.value[i] ?? null;
  });

  const highlightNodes = computed<Set<string>>(() => {
    const t = currentTriad.value;
    if (!t) return new Set();
    return new Set(t.nodeIds);
  });

  const highlightEdges = computed<Set<string>>(() => {
    const t = currentTriad.value;
    if (!t) return new Set();
    return new Set(t.edgeKeys);
  });

  // triad 统计信息（给 UI 用）
  const totalUnbalanced = computed(() => triads.value.length);

  const typeBuckets = computed(() => {
    // 只统计 unbalanced triads 的 type 分布
    const m = new Map<string, number>();
    for (const t of triads.value) m.set(t.type, (m.get(t.type) ?? 0) + 1);
    // 转数组并按数量降序
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count }));
  });

  // 当 baseGraph 或 enabled 变化时，重算 triads
  watch(
    [baseGraph, enabled],
    ([g, en]) => {
      stopAutoplay();

      if (!en) {
        triads.value = [];
        index.value = 0;
        return;
      }

      triads.value = findUnbalancedTriads(g);
      index.value = 0;
    },
    { deep: true, immediate: true }
  );

  onBeforeUnmount(() => {
    stopAutoplay();
  });

  return {
    triads,
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
  };
}
