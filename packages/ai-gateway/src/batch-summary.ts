// 批次摘要自动生成

import { LLMClient } from './llm-client';
import { BatchSummaryContext } from './types';

const SUMMARY_SYSTEM = `你是BIOCore发酵批次报告AI助手, 运行在用户的本地电脑上。
根据提供的批次数据生成200-500字的结构化中文摘要。

摘要结构:
1. 批次概况 (菌株/配方/运行时长/结果)
2. 关键工艺参数统计 (温度/pH/DO的均值/最大偏差)
3. 重要事件时间线 (Phase切换/报警/Hold)
4. AI观察与建议 (异常趋势/与历史批次的差异/优化建议)

注意: 只基于提供的数据撰写, 不编造不存在的数据。`;

export class BatchSummaryGenerator {
  private llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  async generate(context: BatchSummaryContext): Promise<string> {
    const prompt = this.buildPrompt(context);
    return this.llm.chat(
      [
        { role: 'system', content: SUMMARY_SYSTEM },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.5, maxTokens: 1500 }
    );
  }

  private buildPrompt(ctx: BatchSummaryContext): string {
    return `请为以下批次生成摘要报告:

批次信息:
- 批次ID: ${ctx.batch_id}
- 配方: ${ctx.recipe_name} v${ctx.recipe_version}
- 菌株: ${ctx.organism || '未记录'}
- 操作员: ${ctx.operator}
- 运行时间: ${ctx.started_at} ~ ${ctx.ended_at}
- 总时长: ${ctx.duration_hours.toFixed(1)} 小时
- 结果: ${ctx.outcome}

关键参数统计:
- 温度: 均值 ${ctx.stats.temp_mean.toFixed(1)}°C, 最大偏差 ${ctx.stats.temp_max_dev.toFixed(2)}°C
- pH: 均值 ${ctx.stats.pH_mean.toFixed(2)}, 最大偏差 ${ctx.stats.pH_max_dev.toFixed(3)}
- DO: 均值 ${ctx.stats.DO_mean.toFixed(1)}%, 最低 ${ctx.stats.DO_min.toFixed(1)}%
- 最高搅拌转速: ${ctx.stats.rpm_max} rpm
- 累积补料量: ${ctx.stats.total_feed_mL.toFixed(1)} mL
- 累积补碱量: ${ctx.stats.total_base_mL.toFixed(1)} mL

事件日志 (共${ctx.events.length}条):
${ctx.events.map(e => `  [${e.time}] ${e.event}`).join('\n')}

报警记录 (共${ctx.alarms.length}条):
${ctx.alarms.map(a => `  [${a.time}] ${a.severity}: ${a.message}`).join('\n')}`;
  }
}
