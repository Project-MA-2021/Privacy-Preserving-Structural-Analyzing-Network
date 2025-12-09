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
            <input
              type="radio"
              value="demo"
              v-model="dataSource"
            />
            示例网络
          </label>
          <label>
            <input
              type="radio"
              value="custom"
              v-model="dataSource"
            />
            自定义网络
          </label>
        </div>
      </div>

      <!-- 示例网络选择 -->
      <div
        v-if="dataSource === 'demo'"
        class="sidebar-section"
      >
        <label class="section-label">示例网络：</label>
        <select v-model="selectedDemoKey">
          <option value="GGS">GGS 示例网络</option>
          <!-- 以后可以再加 ISN 等 -->
        </select>

        <p class="hint">
          当前选中：{{ selectedDemoKey }}（节点 {{ currentGraph.nodes.length }} 个，边
          {{ currentGraph.edges.length }} 条）
        </p>
      </div>

      <!-- 自定义网络占位 -->
      <div
        v-else
        class="sidebar-section"
      >
        <label class="section-label">自定义网络：</label>
        <p class="hint">
          这里后面会支持：手动添加节点 / 边（+/-），下一步我们再来搭这个表单。
        </p>
      </div>
    </aside>

    <!-- 右侧图形区 -->
    <main class="symbol-main">
      <div class="chart-container">
        <!-- 真正的 ECharts 容器 -->
        <div
          ref="chartDom"
          class="chart-root"
        ></div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GraphData } from '../types/symbolNetwork';
import { demoGraphs } from '../data/demoGraphs';

// ECharts 相关
import * as echarts from 'echarts';
import 'echarts-gl';

import { computeSphereLayout, type Coord3D } from '../utils/sphereLayout';

type DataSourceType = 'demo' | 'custom';
type EChartsGLOption = echarts.EChartsOption & {
  xAxis3D?: any;
  yAxis3D?: any;
  zAxis3D?: any;
  grid3D?: any;
  globe?: any;
  series?: any;
};


const dataSource = ref<DataSourceType>('demo');
const selectedDemoKey = ref<'GGS'>('GGS');

// 自定义网络数据（先留空，下一步我们会真正操作它）
const customGraph = ref<GraphData>({
  nodes: [],
  edges: [],
});

// 当前用于展示的图
const currentGraph = computed<GraphData>(() => {
  if (dataSource.value === 'demo') {
    return demoGraphs[selectedDemoKey.value];
  }
  return customGraph.value;
});

// --- ECharts 初始化与更新 ---

const chartDom = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;

function buildSphereGraphOption(graph: GraphData): EChartsGLOption {
  // 没节点就返回一个空配置，避免多余 setOption
  if (!graph.nodes.length) {
    return { series: [] };
  }

  const radius = 10;
  const coords = computeSphereLayout(graph.nodes, radius);

  const nodeData = graph.nodes.map((node) => {
    const [x, y, z] = coords[node.id] as Coord3D;
    return {
      name: node.label,
      value: [x, y, z],
      nodeId: node.id,
    };
  });

  const option: EChartsGLOption = {
    tooltip: {
      formatter: (params: any) => {
        if (params.seriesType === 'scatter3D') {
          return `节点：${params.data.nodeId}`;
        }
        return '';
      },
    },

    // 三维直角坐标系
    xAxis3D: {
      type: 'value',
      min: -radius * 1.2,
      max: radius * 1.2,
    },
    yAxis3D: {
      type: 'value',
      min: -radius * 1.2,
      max: radius * 1.2,
    },
    zAxis3D: {
      type: 'value',
      min: -radius * 1.2,
      max: radius * 1.2,
    },

    grid3D: {
      viewControl: {
        autoRotate: true,
        autoRotateSpeed: 5,
        projection: 'perspective',
      },
    },

    // ⚠️ 先不加 globe，不加 lines3D，只画点
    series: [
      {
        type: 'scatter3D',
        coordinateSystem: 'cartesian3D',
        symbolSize: 12,
        data: nodeData,
        itemStyle: {
          opacity: 0.9,
        },
        label: {
          show: true,
          formatter: '{b}',
          distance: 2,
        },
      },
    ],
  };

  return option;
}


function initChart() {
  if (!chartDom.value) return;

  // 防止重复 init
  if (chart) {
    chart.dispose();
    chart = null;
  }

  chart = echarts.init(chartDom.value);

  const graph = currentGraph.value;
  console.log('init graph:', graph);  // 调试看有没有节点/边

  const option = buildSphereGraphOption(graph);
  console.log('init option:', option); // 调试看 option 结构

  chart.setOption(option as echarts.EChartsOption);
  chart.resize(); // 初始化后强制做一次尺寸计算
}


function resizeChart() {
  if (chart) {
    chart.resize();
  }
}

onMounted(() => {
  initChart();
  window.addEventListener('resize', resizeChart);
});

// 当数据变化时更新图
watch(
  () => currentGraph.value,
  (newVal) => {
    if (!chart && chartDom.value) {
      initChart();
    }
    if (chart) {
      chart.setOption(buildSphereGraphOption(newVal) as echarts.EChartsOption, true);
    }
  },
  { deep: true }
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart);
  if (chart) {
    chart.dispose();
    chart = null;
  }
});
</script>

<style scoped>.symbol-page {
  display: flex;
  width: 100vw;
  height: 100vh;  /* 整页铺满视口 */
}

/* 左侧：占大约 22%，但至少 280px 宽 */
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

/* 右侧：直接作为一个占满高度的区域，不再用 position: absolute */
.symbol-main {
  flex: 1 1 auto;
  padding: 12px;
  box-sizing: border-box;
}

/* 图表外层容器：直接 100% 宽高 */
.chart-container {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

/* 真正的 ECharts 容器：也占满 */
.chart-root {
  width: 100%;
  height: 100%;
  /* 临时加个边框，方便你确认容器确实有大小 */
  border: 1px solid rgba(255, 255, 255, 0.2);
}

/* 下面这些原样保留 */
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
  margin-bottom: 6px;
}

.radio-group {
  display: flex;
  gap: 16px;
  font-size: 14px;
}

.hint {
  font-size: 12px;
  color: #aaa;
  margin-top: 6px;
}

</style>
