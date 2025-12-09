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
          <option value="ISN">ISN 示例网络</option>
          <!-- 以后可以再加 ISN 等 -->
        </select>

        <p class="hint">
          当前选中：{{ selectedDemoKey }}（节点 {{ currentGraph.nodes.length }} 个，边
          {{ currentGraph.edges.length }} 条）
        </p>
      </div>

            <!-- 自定义网络：添加节点 / 边 -->
      <div
        v-else
        class="sidebar-section"
      >
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
            <button
              class="btn"
              type="button"
              @click="addNode"
            >
              添加
            </button>
          </div>
          <p class="hint">
            当前节点：{{ customGraph.nodes.length }} 个
          </p>
        </div>

        <!-- 添加边 -->
        <div class="form-block">
          <div class="form-label">添加边：</div>
          <div class="form-row">
            <select
              v-model="newEdgeSource"
              class="select"
            >
              <option value="" disabled>起点</option>
              <option
                v-for="n in customGraph.nodes"
                :key="n.id"
                :value="n.id"
              >
                {{ n.label }}
              </option>
            </select>

            <select
              v-model="newEdgeTarget"
              class="select"
            >
              <option value="" disabled>终点</option>
              <option
                v-for="n in customGraph.nodes"
                :key="n.id"
                :value="n.id"
              >
                {{ n.label }}
              </option>
            </select>
          </div>

          <div class="form-row form-row-small">
            <label>
              <input
                type="radio"
                value="1"
                v-model.number="newEdgeSign"
              />
              正边（+，友好）
            </label>
            <label>
              <input
                type="radio"
                value="-1"
                v-model.number="newEdgeSign"
              />
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

          <p class="hint">
            当前边：{{ customGraph.edges.length }} 条（暂时未在图中显示）
          </p>
        </div>
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
  import { demoGraphs,type DemoGraphKey } from '../data/demoGraphs';
  
  // ECharts 相关
  import * as echarts from 'echarts';
  import 'echarts-gl';
  
  import { computeSphereLayout, type Coord3D } from '../utils/sphereLayout';

  const clusterColors = ['#66ccff', '#ffcc66']; // 簇 0、簇 1 的颜色
  const defaultNodeColor = '#ffffff';

  
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
  
  const dataSource = ref<DataSourceType>('demo');
  const selectedDemoKey = ref<DemoGraphKey>('GGS');
  
  // 自定义网络数据
  const customGraph = ref<GraphData>({
    nodes: [],
    edges: [],
  });
  
  // ---------- 自建网表单状态 & 方法 ----------
  
  // 添加节点的输入
  const newNodeLabel = ref('');
  
  // 添加边的输入：起点、终点、正/负
  const newEdgeSource = ref<string>('');
  const newEdgeTarget = ref<string>('');
  const newEdgeSign = ref<1 | -1>(1);
  
  let edgeIdCounter = 1;
  
  // 添加节点
  function addNode() {
    const label = newNodeLabel.value.trim();
    if (!label) return;
  
    const id = label; // 简单起见：id 直接用名称
    if (customGraph.value.nodes.some((n) => n.id === id)) {
      // 已存在同名节点，就不再添加
      return;
    }
  
    customGraph.value.nodes.push({ id, label });
    newNodeLabel.value = '';
  }
  
  // 添加边
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
      return demoGraphs[selectedDemoKey.value];
    }
    return customGraph.value;
  });
  
  // ---------- ECharts 初始化与更新 ----------
  
  const chartDom = ref<HTMLDivElement | null>(null);
  let chart: echarts.ECharts | null = null;
  
  // 构建“球面符号网络”的 3D 配置（点 + 线）
  function buildSphereGraphOption(graph: GraphData): EChartsGLOption {
    if (!graph.nodes.length) {
      return { series: [] };
    }
  
    const radius = 10;
    const coords = computeSphereLayout(graph.nodes, radius);

    // 取出示例网络可能带的 clusters
    const clusters = graph.clusters || {};
    
    // 节点数据：按簇选颜色，写在每个点的 itemStyle 里
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
        itemStyle: {
          color,
        },
      };
    });
  
    // 每条边一条 3D 线段（line3D）
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
          color: isPositive ? '#00aa00' : '#dd0000', // 正边绿，负边红
          opacity: 0.9,
        },
      };
    });
  
    const option: EChartsGLOption = {
      tooltip: {
        axisPointer:{
          show: false,
        },
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
        axisLine: {
          lineStyle: {
            color: 'rgba(0,0,0,0)', // 轴线透明
            opacity: 0,
          },
        },
        axisTick: {
          lineStyle: {
            color: 'rgba(0,0,0,0)', // 刻度透明
            opacity: 0,
          },
        },
        axisLabel: {
          show: true,                // 不关掉，防止 echarts-gl 报错
          textStyle: {
            color: 'rgba(0,0,0,0)',  // 文本透明
            opacity: 0,
          },
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(0,0,0,0)',  // 网格线透明
            opacity: 0,
          },
        },
        axisPointer: {
          show: false,               // 再保险，单轴也关掉 pointer
        },
      },
      yAxis3D: {
        type: 'value',
        min: -radius * 1.2,
        max: radius * 1.2,
        axisLine: {
          lineStyle: {
            color: 'rgba(0,0,0,0)', // 轴线透明
            opacity: 0,
          },
        },
        axisTick: {
          lineStyle: {
            color: 'rgba(0,0,0,0)', // 刻度透明
            opacity: 0,
          },
        },
        axisLabel: {
          show: true,                // 不关掉，防止 echarts-gl 报错
          textStyle: {
            color: 'rgba(0,0,0,0)',  // 文本透明
            opacity: 0,
          },
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(0,0,0,0)',  // 网格线透明
            opacity: 0,
          },
        },
        axisPointer: {
          show: false,               // 再保险，单轴也关掉 pointer
        },
      },
      zAxis3D: {
        type: 'value',
        min: -radius * 1.2,
        max: radius * 1.2,
        axisLine: {
          lineStyle: {
            color: 'rgba(0,0,0,0)', // 轴线透明
            opacity: 0,
          },
        },
        axisTick: {
          lineStyle: {
            color: 'rgba(0,0,0,0)', // 刻度透明
            opacity: 0,
          },
        },
        axisLabel: {
          show: true,                // 不关掉，防止 echarts-gl 报错
          textStyle: {
            color: 'rgba(0,0,0,0)',  // 文本透明
            opacity: 0,
          },
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(0,0,0,0)',  // 网格线透明
            opacity: 0,
          },
        },
        axisPointer: {
          show: false,               // 再保险，单轴也关掉 pointer
        },
      },
      /*
      xAxis3D: { type: 'value', min: -radius * 1.2, max: radius * 1.2 },
      yAxis3D: { type: 'value', min: -radius * 1.2, max: radius * 1.2 },
      zAxis3D: { type: 'value', min: -radius * 1.2, max: radius * 1.2 },
      */
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
  
      globe: {
        show: false,
      },
  
      series: [
        // 节点
        {
          type: 'scatter3D',
          coordinateSystem: 'cartesian3D',
          symbolSize: 10,
          data: nodeData,
          itemStyle: {
            //color: '#ffffff',//节点颜色
            opacity: 1,
          },
          label: {
            show: true,
            formatter: '{b}',
            distance: 2,
          },
        },
        // 边：每条边一条 line3D
        ...edgeSeries,
      ],
    };
  
    return option;
  }
  
  function initChart() {
    if (!chartDom.value) return;
  
    chart = echarts.init(chartDom.value);
    const option = buildSphereGraphOption(currentGraph.value);
    chart.setOption(option as any);
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
        return;
      }
      if (chart) {
        const option = buildSphereGraphOption(newVal);
        chart.setOption(option as any, true);
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
