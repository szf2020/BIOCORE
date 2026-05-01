// ============================================================
// ai-report-routes.ts — AI 对话式报告生成 API
// POST /ai/report/generate — 生成报告
// POST /ai/report/:sessionId/refine — 迭代修改
// GET  /ai/report/:sessionId — 获取报告 JSON
// GET  /ai/report/:sessionId/html — HTML 预览
// GET  /ai/report/:sessionId/export/pdf — PDF 下载
// GET  /ai/report/:sessionId/export/docx — Word 下载
// ============================================================

import type { Router } from 'express';
import type { SQLiteService } from '../../data-service/src/sqlite-service';
import { ReportGenerator } from '../../ai-gateway/src/report-generator';
import { LLMClient } from '../../ai-gateway/src/llm-client';
import type { Report, ReportContext } from '../../ai-gateway/src/report-types';
import { renderReportHtml } from './report-html-template';
import { buildReportDocx } from './report-docx-builder';

const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'fermentation';

// 报告意图检测 (从聊天消息中识别)
const REPORT_KEYWORDS = ['报告', '报表', 'report', '生成报告', '批次报告', '分析报告', '导出报告'];
const BATCH_ID_PATTERN = /BATCH-\d{8}-\d{3}/i;

export function detectReportIntent(message: string): {
  isReport: boolean; batchId?: string; focus?: string;
} {
  const hasKeyword = REPORT_KEYWORDS.some(k => message.includes(k));
  if (!hasKeyword) return { isReport: false };

  const batchMatch = message.match(BATCH_ID_PATTERN);
  // 提取用户关注点: 关键词后面的描述
  const focusPatterns = [/重点分析(.+)/,  /关注(.+)/, /分析(.+?)的/, /特别是(.+)/];
  let focus: string | undefined;
  for (const p of focusPatterns) {
    const m = message.match(p);
    if (m) { focus = m[1].trim(); break; }
  }

  return { isReport: true, batchId: batchMatch?.[0], focus };
}

// 从 SQLite + InfluxDB 构建报告上下文
async function buildReportContext(
  sqlite: SQLiteService, batchId: string, influxQueryApi: any,
): Promise<ReportContext> {
  const batch = sqlite.getBatch(batchId);
  if (!batch) throw new Error(`批次 ${batchId} 不存在`);

  // Phase 日志
  let phases: ReportContext['phases'] = [];
  try {
    const phaseLogs = sqlite.getDatabase().prepare(
      'SELECT * FROM phase_logs WHERE batch_id = ? ORDER BY started_at'
    ).all(batchId) as any[];
    phases = phaseLogs.map((p: any) => ({
      name: p.phase_type || p.phase_name || 'Unknown',
      started_at: p.started_at,
      ended_at: p.ended_at,
      duration_min: p.duration_min,
    }));
  } catch { /* 表可能不存在 */ }

  // 报警
  let alarms: ReportContext['alarms'] = [];
  try {
    const alarmRows = sqlite.getDatabase().prepare(
      'SELECT * FROM alarms WHERE batch_id = ? ORDER BY created_at'
    ).all(batchId) as any[];
    alarms = alarmRows.map((a: any) => ({
      time: a.created_at,
      severity: a.severity,
      message: a.message,
      code: a.alarm_code,
    }));
  } catch { /* ignore */ }

  // 事件 (状态迁移)
  let events: ReportContext['events'] = [];
  try {
    const transitions = sqlite.getDatabase().prepare(
      'SELECT * FROM state_transitions WHERE batch_id = ? ORDER BY timestamp'
    ).all(batchId) as any[];
    events = transitions.map((t: any) => ({
      time: t.timestamp,
      event: `${t.from_state} → ${t.to_state}${t.reason ? ` (${t.reason})` : ''}`,
    }));
  } catch { /* ignore */ }

  // 默认统计值 (InfluxDB 不可用时)
  const defaultStats = {
    temp_mean: 37.0, temp_max_dev: 0.3,
    pH_mean: 7.0, pH_max_dev: 0.05,
    DO_mean: 35.0, DO_min: 20.0,
    rpm_max: 300, total_feed_mL: 500, total_base_mL: 50,
  };

  // 计算批次时长
  let duration_hours = 0;
  if (batch.started_at && batch.ended_at) {
    duration_hours = (new Date(batch.ended_at).getTime() - new Date(batch.started_at).getTime()) / 3600000;
  }

  // 历史批次 KPI 对比
  let historical: any[] = [];
  let current_kpi: any = undefined;
  try {
    const db = sqlite.getDatabase();
    // 当前批次 KPI
    const curKpi = db.prepare('SELECT yield_g, titer_g_L, oee_pct, cycle_time_h FROM batch_kpis WHERE batch_id = ?').get(batchId) as any;
    if (curKpi) {
      current_kpi = curKpi;
    }
    // 同配方历史批次 KPI (排除当前批次)
    historical = db.prepare(`SELECT k.batch_id, b.outcome, k.cycle_time_h, k.yield_g, k.titer_g_L, k.oee_pct
      FROM batch_kpis k JOIN batches b ON k.batch_id = b.batch_id
      WHERE b.recipe_id = ? AND k.batch_id != ?
      ORDER BY b.started_at DESC LIMIT 20`).all(batch.recipe_id, batchId) as any[];
  } catch { /* ignore */ }

  return {
    batch_id: batchId,
    recipe_name: batch.recipe_id || '未知配方',
    recipe_version: batch.recipe_version || '1.0',
    organism: batch.organism || null,
    operator: batch.operator_id || '未记录',
    started_at: batch.started_at || '',
    ended_at: batch.ended_at || '',
    duration_hours,
    outcome: batch.outcome || '未知',
    stats: defaultStats,
    phases,
    events,
    alarms,
    historical,
    current_kpi,
  };
}

