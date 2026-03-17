# 符号网络三维可视化系统

一个基于 Vue 3 + TypeScript + Vite 的前端项目，用于展示和分析带有正负关系的符号网络（Signed Network）。项目围绕“结构平衡”这一主题，提供了示例网络浏览、自定义建图、隐私扰动、结构对比、聚类展示和失衡三元组浏览等功能，作为毕业设计、论文原型系统的可视化部分。

## 项目特点

- 使用 `ECharts + ECharts-GL` 在三维空间中展示网络节点与边
- 支持正边 / 负边的符号网络表达
- 内置多组示例网络，覆盖社区、校园、企业、供应链、线上舆论等场景
- 支持手动添加节点和边，快速构造自定义网络
- 支持隐私模式，通过扰动原始网络生成匿名化后的展示结果
- 支持结构对比视图，区分原有边、缺失边和新增边
- 支持全局统计卡片，计算三角结构中的平衡率
- 支持失衡三元组（unbalanced triad）浏览与自动轮播高亮
- 支持将全部示例网络聚合为一张总图后再进行分析
- 内置基于节点签名特征的 `K-means` 聚类流程

## 适用场景

- 符号网络与结构平衡理论的可视化演示
- 社会关系、组织协作、冲突网络的教学展示
- 隐私保护下的网络发布效果对比
- 毕业设计、论文答辩中的交互式原型

## 功能概览

### 1. 示例网络浏览

系统会自动读取 [`src/data/networks`](./src/data/networks) 下的示例数据，并在左侧面板中展示可切换的网络列表。

当前内置示例包括：

- 社区邻里（物业 / 业委会 / 住户）
- 校园社团（联盟与对立）
- 跨部门协作（公司项目网络）
- 供应链关系（上下游合作 / 冲突）
- 线上舆论（观点阵营对抗）

### 2. 自定义网络构建

除了示例网络外，系统还支持在界面中直接：

- 添加节点
- 选择起点与终点添加边
- 指定边的符号为正边 `1` 或负边 `-1`

这部分适合快速搭建小规模实验图，用于演示平衡结构和关系冲突。

### 3. 隐私模式

在示例网络模式下可以启用隐私模式。系统会对原图执行扰动操作，模拟隐私保护后的网络发布结果，当前实现包括：

- 删除部分边
- 翻转部分边的符号
- 对部分边进行重新连线
- 额外添加若干随机边

这样可以在不直接暴露原始结构的前提下继续进行可视化展示与分析。

### 4. 结构对比视图

隐私模式下可进入结构对比视图，对比原始图与扰动图之间的差异。系统会区分三类边：

- `real`：原图和扰动图中都存在
- `missing`：原图存在但扰动图中消失
- `spurious`：扰动图新增、原图中不存在

这部分适合展示隐私扰动对网络结构造成的影响。

### 5. 聚类与总图模式

项目会根据节点在正负关系中的特征构造固定维度的特征向量，并执行 `K-means` 聚类。聚类结果会映射回节点，用于三维视图中的分组着色。

此外，系统还支持：

- 将全部示例网络合并为一张总图
- 对总图执行聚类、扰动与再展示

这使项目不仅能看单个案例，也能做整体结构观察。

### 6. 结构平衡统计与 Triad 浏览

项目内置结构平衡统计逻辑，可对闭合三角结构进行分析，输出：

- 节点数
- 边数
- 正边数 / 负边数
- 三角形总数
- 平衡三角形数量
- 失衡三角形数量
- 平衡率

当开启隐私模式且不处于“结构对比 / 聚合展示”子模式时，还可以使用 Triad 浏览器逐个查看失衡三元组，并在图中高亮对应节点与边。

## 技术栈

- `Vue 3`
- `TypeScript`
- `Vite`
- `ECharts`
- `ECharts-GL`
- `Three.js`

## 安装与运行

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境

```bash
npm run dev
```

启动后按终端提示在浏览器中打开本地地址即可。

### 3. 构建生产版本

```bash
npm run build
```

构建产物会输出到 `dist/` 目录。

### 4. 本地预览构建结果

```bash
npm run preview
```

## 目录结构

```text
paper-visualization/
├─ public/                     静态资源
├─ src/
│  ├─ composables/            组合式逻辑，如图渲染、Triad 浏览、示例图处理管线
│  ├─ data/
│  │  ├─ networks/            示例符号网络数据
│  │  └─ demoGraphs.ts        自动读取并汇总示例网络
│  ├─ types/                  图数据类型定义
│  ├─ utils/                  布局、聚类、扰动、统计、对比等算法逻辑
│  ├─ views/
│  │  └─ SymbolNetworkView.vue  主页面
│  ├─ App.vue
│  └─ main.ts
├─ dist/                      构建输出目录
├─ package.json
└─ README.md
```

