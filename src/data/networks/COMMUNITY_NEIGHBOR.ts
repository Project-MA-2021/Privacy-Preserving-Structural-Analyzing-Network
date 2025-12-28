import type { StoredNetwork } from './_types';

const COMMUNITY_NEIGHBOR: StoredNetwork = {
  id: 'COMMUNITY_NEIGHBOR',
  title: '社区邻里（物业/业委会/住户）',
  desc: '住户联盟与物业矛盾，适合展示团块与冲突边',
  graph: {
    nodes: [
      { id: 'R1', label: '住户1' },
      { id: 'R2', label: '住户2' },
      { id: 'R3', label: '住户3' },
      { id: 'R4', label: '住户4' },
      { id: 'R5', label: '住户5' },
      { id: 'R6', label: '住户6' },

      { id: 'PM', label: '物业' },
      { id: 'SEC', label: '保安' },
      { id: 'CLN', label: '保洁' },
      { id: 'COM', label: '业委会' },
      { id: 'WG', label: '微信群' },
      { id: 'ST', label: '商户' },
    ],
    edges: [
      // 团块0：住户/业委会/微信群（联盟）
      { id: 'e1', source: 'R1', target: 'R2', sign: 1 },
      { id: 'e2', source: 'R2', target: 'R3', sign: 1 },
      { id: 'e3', source: 'R3', target: 'R4', sign: 1 },
      { id: 'e4', source: 'R4', target: 'R5', sign: 1 },
      { id: 'e5', source: 'R5', target: 'R6', sign: 1 },
      { id: 'e6', source: 'COM', target: 'WG', sign: 1 },
      { id: 'e7', source: 'COM', target: 'R2', sign: 1 },
      { id: 'e8', source: 'WG', target: 'R4', sign: 1 },

      // 团块1：物业/保安/保洁/商户（内部协作）
      { id: 'e9', source: 'PM', target: 'SEC', sign: 1 },
      { id: 'e10', source: 'PM', target: 'CLN', sign: 1 },
      { id: 'e11', source: 'SEC', target: 'CLN', sign: 1 },
      { id: 'e12', source: 'PM', target: 'ST', sign: 1 },

      // 跨团块：矛盾/投诉（负边）
      { id: 'e13', source: 'R1', target: 'PM', sign: -1 },
      { id: 'e14', source: 'R3', target: 'SEC', sign: -1 },
      { id: 'e15', source: 'R5', target: 'CLN', sign: -1 },
      { id: 'e16', source: 'WG', target: 'PM', sign: -1 },
      { id: 'e17', source: 'COM', target: 'PM', sign: -1 },

      // 少量跨团块正边（现实中并非全对立）
      { id: 'e18', source: 'R2', target: 'ST', sign: 1 },
      { id: 'e19', source: 'R6', target: 'SEC', sign: 1 },
      { id: 'e20', source: 'ST', target: 'R4', sign: 1 },
      { id: 'e21', source: 'CLN', target: 'R1', sign: 1 },

      // 一点内部冲突（让场景更真实）
      { id: 'e22', source: 'R2', target: 'R5', sign: -1 },
    ],
    /*
    clusters: {
      R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, COM: 0, WG: 0,
      PM: 1, SEC: 1, CLN: 1, ST: 1,
    },
    */
  },
};

export default COMMUNITY_NEIGHBOR;
