// ============================================================
// batch-export-routes.ts — Excel 报表导出 (F3)
// GET /batches/:id/export/xlsx — 生成 Excel 工作簿
// ============================================================

import type { Router } from 'express';
import type { SQLiteService } from '../../data-service/src/sqlite-service';
import ExcelJS from 'exceljs';

export function registerBatchExportRoutes(
  router: Router,
  sqlite: SQLiteService,
): void {
  const db = sqlite.getDatabase();

  router.get('/batches/:id/export/xlsx', async (req, res) => {
    try {
      const batchId = req.params.id;

      // 1. 批次元数据
      const batch: any = db.prepare('SELECT * FROM batches WHERE batch_id = ?').get(batchId);
      if (!batch) return res.status(404).json({ error: '批次不存在' });

      // 2. 关联数据
      const transitions: any[] = db.prepare(
        'SELECT * FROM state_transitions WHERE batch_id = ? ORDER BY timestamp ASC'
      ).all(batchId);
      const phaseLogs: any[] = db.prepare(
        'SELECT * FROM phase_logs WHERE batch_id = ? ORDER BY phase_index ASC'
      ).all(batchId);
      const stepLogs: any[] = db.prepare(
        'SELECT * FROM step_logs WHERE batch_id = ? ORDER BY phase_index, step_number'
      ).all(batchId);
      const alarms: any[] = db.prepare(
        'SELECT * FROM alarms WHERE batch_id = ? ORDER BY triggered_at ASC'
      ).all(batchId);
      const samples: any[] = db.prepare(
        'SELECT * FROM offline_samples WHERE batch_id = ? AND deleted_at IS NULL ORDER BY sample_time ASC'
      ).all(batchId);
      const auditLogs: any[] = db.prepare(
        "SELECT * FROM audit_logs WHERE batch_id = ? OR (target_type = 'batch' AND target_id = ?) ORDER BY timestamp ASC"
      ).all(batchId, batchId);

      // 配方名
      const recipe: any = batch.recipe_id
        ? db.prepare('SELECT name FROM recipes WHERE recipe_id = ? LIMIT 1').get(batch.recipe_id)
        : null;

      // 3. 创建工作簿
      const wb = new ExcelJS.Workbook();
      wb.creator = 'BIOCore MES';
      wb.created = new Date();

      // ── Sheet 1: 概览 ──
      const ws1 = wb.addWorksheet('概览');
      const meta: [string, any][] = [
        ['批次号', batch.batch_id],
        ['配方 ID', batch.recipe_id],
        ['配方名称', recipe?.name || '-'],
        ['配方版本', batch.recipe_version],
        ['反应器', batch.reactor_id],
        ['菌种', batch.organism || '-'],
        ['操作员', batch.operator_id],
        ['当前状态', batch.current_state],
        ['结果', batch.outcome || '-'],
        ['启动时间', batch.started_at || '-'],
        ['结束时间', batch.ended_at || '-'],
        ['总 Phase', batch.total_phases],
        ['导出时间', new Date().toISOString()],
      ];
      meta.forEach(([k, v], i) => {
        ws1.getCell(`A${i + 1}`).value = k;
        ws1.getCell(`A${i + 1}`).font = { bold: true };
        ws1.getCell(`B${i + 1}`).value = v;
      });
      ws1.getColumn('A').width = 15;
      ws1.getColumn('B').width = 40;

      // ── Sheet 2: 离线取样 ──
      const ws2 = wb.addWorksheet('离线取样');
      ws2.addRow(['取样时间', '取样人', 'OD600', 'DCW (g/L)', '葡萄糖 (g/L)',
        '乙酸 (g/L)', '产物浓度', '产物单位', '乳酸 (g/L)', '生物量 (g/L)',
        '细胞活力 (%)', '乙醇 (g/L)', '备注']);
      ws2.getRow(1).font = { bold: true };
      samples.forEach(s => {
        ws2.addRow([
          s.sample_time, s.sampled_by, s.od600, s.dcw_g_L, s.glucose_g_L,
          s.acetate_g_L, s.product_titer, s.product_unit, s.lactate_g_L,
          s.biomass_g_L, s.cell_viability_pct, s.ethanol_g_L, s.notes,
        ]);
      });

      // ── Sheet 3: 阶段日志 ──
      const ws3 = wb.addWorksheet('阶段日志');
      ws3.addRow(['Phase序号', 'Phase ID', 'Phase类型', '结果', '入口快照', '出口快照', '开始', '结束', '耗时(s)']);
      ws3.getRow(1).font = { bold: true };
      phaseLogs.forEach(p => {
        ws3.addRow([p.phase_index, p.phase_id, p.phase_type, p.result,
          p.entry_snapshot, p.exit_snapshot, p.started_at, p.ended_at, p.elapsed_s]);
      });

      // ── Sheet 4: 步骤日志 ──
      const ws4 = wb.addWorksheet('步骤日志');
      ws4.addRow(['Phase序号', 'Step序号', 'Step名', '条件类型', '完成条件', '实际值', '耗时(s)', '超时']);
      ws4.getRow(1).font = { bold: true };
      stepLogs.forEach(s => {
        ws4.addRow([s.phase_index, s.step_number, s.step_name,
          s.condition_type, s.condition_detail, s.actual_value, s.elapsed_s, s.timed_out ? '是' : '否']);
      });

      // ── Sheet 5: 报警记录 ──
      const ws5 = wb.addWorksheet('报警记录');
      ws5.addRow(['报警码', '严重度', '消息', '触发时间', '确认时间', '确认人', '解除时间']);
      ws5.getRow(1).font = { bold: true };
      alarms.forEach(a => {
        ws5.addRow([a.alarm_code, a.severity, a.message,
          a.triggered_at, a.acknowledged_at, a.acknowledged_by, a.resolved_at]);
      });

      // ── Sheet 6: 审计日志 ──
      const ws6 = wb.addWorksheet('审计日志');
      ws6.addRow(['时间', '操作人', '动作', '目标类型', '目标ID', '修改前', '修改后', '原因']);
      ws6.getRow(1).font = { bold: true };
      auditLogs.forEach(a => {
        ws6.addRow([a.timestamp, a.user_id, a.action, a.target_type,
          a.target_id, a.old_value, a.new_value, a.reason]);
      });

      // ── Sheet 7: 状态迁移 ──
      const ws7 = wb.addWorksheet('状态迁移');
      ws7.addRow(['时间', '从状态', '到状态', '事件', '触发者', '原因']);
      ws7.getRow(1).font = { bold: true };
      transitions.forEach(t => {
        ws7.addRow([t.timestamp, t.from_state, t.to_state, t.event, t.triggered_by, t.reason]);
      });

      // 4. 响应
      const filename = `BIOCore-${batchId}-report.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
