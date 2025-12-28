import type { StoredNetwork } from './_types';

const CORP_CROSS_DEPT: StoredNetwork = {
  id: 'CORP_CROSS_DEPT',
  title: '跨部门协作（公司项目网络）',
  desc: '研发/产品/销售 两个阵营协作与冲突',
  graph: {
    nodes: [
      { id: 'RD1', label: 'RD1' },
      { id: 'RD2', label: 'RD2' },
      { id: 'RD3', label: 'RD3' },
      { id: 'PM1', label: 'PM1' },
      { id: 'PM2', label: 'PM2' },
      { id: 'QA', label: 'QA' },

      { id: 'SA1', label: 'SA1' },
      { id: 'SA2', label: 'SA2' },
      { id: 'MK1', label: 'MK1' },
      { id: 'MK2', label: 'MK2' },
      { id: 'OPS', label: 'OPS' },
      { id: 'FIN', label: 'FIN' },
    ],
    edges: [
      // 团块0：研发/产品/测试（正边密集）
      { id: 'e1', source: 'RD1', target: 'RD2', sign: 1 },
      { id: 'e2', source: 'RD2', target: 'RD3', sign: 1 },
      { id: 'e3', source: 'RD1', target: 'RD3', sign: 1 },
      { id: 'e4', source: 'RD1', target: 'PM1', sign: 1 },
      { id: 'e5', source: 'RD2', target: 'PM2', sign: 1 },
      { id: 'e6', source: 'PM1', target: 'PM2', sign: 1 },
      { id: 'e7', source: 'QA', target: 'RD3', sign: 1 },
      { id: 'e8', source: 'QA', target: 'PM1', sign: 1 },

      // 团块1：销售/市场/运营/财务（正边）
      { id: 'e9', source: 'SA1', target: 'SA2', sign: 1 },
      { id: 'e10', source: 'MK1', target: 'MK2', sign: 1 },
      { id: 'e11', source: 'SA1', target: 'MK1', sign: 1 },
      { id: 'e12', source: 'SA2', target: 'MK2', sign: 1 },
      { id: 'e13', source: 'OPS', target: 'MK1', sign: 1 },
      { id: 'e14', source: 'FIN', target: 'OPS', sign: 1 },
      { id: 'e15', source: 'FIN', target: 'SA1', sign: 1 },

      // 跨团块：需求/资源冲突（负边为主）
      { id: 'e16', source: 'RD1', target: 'SA1', sign: -1 },
      { id: 'e17', source: 'RD2', target: 'MK1', sign: -1 },
      { id: 'e18', source: 'RD3', target: 'OPS', sign: -1 },
      { id: 'e19', source: 'PM2', target: 'FIN', sign: -1 },
      { id: 'e20', source: 'QA', target: 'SA2', sign: -1 },

      // 少量跨团块正边（实际协作）
      { id: 'e21', source: 'PM1', target: 'MK2', sign: 1 },
      { id: 'e22', source: 'OPS', target: 'PM2', sign: 1 },
    ],
    /*
    clusters: {
      RD1: 0, RD2: 0, RD3: 0, PM1: 0, PM2: 0, QA: 0,
      SA1: 1, SA2: 1, MK1: 1, MK2: 1, OPS: 1, FIN: 1,
    },
    */
  },
};

export default CORP_CROSS_DEPT;