## 数据格式

项目的核心图结构定义位于 [`src/types/symbolNetwork.ts`](./src/types/symbolNetwork.ts)。

基础格式如下：

```ts
export type Node = {
  id: string;
  label: string;
};

export type Edge = {
  id: string;
  source: string;
  target: string;
  sign: 1 | -1;
};

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
  clusters?: Record<string, number>;
}
```

如果你希望新增一个示例网络，可以在 [`src/data/networks`](./src/data/networks) 下添加新的 `.ts` 文件，推荐导出如下结构：

```ts
import type { StoredNetwork } from './_types';

const DEMO: StoredNetwork = {
  id: 'DEMO',
  title: '示例网络标题',
  desc: '对该网络的简要说明',
  graph: {
    nodes: [
      { id: 'A', label: '节点A' },
      { id: 'B', label: '节点B' },
    ],
    edges: [
      { id: 'e1', source: 'A', target: 'B', sign: 1 },
    ],
  },
};

export default DEMO;
```

系统会通过 [`src/data/demoGraphs.ts`](./src/data/demoGraphs.ts) 自动扫描并加载这些文件。

## 核心实现说明

### 三维布局与渲染

- [`src/composables/useSphereChart.ts`](./src/composables/useSphereChart.ts) 负责图表初始化、更新和销毁
- [`src/utils/buildSphereGraphOption.ts`](./src/utils/buildSphereGraphOption.ts) 负责生成 ECharts-GL 配置
- [`src/utils/sphereLayout.ts`](./src/utils/sphereLayout.ts) 负责将节点分布到球面三维坐标中

### 示例图处理管线

- [`src/composables/useDemoGraphPipeline.ts`](./src/composables/useDemoGraphPipeline.ts) 是项目的核心处理流程
- 主要包含示例图切换、总图聚合、隐私扰动、聚类、结构对比等逻辑

### 结构平衡分析

- [`src/utils/graphStats.ts`](./src/utils/graphStats.ts) 负责全局平衡统计
- [`src/utils/graphTriads.ts`](./src/utils/graphTriads.ts) 负责识别失衡三元组
- [`src/composables/useTriadExplorer.ts`](./src/composables/useTriadExplorer.ts) 负责 Triad 浏览与高亮控制

## 当前项目状态

这是一个前端可运行原型，已经具备完整的交互链路和演示价值，适合继续向以下方向扩展：

- 接入后端或数据库，实现网络数据持久化
- 支持上传 `JSON / CSV` 网络文件
- 增加更多隐私保护策略与参数控制
- 增加截图导出、统计报表导出等功能
- 补充论文配图、系统截图和实验结果说明

## 说明

- 当前项目主要面向可视化演示与方法验证
- 示例数据为人工构造的小规模网络，便于观察聚类、冲突与结构平衡现象
- 后续会用于论文提交，待补充系统截图、实验案例和方法流程图

## TODO

### 论文方法对齐（高优先）

- [ ] 按论文流程补齐 PGSBC Step1-Step8 的完整迭代链路
- [ ] 将当前 `K-means` 主流程替换/补充为 `HM-Louvain` 两阶段贪心优化
- [ ] 增加 `R / F / E / D` 四类隐私机制（至少先做可运行的模拟版）
- [ ] 建立 “个体 - Server1 - Server2” 的协同计算模式（前端仿真或后端接口）

### 过程可视化（高优先）

- [ ] 增加论文流程总览视图（按 Step1-Step8 动态展示）
- [ ] 增加状态面板：`A, A^m, H_t, \hat{H}_t, E(\hat{H}_t), S_t, h_t, c_t`
- [ ] 增加迭代曲线：`h_S` 随轮次变化及接受/拒绝更新标记
- [ ] 增加角色泳道图：个体、Server1、Server2 的消息交互过程

### 实验与评估（中优先）

- [ ] 补齐论文指标：`h_S`、`NMI`、`p_r=(p_e+p_s+p_b)/3`
- [ ] 增加与基线方法对比的实验配置与结果展示页
- [ ] 支持导入真实/标准数据集并保存实验参数与结果

### 工程完善（中优先）

- [ ] 增加关键算法与统计模块的单元测试
- [ ] 增加参数面板与预设方案（便于答辩演示切换）
- [ ] 增加截图导出与实验报告导出（图+表）
