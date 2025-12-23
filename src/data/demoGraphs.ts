import type { GraphData } from '../types/symbolNetwork';
import type { StoredNetwork } from './networks/_types';

// 只扫描 networks 目录下的 .ts 文件（排除 _types.ts）
const modules = import.meta.glob('./networks/*.ts', { eager: true });

function isStoredNetwork(x: any): x is StoredNetwork {
  return !!x && typeof x === 'object'
    && typeof x.id === 'string'
    && typeof x.title === 'string'
    && !!x.graph
    && Array.isArray(x.graph.nodes)
    && Array.isArray(x.graph.edges);
}

// 取出 default export，并过滤掉不是网络定义的文件（例如 _types.ts）
const networkList: StoredNetwork[] = Object.values(modules)
  .map((m: any) => m?.default)
  .filter(isStoredNetwork);

// 你可以在这里控制排序：
// A) 按 title 排序：更友好
networkList.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));

// B) 或者你想固定顺序：用数组写死（推荐用于演示）
// const order = ['CORP_CROSS_DEPT','SUPPLY_CHAIN','COMMUNITY_NEIGHBOR','CAMPUS_CLUBS','ONLINE_OPINION'];
// networkList.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));

export const demoGraphs: Record<string, GraphData> = Object.fromEntries(
  networkList.map((n) => [n.id, n.graph])
);

export const demoGraphMeta: Record<string, { title: string; desc?: string }> = Object.fromEntries(
  networkList.map((n) => [n.id, { title: n.title, desc: n.desc }])
);

export const demoKeys: string[] = networkList.map((n) => n.id);
