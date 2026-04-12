# 符号网络数据集说明（统一版）

本目录中的数据集已统一为同一命名和同一结构，方便直接上传到前端。

## 1. 统一格式

### 1.1 CSV（推荐直接上传）

```text
source,target,sign
```

- `source`：起点节点 ID
- `target`：终点节点 ID
- `sign`：边符号，取值 `1`（正边）或 `-1`（负边）

说明：
- 上传时可带表头（推荐）。
- 也兼容 `Tab/空格` 分隔的三列文本（例如 `source target sign`）。
- 上传后会立即执行格式校验，并弹窗提示结果（含错误行示例）。

### 1.2 JSON（前端可直接导入）

```json
{
  "graph": {
    "nodes": [{ "id": "1", "label": "1" }],
    "edges": [{ "id": "e1", "source": "1", "target": "2", "sign": 1 }]
  }
}
```

## 2. 数据集清单（统一小规模）

统一命名规则：
- CSV：`signed_small_<dataset>.csv`
- JSON：`signed_small_<dataset>.graph.json`

| 数据集 | 节点 | 边 | 正边 | 负边 | CSV | JSON |
|---|---:|---:|---:|---:|---|---|
| bitcoin-alpha | 120 | 260 | 232 | 28 | `signed_small_bitcoin_alpha.csv` | `signed_small_bitcoin_alpha.graph.json` |
| bitcoin-otc | 120 | 260 | 229 | 31 | `signed_small_bitcoin_otc.csv` | `signed_small_bitcoin_otc.graph.json` |
| epinions | 120 | 260 | 189 | 71 | `signed_small_epinions.csv` | `signed_small_epinions.graph.json` |
| slashdot-081106 | 120 | 260 | 156 | 104 | `signed_small_slashdot_081106.csv` | `signed_small_slashdot_081106.graph.json` |
| slashdot-090216 | 120 | 260 | 162 | 98 | `signed_small_slashdot_090216.csv` | `signed_small_slashdot_090216.graph.json` |
| slashdot-090221 | 120 | 260 | 159 | 101 | `signed_small_slashdot_090221.csv` | `signed_small_slashdot_090221.graph.json` |

详情清单见：`manifest.json`

## 3. 在当前项目中的使用建议

1. 在页面“自定义网络 -> 上传与裁剪”点击上传。  
2. 优先上传上述 `signed_small_*.csv`。  
3. 上传后会立刻看到校验弹窗（成功/失败都会提示）。  
4. 如图较大，勾选“导入时启用裁剪”并设置目标节点/边数量。  

## 4. 数据来源

原始数据来源为 SNAP Signed Networks：  
https://snap.stanford.edu/data/
