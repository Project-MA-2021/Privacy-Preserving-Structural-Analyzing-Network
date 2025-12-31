import type { StoredNetwork } from './_types';

const CAMPUS_CLUBS: StoredNetwork = {
  id: 'CAMPUS_CLUBS',
  title: '校园社团（联盟与对立）',
  desc: '社团阵营 + 资源竞争，适合展示正负边结构',
  graph: {
    nodes: [
      { id: 'A1', label: '学术社A' },
      { id: 'A2', label: '学术社B' },
      { id: 'A3', label: '学术社C' },
      { id: 'S1', label: '学生会' },
      { id: 'M1', label: '媒体部' },
      { id: 'T1', label: '技术组' },

      { id: 'P1', label: '文艺社' },
      { id: 'P2', label: '摄影社' },
      { id: 'P3', label: '舞蹈社' },
      { id: 'SP', label: '体育社' },
      { id: 'VOL', label: '志愿队' },
      { id: 'PR', label: '外联组' },
    ],
    edges: [
      // 团块0：学术/技术/学生会（合作）
      { id: 'e1', source: 'A1', target: 'A2', sign: 1 },
      { id: 'e2', source: 'A2', target: 'A3', sign: 1 },
      { id: 'e3', source: 'A1', target: 'T1', sign: 1 },
      { id: 'e4', source: 'S1', target: 'M1', sign: 1 },
      { id: 'e5', source: 'S1', target: 'T1', sign: 1 },
      { id: 'e6', source: 'M1', target: 'A3', sign: 1 },

      // 团块1：文艺/体育/志愿/外联（合作）
      { id: 'e7', source: 'P1', target: 'P2', sign: 1 },
      { id: 'e8', source: 'P2', target: 'P3', sign: 1 },
      { id: 'e9', source: 'SP', target: 'VOL', sign: 1 },
      { id: 'e10', source: 'PR', target: 'P1', sign: 1 },
      { id: 'e11', source: 'PR', target: 'VOL', sign: 1 },

      // 跨团块：场地/经费竞争（负边）
      { id: 'e12', source: 'A1', target: 'P3', sign: -1 },
      { id: 'e13', source: 'A2', target: 'SP', sign: -1 },
      { id: 'e14', source: 'T1', target: 'P2', sign: -1 },
      { id: 'e15', source: 'M1', target: 'PR', sign: -1 },
      { id: 'e16', source: 'S1', target: 'P1', sign: -1 },

      // 跨团块正边：联合活动
      { id: 'e17', source: 'VOL', target: 'S1', sign: 1 },
      { id: 'e18', source: 'P2', target: 'M1', sign: 1 },
      { id: 'e19', source: 'PR', target: 'S1', sign: 1 },
      { id: 'e20', source: 'SP', target: 'M1', sign: 1 },

      // 结构更丰富
      { id: 'e21', source: 'A3', target: 'PR', sign: -1 },
      { id: 'e22', source: 'P1', target: 'VOL', sign: 1 },
    ],
    /*
    clusters: {
      A1: 0, A2: 0, A3: 0, S1: 0, M1: 0, T1: 0,
      P1: 1, P2: 1, P3: 1, SP: 1, VOL: 1, PR: 1,
    },
    */
  },
};

export default CAMPUS_CLUBS;
