import type { StoredNetwork } from './_types';

const ONLINE_OPINION: StoredNetwork = {
  id: 'ONLINE_OPINION',
  title: '线上舆论（观点阵营对抗）',
  desc: '两极化舆论结构：阵营内支持、阵营间攻击',
  graph: {
    nodes: [
      { id: 'U1', label: '用户1' },
      { id: 'U2', label: '用户2' },
      { id: 'U3', label: '用户3' },
      { id: 'U4', label: '用户4' },
      { id: 'U5', label: '用户5' },
      { id: 'KOL1', label: 'KOL-A' },

      { id: 'V1', label: '用户6' },
      { id: 'V2', label: '用户7' },
      { id: 'V3', label: '用户8' },
      { id: 'V4', label: '用户9' },
      { id: 'V5', label: '用户10' },
      { id: 'KOL2', label: 'KOL-B' },
    ],
    edges: [
      // 团块0：同阵营支持（正边）
      { id: 'e1', source: 'KOL1', target: 'U1', sign: 1 },
      { id: 'e2', source: 'KOL1', target: 'U2', sign: 1 },
      { id: 'e3', source: 'U1', target: 'U3', sign: 1 },
      { id: 'e4', source: 'U2', target: 'U4', sign: 1 },
      { id: 'e5', source: 'U3', target: 'U5', sign: 1 },
      { id: 'e6', source: 'U4', target: 'U5', sign: 1 },

      // 团块1：同阵营支持（正边）
      { id: 'e7', source: 'KOL2', target: 'V1', sign: 1 },
      { id: 'e8', source: 'KOL2', target: 'V2', sign: 1 },
      { id: 'e9', source: 'V1', target: 'V3', sign: 1 },
      { id: 'e10', source: 'V2', target: 'V4', sign: 1 },
      { id: 'e11', source: 'V3', target: 'V5', sign: 1 },
      { id: 'e12', source: 'V4', target: 'V5', sign: 1 },

      // 跨团块：攻击/反对（负边）
      { id: 'e13', source: 'U1', target: 'V1', sign: -1 },
      { id: 'e14', source: 'U2', target: 'V3', sign: -1 },
      { id: 'e15', source: 'U3', target: 'V2', sign: -1 },
      { id: 'e16', source: 'U4', target: 'V4', sign: -1 },
      { id: 'e17', source: 'U5', target: 'KOL2', sign: -1 },
      { id: 'e18', source: 'KOL1', target: 'V5', sign: -1 },

      // 少量跨团块
      { id: 'e19', source: 'U3', target: 'V5', sign: 1 },
      { id: 'e20', source: 'V2', target: 'U4', sign: 1 },
      { id: 'e21', source: 'V1', target: 'U1', sign: -1 },
      { id: 'e22', source: 'KOL2', target: 'U2', sign: -1 },
    ],
    /*
    clusters: {
      U1: 0, U2: 0, U3: 0, U4: 0, U5: 0, KOL1: 0,
      V1: 1, V2: 1, V3: 1, V4: 1, V5: 1, KOL2: 1,
    },
    */
  },
};

export default ONLINE_OPINION;
