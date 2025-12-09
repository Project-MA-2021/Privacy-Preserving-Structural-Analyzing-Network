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
        <!-- 下一步：在这个 div 里用 ECharts + echarts-gl 画 3D 球体 -->
        <div class="chart-placeholder">
          <p>3D 球体符号网络图将在这里渲染（下一步实现）</p>
          <p>当前网络：节点 {{ currentGraph.nodes.length }} 个，边 {{ currentGraph.edges.length }} 条</p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { GraphData } from '../types/symbolNetwork';
import { demoGraphs, type DemoGraphKey } from '../data/demoGraphs';

type DataSourceType = 'demo' | 'custom';

const dataSource = ref<DataSourceType>('demo');
const selectedDemoKey = ref<DemoGraphKey>('GGS');

const customGraph = ref<GraphData>({
  nodes: [],
  edges: [],
});

// 这里 TS 已经能确定 demoGraphs[selectedDemoKey.value] 一定是 GraphData，不是 undefined
const currentGraph = computed<GraphData>(() => {
  if (dataSource.value === 'demo') {
    return demoGraphs[selectedDemoKey.value];
  }
  return customGraph.value;
});
</script>

<style scoped>.symbol-page {
  display: flex;
  height: 100vh;           /* 整个页面占满视口高度 */
}

/* 左侧：固定占屏幕宽度的 25% */
.symbol-sidebar {
  flex: 5 5 20%;           /* 固定 25% 宽度，不随内容变化 */
  max-width: 20%;
  padding: 12px 16px;
  border-right: 1px solid #eee;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;  /* 内容从上往下排布 */
}

/* 右侧自动占剩余空间 */
.symbol-main {
  flex: 1 1 auto;
  position: relative;
}

.sidebar-title {
  font-size: 16px;
  margin: 0 0 12px;
}

.sidebar-section {
  margin-bottom: 16px;
}

.section-label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}

.radio-group {
  display: flex;
  gap: 12px;
  font-size: 14px;
}

.hint {
  font-size: 12px;
  color: #666;
  margin-top: 6px;
}

.chart-container {
  position: absolute;
  inset: 0;
  padding: 8px;
  box-sizing: border-box;
}

.chart-placeholder {
  width: 100%;
  height: 100%;
  border: 1px dashed #ccc;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 14px;
  color: #999;
  text-align: center;
  padding: 12px;
  box-sizing: border-box;
}

</style>
