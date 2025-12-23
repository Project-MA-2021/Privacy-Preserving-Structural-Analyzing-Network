import type { GraphData } from '../../types/symbolNetwork';

export type StoredNetwork = {
  id: string;            // 作为内部 key（用于切换）
  title: string;         // 作为左侧展示名（你想显示啥都行）
  desc?: string;         // 可选：描述
  graph: GraphData;      // 网络数据
};
