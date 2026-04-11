# PGSBC 符号网络隐私计算可视化系统

面向本科毕业设计的研究原型系统，目标是将 Ma 等人在 2020 年提出的 PGSBC 流程做成“可运行 + 可解释 + 可演示”的双服务器可视化平台。

- 论文：*Privacy-Preserving Global Structural Balance Computation in Signed Networks*
- 关键词：Signed Network、结构平衡、隐私保护、双服务器、同态加密、流程回放

---

## 1. 当前能力（截至 2026-04-03）

### 1.1 可视化前端

- 3D 符号网络展示（正边/负边）
- 示例网络 + 自定义建图（用于提交后端任务）
- 前端页面改为后端驱动：核心状态以后端 `task/state/timeline` 为准
- PGSBC 流程看板：Step1-Step8 轨道、状态变量卡片、每步动画提示
- Step 回放控制：播放/暂停/上一步/下一步/退出（基于后端 timeline）
- `h_t` 趋势曲线与 `c_t` 决策展示（实时同步后端）
- 迭代证据面板：最近轮次 + 最近 timeline 事件
- 一键导出 JSON/CSV 实验数据

### 1.2 后端双服务器

- `server1`：任务编排、状态机、时间线、密文聚合
- `server2`：Paillier 密钥生成、解密、`c_t` 决策
- 已打通端到端接口链路：`/tasks -> /iterate -> /state -> /timeline`

### 1.3 云部署

- 支持双机部署（`app-server` + `crypto-server`）
- `server1`、`server2`、`nginx` 可通过 systemd 托管
- 具体部署记录见 [serverconf.txt](./serverconf.txt)

---

## 2. 论文流程映射（Step1-Step8）

| 论文步骤 | 当前实现 |
|---|---|
| Step1 初始化/R() | 已实现（匿名图生成 `A^m`） |
| Step2 候选聚类 `S_t` | 已实现（简化版邻域贪心） |
| Step3 `H_t` 判断 + `F()` 扰动 | 已实现 |
| Step4 `E()` 加密上传 | 已实现（Paillier） |
| Step5 密文聚合 | 已实现 |
| Step6 解密得到 `h_t` | 已实现 |
| Step7 比较得到 `c_t` | 已实现 |
| Step8 终止条件 | 已实现（`max_iter`） |

说明：优化器目前是可运行简化版，尚未完整实现论文中的 HM-Louvain 两阶段细节。

---

## 3. 核心参数与符号

- `max_iter`：最大迭代轮数 `t_max`
- `rb`：R() 匿名化伪边比例
- `A`：原始图
- `A^m`：匿名化后图
- `S_t`：第 `t` 轮候选聚类
- `H_t`：真实状态统计
- `Ĥ_t`：扰动后状态统计
- `h_t`：解密后的全局目标值（越小越好）
- `c_t`：更新决策（`1` 接受，`0` 拒绝）

---

## 4. 快速开始（本地）

## 4.1 前端

```bash
npm install
npm run dev
```

默认开发地址：`http://127.0.0.1:5173`

## 4.2 后端（双服务）

```bash
cd backend
python -m venv .venv
# Windows
.\.venv\Scripts\activate
# Linux/macOS
# source .venv/bin/activate

pip install -r requirements.txt
```

终端 A（server2）：

```bash
cd backend
# Windows: .\.venv\Scripts\activate
python -m server2.app
```

终端 B（server1）：

```bash
cd backend
# Windows: .\.venv\Scripts\activate
set SERVER2_URL=http://127.0.0.1:5002
# Linux/macOS: export SERVER2_URL=http://127.0.0.1:5002
python -m server1.app
```

健康检查：

- `GET http://127.0.0.1:5001/api/v1/health`
- `GET http://127.0.0.1:5002/api/v1/crypto/health`

## 4.3 实验数据导出（新增）

- 在前端 `PGSBC 任务（双服务器）` 区域创建任务并至少迭代 1 轮后，可点击：
- `导出 JSON`：包含 `summary + rows` 的完整结构化实验记录。
- `导出 CSV`：每轮指标平铺表格，便于论文作图和统计。

每轮导出字段包括：

- `round`、`h_t`、`c_t`、`accepted_h`
- `candidate_h_real`、`current_h_real`
- `real_unbalanced`、`disturbed_unbalanced`
- `node_count`、`real_edge_count`、`anon_edge_count`
- `iter_ms`、`ts`

后端接口：

- `GET /api/v1/tasks/<task_id>/export`

---

## 5. 构建与发布

```bash
npm run build
npm run preview
```

前端构建产物在 `dist/`。

双机部署命令、Nginx 配置、systemd 配置见 [serverconf.txt](./serverconf.txt)。

---

## 6. 关键代码位置

### 6.1 前端流程与回放

- 页面主视图：[src/views/SymbolNetworkView.vue](./src/views/SymbolNetworkView.vue)
- 样式：[src/views/SymbolNetworkView.css](./src/views/SymbolNetworkView.css)
- PGSBC 任务状态管理：[src/composables/usePgsbcTask.ts](./src/composables/usePgsbcTask.ts)

### 6.2 后端核心

- `server1` 主流程：[backend/server1/app.py](./backend/server1/app.py)
- `server2` 密码服务：[backend/server2/app.py](./backend/server2/app.py)
- 共享协议与加密序列化：[backend/shared_contract](./backend/shared_contract)

---

## 7. 项目结构

```text
paper-visualization/
├─ src/
│  ├─ views/                  主页面与流程可视化
│  ├─ composables/            前端状态与管线逻辑
│  ├─ utils/                  图统计、扰动、布局等算法工具
│  ├─ data/networks/          示例网络
│  └─ types/                  类型定义
├─ backend/
│  ├─ server1/                任务编排与聚合
│  ├─ server2/                解密与决策
│  ├─ shared_contract/        协议与加密助手
│  └─ requirements.txt
├─ serverconf.txt             云部署与运维记录
└─ README.md
```

---

## 8. 已知不足与下一步

- HM-Louvain 仍为简化实现，需继续向论文完整算法靠拢
- Step 可视化以状态联动为主，仍可增加更强的场景动画
- 实验导出与批量评估（CSV/JSON）尚未完整补齐
- 论文结果图表与对比实验需要系统化产出

---

## 9. 许可与用途

本仓库用于毕业设计研究与演示原型，不作为生产系统安全方案。