// 存储/读取报告到 ai_sessions 表
function saveReportSession(sqlite: SQLiteService, sessionId: string, batchId: string, report: Report, messages: any[]): void {
  const existing = sqlite.getDatabase().prepare('SELECT session_id FROM ai_sessions WHERE session_id = ?').get(sessionId);
  if (existing) {
    sqlite.getDatabase().prepare(
      'UPDATE ai_sessions SET report_data = ?, messages = ?, updated_at = datetime(\'now\') WHERE session_id = ?'
    ).run(JSON.stringify(report), JSON.stringify(messages), sessionId);
  } else {
    sqlite.getDatabase().prepare(
      `INSERT INTO ai_sessions (session_id, batch_id, user_id, session_type, report_data, messages, started_at, updated_at)
       VALUES (?, ?, 'system', 'report', ?, ?, datetime('now'), datetime('now'))`
    ).run(sessionId, batchId, JSON.stringify(report), JSON.stringify(messages));
  }
}

function loadReportSession(sqlite: SQLiteService, sessionId: string): { report: Report; messages: any[] } | null {
  const row = sqlite.getDatabase().prepare('SELECT report_data, messages FROM ai_sessions WHERE session_id = ?').get(sessionId) as any;
  if (!row?.report_data) return null;
  return {
    report: JSON.parse(row.report_data),
    messages: row.messages ? JSON.parse(row.messages) : [],
  };
}

/**
 * 注册 AI 报告路由
 */
export function registerAiReportRoutes(
  router: Router,
  sqlite: SQLiteService,
  influxQueryApi: any,
): void {
  const llm = new LLMClient();
  const generator = new ReportGenerator(llm);

  // POST /ai/report/generate — 生成完整报告
  router.post('/ai/report/generate', async (req, res) => {
    const { batch_id, focus } = req.body;
    if (!batch_id) return res.status(400).json({ error: '缺少 batch_id' });

    try {
      const context = await buildReportContext(sqlite, batch_id, influxQueryApi);
      const report = await generator.generateReport(context, focus);

      const sessionId = `rpt-${Date.now().toString(36)}`;
      const messages = [
        { role: 'user', content: `生成 ${batch_id} 的批次报告${focus ? `, 重点: ${focus}` : ''}` },
        { role: 'assistant', content: `已生成报告: ${report.title}` },
      ];
      saveReportSession(sqlite, sessionId, batch_id, report, messages);

      res.json({ session_id: sessionId, report });
    } catch (err: any) {
      console.error(`[AI Report] 生成失败:`, err.message, err.stack?.slice(0, 300));
      res.status(500).json({ error: `报告生成失败: ${err.message}` });
    }
  });

  // POST /ai/report/:sessionId/refine — 迭代修改报告
  router.post('/ai/report/:sessionId/refine', async (req, res) => {
    const { sessionId } = req.params;
    const { instruction } = req.body;
    if (!instruction) return res.status(400).json({ error: '缺少 instruction' });

    const session = loadReportSession(sqlite, sessionId);
    if (!session) return res.status(404).json({ error: '报告会话不存在' });

    try {
      const context = await buildReportContext(sqlite, session.report.batch_id, influxQueryApi);
      const updated = await generator.refineReport(session.report, instruction, context);

      session.messages.push(
        { role: 'user', content: instruction },
        { role: 'assistant', content: `已更新报告: ${instruction.slice(0, 30)}...` },
      );
      saveReportSession(sqlite, sessionId, session.report.batch_id, updated, session.messages);

      res.json({ session_id: sessionId, report: updated });
    } catch (err: any) {
      res.status(500).json({ error: `报告修改失败: ${err.message}` });
    }
  });

  // GET /ai/report/:sessionId — 获取报告 JSON
  router.get('/ai/report/:sessionId', (req, res) => {
    const session = loadReportSession(sqlite, req.params.sessionId);
    if (!session) return res.status(404).json({ error: '报告不存在' });
    res.json({ session_id: req.params.sessionId, report: session.report, messages: session.messages });
  });

  // GET /ai/report/:sessionId/html — HTML 预览
  router.get('/ai/report/:sessionId/html', (req, res) => {
    const session = loadReportSession(sqlite, req.params.sessionId);
    if (!session) return res.status(404).json({ error: '报告不存在' });
    const html = renderReportHtml(session.report);
    res.type('html').send(html);
  });

  // GET /ai/report/:sessionId/export/pdf — PDF 下载
  router.get('/ai/report/:sessionId/export/pdf', async (req, res) => {
    const session = loadReportSession(sqlite, req.params.sessionId);
    if (!session) return res.status(404).json({ error: '报告不存在' });

    try {
      // @ts-ignore — puppeteer 运行时动态加载
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
      const page = await browser.newPage();
      const html = renderReportHtml(session.report);
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      });
      await browser.close();

      const filename = `${session.report.batch_id}_报告_${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(Buffer.from(pdfBuffer));
    } catch (err: any) {
      // 回退到 HTML 下载
      const html = renderReportHtml(session.report);
      const filename = `${session.report.batch_id}_报告_${new Date().toISOString().slice(0, 10)}.html`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(html);
    }
  });

  // GET /ai/report/:sessionId/export/docx — Word 下载
  router.get('/ai/report/:sessionId/export/docx', async (req, res) => {
    const session = loadReportSession(sqlite, req.params.sessionId);
    if (!session) return res.status(404).json({ error: '报告不存在' });

    try {
      const buffer = await buildReportDocx(session.report);
      const filename = `${session.report.batch_id}_报告_${new Date().toISOString().slice(0, 10)}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: `Word生成失败: ${err.message}` });
    }
  });
}
