// ============================================================
// sample-overlay.ts -- 离线取样数据 → ECharts scatter 叠加系列
//
// 把离线取样 (OD600, DCW, 葡萄糖等) 转为 ECharts scatter series,
// 叠加到在线趋势图上, 实现 DASware 的 offline sample overlay 功能
// ============================================================

/** 单个分析物的散点配置 */
export interface SampleScatterConfig {
  analyte: string;   // 数据库列名: 'od600', 'glucose_g_L', etc
  label: string;     // 中文显示标签
  color: string;
  symbol: string;    // ECharts symbol: 'circle','diamond','triangle','rect','pin','roundRect'
}

/** 预定义的离线分析物列表 */
export const SAMPLE_ANALYTES: SampleScatterConfig[] = [
  { analyte: 'od600', label: 'OD600', color: '#f59e0b', symbol: 'circle' },
  { analyte: 'dcw_g_L', label: 'DCW', color: '#8b5cf6', symbol: 'diamond' },
  { analyte: 'glucose_g_L', label: '葡萄糖', color: '#3b82f6', symbol: 'triangle' },
  { analyte: 'acetate_g_L', label: '乙酸', color: '#ef4444', symbol: 'rect' },
  { analyte: 'product_titer', label: '产物浓度', color: '#10b981', symbol: 'pin' },
  { analyte: 'cell_viability_pct', label: '活力', color: '#ec4899', symbol: 'roundRect' },
];

/** 分析物单位 (tooltip 使用) */
const ANALYTE_UNITS: Record<string, string> = {
  od600: '',
  dcw_g_L: 'g/L',
  glucose_g_L: 'g/L',
  acetate_g_L: 'g/L',
  product_titer: 'g/L',
  cell_viability_pct: '%',
};

/**
 * 将离线取样记录转为 ECharts scatter series 配置数组
 *
 * @param samples     取样记录数组 (来自 API, 每条包含 sample_time + 各分析物值)
 * @param selectedAnalytes 用户选中的分析物 analyte 名称列表
 * @param useElapsedSec    true = X 轴用经过秒数, false = X 轴用 ISO 时间字符串
 * @param batchStartedAt   批次开始时间 (useElapsedSec=true 时必传)
 * @returns ECharts series 配置对象数组, 直接合并到 option.series
 */
export function buildSampleScatterSeries(
  samples: any[],
  selectedAnalytes: string[],
  useElapsedSec: boolean,
  batchStartedAt?: string,
): any[] {
  if (!samples || samples.length === 0 || selectedAnalytes.length === 0) return [];

  // 批次起始时间戳 (ms), 用于计算经过秒数
  const batchStartMs = batchStartedAt ? new Date(batchStartedAt).getTime() : 0;

  // 查找分析物配置 (支持未注册的自定义分析物)
  const configMap = new Map<string, SampleScatterConfig>();
  for (const cfg of SAMPLE_ANALYTES) {
    configMap.set(cfg.analyte, cfg);
  }

  return selectedAnalytes.map(analyte => {
    const cfg = configMap.get(analyte);
    const label = cfg?.label || analyte;
    const color = cfg?.color || '#94a3b8';
    const symbol = cfg?.symbol || 'circle';
    const unit = ANALYTE_UNITS[analyte] || '';

    // 提取该分析物有效数据点
    const data = samples
      .filter(s => s[analyte] != null && s.sample_time)
      .map(s => {
        const value = Number(s[analyte]);
        if (isNaN(value)) return null;

        let x: number | string;
        if (useElapsedSec) {
          // X = (sample_time - batchStartedAt) 秒数
          const sampleMs = new Date(s.sample_time).getTime();
          x = (sampleMs - batchStartMs) / 1000;
        } else {
          // X = ISO 时间字符串
          x = s.sample_time;
        }

        return { value: [x, value], sampleTime: s.sample_time };
      })
      .filter(Boolean);

    return {
      name: `[取样] ${label}`,
      type: 'scatter' as const,
      symbolSize: 10,
      symbol,
      z: 10, // 在线条系列之上
      data: data.map(d => d!.value),
      itemStyle: { color },
      emphasis: {
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
      },
      tooltip: {
        formatter: (p: any) => {
          const val = Array.isArray(p.value) ? p.value[1] : p.value;
          const xVal = Array.isArray(p.value) ? p.value[0] : '';
          // 从原始数据恢复 sampleTime (通过 index)
          const sampleEntry = data[p.dataIndex];
          const timeStr = sampleEntry?.sampleTime || xVal;
          return `<div style="font-size:11px;color:#9ca3af;margin-bottom:4px">${timeStr}</div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}"></span>
              <span>${label}</span>
              <span style="font-family:monospace;font-weight:600">${typeof val === 'number' ? val.toFixed(3) : val}${unit ? ' ' + unit : ''}</span>
            </div>`;
        },
      },
    };
  });
}
