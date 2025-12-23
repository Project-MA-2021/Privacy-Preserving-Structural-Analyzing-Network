import type { StoredNetwork } from './_types';

const SUPPLY_CHAIN: StoredNetwork = {
  id: 'SUPPLY_CHAIN',
  title: '供应链关系（上下游合作/冲突）',
  desc: '供应商/制造商 vs 渠道/客户 的合作与议价冲突',
  graph: {
    nodes: [
      { id: 'S1', label: '供应S1' },
      { id: 'S2', label: '供应S2' },
      { id: 'S3', label: '供应S3' },
      { id: 'M1', label: '制造M1' },
      { id: 'M2', label: '制造M2' },
      { id: 'QC', label: '质检QC' },

      { id: 'D1', label: '渠道D1' },
      { id: 'D2', label: '渠道D2' },
      { id: 'R1', label: '零售R1' },
      { id: 'R2', label: '零售R2' },
      { id: 'C1', label: '客户C1' },
      { id: 'C2', label: '客户C2' },
    ],
    edges: [
      // 团块0：供应/制造（合作）
      { id: 'e1', source: 'S1', target: 'M1', sign: 1 },
      { id: 'e2', source: 'S2', target: 'M1', sign: 1 },
      { id: 'e3', source: 'S3', target: 'M2', sign: 1 },
      { id: 'e4', source: 'M1', target: 'M2', sign: 1 },
      { id: 'e5', source: 'QC', target: 'M1', sign: 1 },
      { id: 'e6', source: 'QC', target: 'M2', sign: 1 },
      { id: 'e7', source: 'S1', target: 'S2', sign: 1 },

      // 团块1：渠道/零售/客户（合作）
      { id: 'e8', source: 'D1', target: 'D2', sign: 1 },
      { id: 'e9', source: 'D1', target: 'R1', sign: 1 },
      { id: 'e10', source: 'D2', target: 'R2', sign: 1 },
      { id: 'e11', source: 'R1', target: 'C1', sign: 1 },
      { id: 'e12', source: 'R2', target: 'C2', sign: 1 },
      { id: 'e13', source: 'C1', target: 'C2', sign: 1 },

      // 跨团块：议价/替代冲突（负边）
      { id: 'e14', source: 'S2', target: 'D1', sign: -1 },
      { id: 'e15', source: 'M1', target: 'D2', sign: -1 },
      { id: 'e16', source: 'M2', target: 'R2', sign: -1 },
      { id: 'e17', source: 'QC', target: 'D1', sign: -1 },
      { id: 'e18', source: 'S3', target: 'C2', sign: -1 },

      // 少量跨团块正边（正常对接链路）
      { id: 'e19', source: 'M1', target: 'D1', sign: 1 },
      { id: 'e20', source: 'M2', target: 'D2', sign: 1 },
      { id: 'e21', source: 'D2', target: 'R1', sign: 1 },
      { id: 'e22', source: 'R1', target: 'C2', sign: 1 },
    ],
    clusters: {
      S1: 0, S2: 0, S3: 0, M1: 0, M2: 0, QC: 0,
      D1: 1, D2: 1, R1: 1, R2: 1, C1: 1, C2: 1,
    },
  },
};

export default SUPPLY_CHAIN;
