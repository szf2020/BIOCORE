// 自然语言 → InfluxDB Flux 查询转换

import { LLMClient } from './llm-client';

const NL_TO_FLUX_SYSTEM = `你是BIOCore发酵数据库查询助手。将用户的自然语言描述转换为InfluxDB Flux查询语句。

数据库Schema:
- Bucket: "fermentation"
- Measurement: "process_data"
- Tags: batch_id, reactor_id
- Fields: temperature, jacket_temp, pH, DO, pressure, airflow, weight, rpm, vfd_current,
         steam_cv, cool_cv, air_cv, P01_rate, P02_rate, P03_rate, P04_rate, temp_mode
- 采样频率: 每分钟1条
- Measurement: "calculated_params" — Fields: OUR, kLa, mu, Vs, V_feed, V_base, V_acid, O2_total, V_liquid, F0
- Measurement: "soft_sensor" — Fields: OD_estimated, glucose_estimated

规则:
1. 只输出Flux查询代码, 不要任何解释
2. 时间范围默认最近30天, 除非用户指定
3. 批次ID格式: BATCH-YYYYMMDD-NNN
4. 涉及聚合使用 max()/min()/mean()
5. 多批次对比使用 group(columns: ["batch_id"])`;

export class NLToFlux {
  private llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  async convert(naturalLanguage: string): Promise<{ flux: string; error?: string }> {
    try {
      const result = await this.llm.chat(
        [
          { role: 'system', content: NL_TO_FLUX_SYSTEM },
          { role: 'user', content: naturalLanguage },
        ],
        { temperature: 0.1, maxTokens: 500 }
      );

      // 提取Flux查询 (去除可能的markdown代码块标记)
      const flux = result.replace(/```flux\n?/g, '').replace(/```\n?/g, '').trim();
      return { flux };
    } catch (err) {
      return { flux: '', error: (err as Error).message };
    }
  }
}
