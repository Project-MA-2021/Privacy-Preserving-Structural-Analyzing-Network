import type { GraphData } from '../types/symbolNetwork';

export type DemoGraphKey = 'GGS';   // 以后扩展在这里加，例如 'GGS' | 'ISN'

export const demoGraphs: Record<DemoGraphKey, GraphData> = {
  GGS: {
    nodes: [
      { id: 'A', label: 'A' },
      { id: 'B', label: 'B' },
      { id: 'C', label: 'C' },
      { id: 'D', label: 'D' },
    ],
    edges: [
      { id: 'e1', source: 'A', target: 'B', sign: 1 },
      { id: 'e2', source: 'B', target: 'C', sign: -1 },
      { id: 'e3', source: 'C', target: 'D', sign: 1 },
      { id: 'e4', source: 'D', target: 'A', sign: -1 },
    ],
  },
};
