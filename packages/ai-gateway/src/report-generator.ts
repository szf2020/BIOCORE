// ============================================================
// ReportGenerator — 对话式批次报告生成器
// 职责: 根据批次数据和用户需求, 通过 LLM 生成结构化报告
// ============================================================

import { LLMClient } from './llm-client';
import type { Report, ReportChapter, ReportSection, ReportContext } from './report-types';
import { DEFAULT_CHAPTERS } from './report-types';

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 生成历史批次对比的 SVG 柱状图
function buildComparisonChart(ctx: ReportContext): string {
  if (!ctx.historical || ctx.historical.length === 0 || !ctx.current_kpi) return '';

  const metrics = [
    { key: 'yield_g', label: '产量 (g)', fmt: (v: number) => v.toFixed(1) },
    { key: 'titer_g_L', label: '浓度 (g/L)', fmt: (v: number) => v.toFixed(2) },
    { key: 'oee_pct', label: 'OEE (%)', fmt: (v: number) => (v * 100).toFixed(1), scale: 100 },
    { key: 'cycle_time_h', label: '周期 (h)', fmt: (v: number) => v.toFixed(1) },
  ] as const;

  const allBatches = [
    ...ctx.historical.map((h: any) => ({ id: h.batch_id, data: h, current: false })),
    { id: ctx.batch_id, data: ctx.current_kpi as any, current: true },
  ];

  const W = 720, chartH = 140, rowH = 200, padL = 80, padR = 20, padT = 30;
  const H = metrics.length * rowH + padT;
  const barAreaW = W - padL - padR;

  const rows = metrics.map((m, mi) => {
    const yBase = padT + mi * rowH;
    const values = allBatches.map(b => {
      const raw = (b.data as any)[m.key] || 0;
      return (m as any).scale ? raw * (m as any).scale : raw;
    });
    const maxVal = Math.max(...values, 0.01);
    const barW = Math.max(20, (barAreaW - 10) / allBatches.length - 4);
    const bars = allBatches.map((b, i) => {
      const v = values[i];
      const h = Math.max(2, (v / maxVal) * chartH);
      const x = padL + i * (barW + 4);
      const y = yBase + chartH + 10 - h;
      const color = b.current ? '#dc2626' : '#2563eb';
      const label = b.id.replace('BATCH-', '').slice(-7);
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${color}" opacity="0.85" rx="2"/>
        <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="#333">${m.fmt(v)}</text>
        <text x="${x + barW / 2}" y="${yBase + chartH + 26}" text-anchor="middle" font-size="8" fill="#666" transform="rotate(-45 ${x + barW / 2} ${yBase + chartH + 26})">${label}</text>
      `;
    }).join('');

    return `
      <g>
        <text x="${padL - 8}" y="${yBase + chartH / 2 + 4}" text-anchor="end" font-size="11" font-weight="600" fill="#1a1a1a">${m.label}</text>
        <line x1="${padL}" y1="${yBase + chartH + 10}" x2="${W - padR}" y2="${yBase + chartH + 10}" stroke="#d1d5db" stroke-width="1"/>
        ${bars}
      </g>
    `;
  }).join('');

  return `<div style="margin: 16px 0; text-align: center;">
    <svg width="${W}" height="${H + 40}" viewBox="0 0 ${W} ${H + 40}" xmlns="http://www.w3.org/2000/svg" style="max-width: 100%; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px;">
      <text x="${W / 2}" y="18" text-anchor="middle" font-size="13" font-weight="700" fill="#111">当前批次 vs 历史批次 KPI 对比</text>
      ${rows}
      <g transform="translate(${padL}, ${H + 20})">
        <rect width="14" height="10" fill="#dc2626" opacity="0.85" rx="2"/>
        <text x="20" y="9" font-size="10" fill="#333">当前批次</text>
        <rect x="100" width="14" height="10" fill="#2563eb" opacity="0.85" rx="2"/>
        <text x="120" y="9" font-size="10" fill="#333">历史批次</text>
      </g>
    </svg>
  </div>`;
}

// 各章节的 LLM 系统提示
const CHAPTER_PROMPTS: Record<string, string> = {
  overview: `你是BIOCore发酵批次报告的撰写助手。根据提供的批次元数据, 撰写"批次概况"章节。
内容包括: 批次基本信息(ID/配方/菌株/操作员), 运行总时长, Phase序列概述, 最终结果。
用中文撰写, 200-400字, 结构化分段。不要编造数据。`,

  trends: `你是BIOCore发酵批次报告的撰写助手。根据提供的工艺参数统计数据, 撰写"关键参数趋势分析"章节。
分析维度: 温度控制精度, pH稳定性, DO变化特征, 搅拌策略, 补料曲线。
对每个参数给出均值/极值/偏差评价。如有用户特别关注的参数, 重点展开。
用中文撰写, 300-500字。`,

  anomaly: `你是BIOCore发酵批次报告的撰写助手。根据提供的报警记录和事件日志, 撰写"异常事件分析"章节。
分析每条报警的时间、类型、可能原因和影响。按时间线组织。
如有用户特别关注的异常, 重点分析其根因和处置建议。
用中文撰写, 200-500字。无异常时简要说明"本批次运行平稳"。`,

  comparison: `你是BIOCore发酵批次报告的撰写助手。根据提供的当前批次KPI与历史批次数据, 撰写"历史趋势对比"章节。
分析维度: 产量对比(yield_g), 产物浓度对比(titer_g_L), OEE对比(oee_pct), 周期时间对比(cycle_time_h)。
对每个维度给出当前批次在历史批次中的排名和位置(高于/低于平均值), 趋势变化(近期批次是否在改善), 并用百分比量化差异。
如有明显偏离历史均值的参数, 分析可能原因。
用中文撰写, 300-500字。`,

  recommendations: `你是BIOCore发酵批次报告的撰写助手。综合前面章节的分析, 撰写"AI观察与建议"章节。
包括: 本批次亮点, 发现的问题, 对下一批次的优化建议(参数/操作/设备)。
建议要具体、可操作, 如"建议将接种后DO设定值从30%上调至40%"。
用中文撰写, 200-400字。`,
};

function buildChapterPrompt(chapterId: string, ctx: ReportContext, prevChapters?: string): string {
  const base = `批次信息:
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
- 最高转速: ${ctx.stats.rpm_max} rpm
- 累积补料: ${ctx.stats.total_feed_mL.toFixed(1)} mL
- 累积补碱: ${ctx.stats.total_base_mL.toFixed(1)} mL

Phase序列:
${ctx.phases.map(p => `  ${p.name}: ${p.started_at}${p.duration_min ? ` (${p.duration_min}分钟)` : ''}`).join('\n')}

报警记录 (共${ctx.alarms.length}条):
${ctx.alarms.length > 0 ? ctx.alarms.map(a => `  [${a.time}] ${a.severity}: ${a.message}`).join('\n') : '  无报警'}

事件日志 (共${ctx.events.length}条):
${ctx.events.length > 0 ? ctx.events.slice(0, 20).map(e => `  [${e.time}] ${e.event}`).join('\n') : '  无事件'}`;

  // 历史对比数据
  let comparisonNote = '';
  if (ctx.historical && ctx.historical.length > 0 && ctx.current_kpi) {
    const hist = ctx.historical;
    const avgYield = hist.reduce((s, h) => s + h.yield_g, 0) / hist.length;
    const avgTiter = hist.reduce((s, h) => s + h.titer_g_L, 0) / hist.length;
    const avgOee = hist.reduce((s, h) => s + h.oee_pct, 0) / hist.length;
    const avgCycle = hist.reduce((s, h) => s + h.cycle_time_h, 0) / hist.length;
    comparisonNote = `\n\n历史批次对比数据 (共${hist.length}个历史批次):
当前批次KPI: 产量=${ctx.current_kpi.yield_g.toFixed(1)}g, 浓度=${ctx.current_kpi.titer_g_L.toFixed(3)}g/L, OEE=${(ctx.current_kpi.oee_pct * 100).toFixed(1)}%, 周期=${ctx.current_kpi.cycle_time_h.toFixed(1)}h
历史平均: 产量=${avgYield.toFixed(1)}g, 浓度=${avgTiter.toFixed(3)}g/L, OEE=${(avgOee * 100).toFixed(1)}%, 周期=${avgCycle.toFixed(1)}h
历史各批次明细:
${hist.map(h => `  ${h.batch_id}: 产量=${h.yield_g.toFixed(1)}g, 浓度=${h.titer_g_L.toFixed(3)}g/L, OEE=${(h.oee_pct * 100).toFixed(1)}%, 周期=${h.cycle_time_h.toFixed(1)}h, 结果=${h.outcome}`).join('\n')}`;
  }

  const focusNote = ctx.user_focus ? `\n\n用户特别关注: ${ctx.user_focus}` : '';
  const prevNote = prevChapters ? `\n\n前面章节内容 (供参考):\n${prevChapters}` : '';

  return base + comparisonNote + focusNote + prevNote;
}

export class ReportGenerator {
  private llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  /**
   * 生成完整批次报告
   */
  async generateReport(ctx: ReportContext, userFocus?: string): Promise<Report> {
    const context = { ...ctx, user_focus: userFocus || ctx.user_focus };

    const report: Report = {
      id: makeId(),
      batch_id: ctx.batch_id,
      title: `${ctx.batch_id} 批次分析报告`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      chapters: [],
    };

    // 依次生成各章节 (后面章节引用前面)
    let prevContent = '';
    for (const tmpl of DEFAULT_CHAPTERS) {
      const chapter = await this.generateChapter(tmpl.id, tmpl.title, context, prevContent);
      // 为"历史趋势对比"章节注入 SVG 对比图
      if (tmpl.id === 'comparison' && chapter.sections[0]) {
        chapter.sections[0].chart_svg = buildComparisonChart(context);
      }
      report.chapters.push(chapter);
      prevContent += `\n### ${chapter.title}\n${chapter.sections.map(s => s.content).join('\n')}`;
    }

    return report;
  }

  /**
   * 根据用户指令迭代修改报告
   */
  async refineReport(report: Report, instruction: string, ctx: ReportContext): Promise<Report> {
    const systemPrompt = `你是BIOCore批次报告编辑助手。用户要求修改现有报告。
请根据用户指令, 输出需要新增或修改的章节内容。

输出格式 (严格JSON):
{
  "action": "add_section" | "modify_section" | "add_chapter",
  "chapter_id": "目标章节ID (overview/trends/anomaly/recommendations/new)",
  "chapter_title": "新章节标题 (仅 add_chapter 时需要)",
  "section_title": "章节/小节标题",
  "content": "Markdown内容"
}`;

    const currentReport = report.chapters.map(ch =>
      `## ${ch.title}\n${ch.sections.map(s => `### ${s.title}\n${s.content}`).join('\n')}`
    ).join('\n\n');

    const userPrompt = `当前报告:\n${currentReport}\n\n用户指令: ${instruction}`;

    try {
      const raw = await this.llm.chat(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { temperature: 0.4, maxTokens: 2000 },
      );

      // 解析 JSON (兼容 LLM 可能包裹 ```json ... ```)
      const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const patch = JSON.parse(jsonStr) as {
        action: string;
        chapter_id: string;
        chapter_title?: string;
        section_title: string;
        content: string;
      };

      const updated = structuredClone(report);
      updated.updated_at = new Date().toISOString();

      if (patch.action === 'add_chapter') {
        updated.chapters.push({
          id: patch.chapter_id || makeId(),
          title: patch.chapter_title || patch.section_title,
          sections: [{ id: makeId(), title: patch.section_title, content: patch.content }],
        });
      } else {
        // 找到目标章节
        let chapter = updated.chapters.find(ch => ch.id === patch.chapter_id);
        if (!chapter) {
          // 找不到就加到最合适的位置 (anomaly 或 recommendations 之前)
          chapter = updated.chapters[updated.chapters.length - 1];
        }

        if (patch.action === 'add_section') {
          chapter.sections.push({ id: makeId(), title: patch.section_title, content: patch.content });
        } else {
          // modify: 替换同名 section 或追加
          const idx = chapter.sections.findIndex(s => s.title === patch.section_title);
          if (idx >= 0) {
            chapter.sections[idx].content = patch.content;
          } else {
            chapter.sections.push({ id: makeId(), title: patch.section_title, content: patch.content });
          }
        }
      }

      return updated;
    } catch {
      // JSON 解析失败: 将 LLM 回复作为新章节追加
      const fallbackReport = structuredClone(report);
      fallbackReport.updated_at = new Date().toISOString();
      const lastChapter = fallbackReport.chapters[fallbackReport.chapters.length - 1];
      lastChapter.sections.push({
        id: makeId(),
        title: instruction.slice(0, 20),
        content: `(根据用户要求补充)\n\n${instruction}`,
      });
      return fallbackReport;
    }
  }

  private async generateChapter(
    chapterId: string, title: string, ctx: ReportContext, prevContent: string,
  ): Promise<ReportChapter> {
    const systemPrompt = CHAPTER_PROMPTS[chapterId] || CHAPTER_PROMPTS.overview;
    const userPrompt = buildChapterPrompt(chapterId, ctx, prevContent || undefined);

    const content = await this.llm.chat(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { temperature: 0.5, maxTokens: 1500 },
    );

    return {
      id: chapterId,
      title,
      sections: [{ id: makeId(), title, content }],
    };
  }
}
