// LLM 上下文构建器 — 实时参数和批次数据格式化

export class ContextBuilder {
  // 静态方法: 简单实时上下文 (用于轻量场景)
  static buildRealtimeContext(pv: Record<string, number>, state: string, phase: string, elapsed_h: number): string {
    const lines = [
      `当前状态: ${state}`,
      `Phase: ${phase}`,
      `已运行: ${elapsed_h.toFixed(1)}小时`,
      '',
      '实时参数:',
    ];
    const labels: Record<string, string> = {
      TEMP_PV: '温度°C', PH_PV: 'pH', DO_PV: 'DO%', PRESSURE_PV: '罐压bar',
      AIRFLOW_PV: '通气NL/min', WEIGHT_PV: '称重kg', RPM: '转速rpm',
    };
    for (const [k, label] of Object.entries(labels)) {
      if (pv[k] !== undefined) lines.push(`  ${label}: ${pv[k].toFixed(2)}`);
    }
    return lines.join('\n');
  }

  // 静态方法: 批次摘要上下文
  static buildBatchContext(metrics: Record<string, number>, events: string[], alarms: string[]): string {
    const lines = ['批次数据摘要:', ''];
    if (Object.keys(metrics).length > 0) {
      lines.push('关键指标:');
      for (const [k, v] of Object.entries(metrics)) lines.push(`  ${k}: ${v}`);
    }
    if (events.length > 0) { lines.push('', '事件:', ...events.map(e => `  - ${e}`)); }
    if (alarms.length > 0) { lines.push('', '报警:', ...alarms.map(a => `  - ${a}`)); }
    return lines.join('\n');
  }

  // 实例方法: 丰富的实时上下文 (含CUSUM警报, 用于AI对话)
  async buildRichRealtimeContext(
    batch: { batch_id: string; organism?: string | null; started_at?: string; current_phase_type?: string; current_phase_index?: number; total_phases?: number; current_state?: string },
    latestPV: Record<string, number>,
    calculatedParams: { OUR: number; kLa: number; mu: number; V_feed: number },
    cusumAlerts: Array<{ channel: string; deviation: number; alarming: boolean }>
  ): Promise<string> {
    return `当前批次信息:
- 批次ID: ${batch.batch_id}
- 菌株: ${batch.organism || '未记录'}
- 已运行时长: ${this.formatDuration(batch.started_at)}
- 当前阶段: ${batch.current_phase_type || '未知'} (Phase ${(batch.current_phase_index || 0) + 1}/${batch.total_phases || '?'})
- 状态: ${batch.current_state || '未知'}

实时参数快照:
- 罐温: ${(latestPV['AI-0'] ?? 0).toFixed(1)}°C
- pH: ${(latestPV['AI-2'] ?? 0).toFixed(2)}
- DO: ${(latestPV['AI-3'] ?? 0).toFixed(1)}%
- 搅拌: ${latestPV.rpm ?? 0} rpm
- 通气量: ${(latestPV['AI-5'] ?? 0).toFixed(1)} NL/MIN
- 罐压: ${(latestPV['AI-4'] ?? 0).toFixed(2)} bar

软件测算值:
- OUR: ${calculatedParams.OUR.toFixed(1)} mmol/L/h
- kLa: ${calculatedParams.kLa.toFixed(0)} 1/h
- μ: ${calculatedParams.mu.toFixed(3)} 1/h
- 累积补料: ${calculatedParams.V_feed.toFixed(1)} mL

CUSUM异常检测:
${cusumAlerts.map(a => `- ${a.channel}: 偏差 ${a.deviation.toFixed(1)}σ ${a.alarming ? '⚠ 已报警' : '正常'}`).join('\n')}`;
  }

  private formatDuration(startedAt?: string): string {
    if (!startedAt) return '未启动';
    const elapsed = Date.now() - new Date(startedAt).getTime();
    const h = Math.floor(elapsed / 3600000);
    const m = Math.floor((elapsed % 3600000) / 60000);
    return `${h}小时${m}分钟`;
  }
}
