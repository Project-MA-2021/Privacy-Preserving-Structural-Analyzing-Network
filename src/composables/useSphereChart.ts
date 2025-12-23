// File: src/composables/useSphereChart.ts
import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue';
import * as echarts from 'echarts';
import 'echarts-gl';

import type { GraphData } from '../types/symbolNetwork';
import type { GraphDataWithEdgeKind } from '../utils/graphCompare';
import { buildSphereGraphOption, type DisplayMode } from '../utils/buildSphereGraphOption';

export interface UseSphereChartArgs {
  chartDom: Ref<HTMLDivElement | null>;
  graph: Ref<GraphData | GraphDataWithEdgeKind>;
  displayMode: Ref<DisplayMode>;
  drawEdges: Ref<boolean>;

  //  triad 高亮
  highlightNodes?: Ref<Set<string>>;
  highlightEdges?: Ref<Set<string>>;
}

export function useSphereChart(args: UseSphereChartArgs) {
  const { chartDom, graph, displayMode, drawEdges, highlightNodes, highlightEdges } = args;

  let chart: echarts.ECharts | null = null;

  function setOption() {
    chart?.setOption(
      buildSphereGraphOption({
        graph: graph.value,
        displayMode: displayMode.value,
        drawEdges: drawEdges.value,
        highlightNodes: highlightNodes?.value,
        highlightEdges: highlightEdges?.value,
      }) as any,
      true
    );
  }

  function initChart() {
    if (!chartDom.value) return;
    chart = echarts.init(chartDom.value);

    chart.setOption(
      buildSphereGraphOption({
        graph: graph.value,
        displayMode: displayMode.value,
        drawEdges: drawEdges.value,
        highlightNodes: highlightNodes?.value,
        highlightEdges: highlightEdges?.value,
      }) as any
    );
  }

  function resizeChart() {
    chart?.resize();
  }

  onMounted(() => {
    initChart();
    window.addEventListener('resize', resizeChart);
  });

  watch(
    [graph, displayMode, drawEdges, highlightNodes ?? (() => null as any), highlightEdges ?? (() => null as any)],
    () => {
      if (!chart && chartDom.value) {
        initChart();
        return;
      }
      setOption();
    },
    { deep: true }
  );

  onBeforeUnmount(() => {
    window.removeEventListener('resize', resizeChart);
    chart?.dispose();
    chart = null;
  });

  return {
    resizeChart,
  };
}
