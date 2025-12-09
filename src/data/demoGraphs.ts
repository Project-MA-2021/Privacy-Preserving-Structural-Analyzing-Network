// src/data/demoGraphs.ts
import type { GraphData } from '../types/symbolNetwork'

// 示例网络 key
export type DemoGraphKey = 'GGS' | 'ISN'

export const demoGraphs: Record<DemoGraphKey, GraphData> = {
  GGS: {
    nodes: [
      { id: 'A', label: 'A' },
      { id: 'B', label: 'B' },
      { id: 'C', label: 'C' },
      { id: 'D', label: 'D' },
      { id: 'E', label: 'E' },
      { id: 'F', label: 'F' },
      { id: 'G', label: 'G' },
      { id: 'H', label: 'H' },
      { id: 'I', label: 'I' },
      { id: 'J', label: 'J' },
    ],
    edges: [
      // —— 团块 1：A~E 内部关系（以正边为主） ——
      { id: 'e1',  source: 'A', target: 'B', sign:  1 },
      { id: 'e2',  source: 'A', target: 'C', sign:  1 },
      { id: 'e3',  source: 'B', target: 'C', sign:  1 },
      { id: 'e4',  source: 'B', target: 'D', sign:  1 },
      { id: 'e5',  source: 'C', target: 'D', sign: -1 }, // 同团内部的一个敌对关系
      { id: 'e6',  source: 'C', target: 'E', sign:  1 },
      { id: 'e7',  source: 'D', target: 'E', sign:  1 },

      // —— 团块 2：F~J 内部关系 ——
      { id: 'e8',  source: 'F', target: 'G', sign:  1 },
      { id: 'e9',  source: 'F', target: 'H', sign:  1 },
      { id: 'e10', source: 'G', target: 'H', sign:  1 },
      { id: 'e11', source: 'G', target: 'I', sign:  1 },
      { id: 'e12', source: 'H', target: 'I', sign: -1 }, // 团块 2 内部的一条负边
      { id: 'e13', source: 'H', target: 'J', sign:  1 },
      { id: 'e14', source: 'I', target: 'J', sign:  1 },

      // —— 两个团之间的关系：以负边为主，模拟“阵营对立” ——
      { id: 'e15', source: 'A', target: 'F', sign: -1 },
      { id: 'e16', source: 'A', target: 'G', sign: -1 },
      { id: 'e17', source: 'B', target: 'F', sign: -1 },
      { id: 'e18', source: 'C', target: 'H', sign: -1 },
      { id: 'e19', source: 'D', target: 'I', sign: -1 },
      { id: 'e20', source: 'E', target: 'J', sign: -1 },

      // 少量跨团正边，模拟“桥梁人物”
      { id: 'e21', source: 'B', target: 'H', sign:  1 },
      { id: 'e22', source: 'E', target: 'F', sign:  1 },
    ],
     // 手工标一个“簇结果”：0 号簇 = A~E，1 号簇 = F~J
     clusters: {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
      F: 1,
      G: 1,
      H: 1,
      I: 1,
      J: 1,
    },
  },

  ISN: {
    nodes: [
      { id: 'S', label: 'S' }, // 核心
      { id: 'X', label: 'X' },
      { id: 'Y', label: 'Y' },
      { id: 'Z', label: 'Z' },
      { id: 'M', label: 'M' },
      { id: 'N', label: 'N' },
      { id: 'O', label: 'O' },
      { id: 'P', label: 'P' },
    ],
    edges: [
      // 核心 S 与外围：有支持也有反对（正负混合）
      { id: 'e1', source: 'S', target: 'X', sign: 1 },
      { id: 'e2', source: 'S', target: 'Y', sign: 1 },
      { id: 'e3', source: 'S', target: 'Z', sign: -1 },
      { id: 'e4', source: 'S', target: 'M', sign: 1 },
      { id: 'e5', source: 'S', target: 'N', sign: -1 },
      { id: 'e6', source: 'S', target: 'O', sign: -1 },
      { id: 'e7', source: 'S', target: 'P', sign: 1 },

      // X,Y,Z 这一团：内部既有联盟又有冲突
      { id: 'e8',  source: 'X', target: 'Y', sign: 1 },
      { id: 'e9',  source: 'X', target: 'Z', sign: -1 },
      { id: 'e10', source: 'Y', target: 'Z', sign: -1 },

      // M,N,O,P 这一团：可以理解为另一种立场
      { id: 'e11', source: 'M', target: 'N', sign: -1 },
      { id: 'e12', source: 'M', target: 'O', sign: 1 },
      { id: 'e13', source: 'N', target: 'O', sign: -1 },
      { id: 'e14', source: 'M', target: 'P', sign: 1 },
      { id: 'e15', source: 'N', target: 'P', sign: -1 },
      { id: 'e16', source: 'O', target: 'P', sign: 1 },

      // 两团之间再连几条边，加点“跨团互动”
      { id: 'e17', source: 'X', target: 'M', sign: 1 },
      { id: 'e18', source: 'Z', target: 'N', sign: -1 },
      { id: 'e19', source: 'Y', target: 'O', sign: 1 },
    ],
  },
}
