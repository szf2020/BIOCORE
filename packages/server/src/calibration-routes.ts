// ============================================================
// calibration-routes.ts — 批量并行校准 API (F4)
// POST /calibrations/batch — 一次提交多通道校准数据
// ============================================================

import type { Router } from 'express';
import type { SQLiteService } from '../../data-service/src/sqlite-service';

interface CalibrationEntry {
  channel: string;
  sensor_type: string;
  calibrated_by: string;
  cal_point_low_raw: number;
  cal_point_low_eng: number;
  cal_point_high_raw: number;
  cal_point_high_eng: number;
  do_zero_offset?: number;
  do_slope?: number;
  do_barometric_mbar?: number;
  expires_at?: string;
  notes?: string;
}

export function registerCalibrationRoutes(
  router: Router,
  sqlite: SQLiteService,
): void {
  const db = sqlite.getDatabase();

  // POST /calibrations/batch — 批量并行校准 (事务)
  router.post('/calibrations/batch', (req: any, res) => {
    try {
      const { calibrations, reason } = req.body || {};
      if (!Array.isArray(calibrations) || calibrations.length === 0) {
        return res.status(400).json({ error: '缺少 calibrations 数组' });
      }

      const userId = req.user?.user_id || 'admin-001';
      const results: { channel: string; status: string }[] = [];

      const tx = db.transaction(() => {
        for (const cal of calibrations as CalibrationEntry[]) {
          if (!cal.channel || !cal.sensor_type) {
            results.push({ channel: cal.channel || '?', status: 'error: 缺少 channel 或 sensor_type' });
            continue;
          }
          // 插入校准记录
          sqlite.addCalibration({
            channel: cal.channel,
            sensor_type: cal.sensor_type,
            calibrated_by: cal.calibrated_by || userId,
            cal_point_low_raw: cal.cal_point_low_raw,
            cal_point_low_eng: cal.cal_point_low_eng,
            cal_point_high_raw: cal.cal_point_high_raw,
            cal_point_high_eng: cal.cal_point_high_eng,
            do_zero_offset: cal.do_zero_offset,
            do_slope: cal.do_slope,
            do_barometric_mbar: cal.do_barometric_mbar,
            expires_at: cal.expires_at,
            notes: cal.notes || reason || null,
          });

          // 写审计日志
          db.prepare(`
            INSERT INTO audit_logs (user_id, action, target_type, target_id, new_value, reason)
            VALUES (?, 'calibration_batch', 'calibration', ?, ?, ?)
          `).run(
            userId,
            cal.channel,
            `low=${cal.cal_point_low_eng}, high=${cal.cal_point_high_eng}`,
            reason || '批量校准',
          );
          results.push({ channel: cal.channel, status: 'ok' });
        }
      });
      tx();

      res.json({ success: true, count: results.filter(r => r.status === 'ok').length, results });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
}
