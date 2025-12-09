// 节点
export type Node = {
  id: string;
  label: string;
};

// 边：sign = 1（正边） / -1（负边）
export type Edge = {
  id: string;
  source: string;
  target: string;
  sign: 1 | -1;
};

// 聚类结果：nodeId -> clusterId
export type ClusterResult = {
  [nodeId: string]: number;
};

export interface GraphData {
  nodes: Node[];
  edges: Edge[];
  clusters?: ClusterResult;
}
