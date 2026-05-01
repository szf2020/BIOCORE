// ============================================================
// batch-samples-routes.ts — 离线取样增强 API (F2+F7)
// PUT  /batches/:id/samples/:sid  — 编辑取样 (审计)
// DELETE /batches/:id/samples/:sid  — 软删除 (审计)
// POST /batches/:id/samples/import — CSV 批量导入
// ============================================================

import type { Router } from 'express';
import type { SQLiteService } from '../../data-service/src/sqlite-service';

// 允许更新的字段白名单
const UPDATABLE_FIELDS = new Set([
  'sample_time', 'sampled_by', 'od600', 'dcw_g_L', 'glucose_g_L',
  'acetate_g_L', 'product_titer', 'product_unit', 'lactate_g_L',
  'biomass_g_L', 'cell_viability_pct', 'ethanol_g_L', 'notes',
]);

export function registerBatchSamplesRoutes(
  router: Router,
  sqlite: SQLiteService,
): void {
  const db = sqlite.getDatabase();

  // PUT /batches/:id/samples/:sid — 编辑单条取样
  router.put('/batches/:id/samples/:sid', (req: any, res) => {
    try {
      const { id: batchId, sid } = req.params;
      const body = req.body || {};
      const keys = Object.keys(body).filter(k => UPDATABLE_FIELDS.has(k));
      if (keys.length === 0) return res.status(400).json({ error: '无有效更新字段' });

      const sets = keys.map(k => `"${k}" = ?`).join(', ');
      const vals = keys.map(k => body[k]);
      const userId = req.user?.user_id || 'admin-001';

      db.prepare(`
        UPDATE offline_samples
        SET ${sets}, updated_at = datetime('now'), updated_by = ?
        WHERE id = ? AND batch_id = ? AND deleted_at IS NULL
      `).run(...vals, userId, sid, batchId);

      const row = db.prepare('SELECT * FROM offline_samples WHERE id = ?').get(sid);
      res.json({ success: true, sample: row });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // DELETE /batches/:id/samples/:sid — 软删除
  router.delete('/batches/:id/samples/:sid', (req: any, res) => {
    try {
      const { id: batchId, sid } = req.params;
      const userId = req.user?.user_id || 'admin-001';
      db.prepare(`
        UPDATE offline_samples
        SET deleted_at = datetime('now'), updated_by = ?
        WHERE id = ? AND batch_id = ? AND deleted_at IS NULL
      `).run(userId, sid, batchId);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // POST /batches/:id/samples/import — 批量导入 (JSON 数组)
  router.post('/batches/:id/samples/import', (req: any, res) => {
    try {
      const batchId = req.params.id;
      const samples: any[] = req.body?.samples || req.body;
      if (!Array.isArray(samples) || samples.length === 0) {
        return res.status(400).json({ error: '缺少 samples 数组' });
      }

      // 验证批次存在
      const batch = db.prepare('SELECT batch_id FROM batches WHERE batch_id = ?').get(batchId);
      if (!batch) return res.status(404).json({ error: '批次不存在' });

      const errors: string[] = [];
      let imported = 0;
      const userId = req.user?.user_id || 'admin-001';

      const ins = db.prepare(`
        INSERT INTO offline_samples
          (batch_id, sample_time, sampled_by, od600, dcw_g_L, glucose_g_L, acetate_g_L,
           product_titer, product_unit, lactate_g_L, biomass_g_L, cell_viability_pct,
           ethanol_g_L, notes, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const tx = db.transaction(() => {
        for (let i = 0; i < samples.length; i++) {
          const s = samples[i];
          if (!s.sample_time) {
            errors.push(`行 ${i + 1}: 缺少 sample_time`);
            continue;
          }
          try {
            ins.run(
              batchId,
              s.sample_time,
              s.sampled_by || userId,
              s.od600 ?? null, s.dcw_g_L ?? null, s.glucose_g_L ?? null,
              s.acetate_g_L ?? null, s.product_titer ?? null, s.product_unit ?? null,
              s.lactate_g_L ?? null, s.biomass_g_L ?? null, s.cell_viability_pct ?? null,
              s.ethanol_g_L ?? null, s.notes ?? null,
              userId,
            );
            imported++;
          } catch (e) {
            errors.push(`行 ${i + 1}: ${(e as Error).message}`);
          }
        }
      });
      tx();

      res.json({ success: true, imported_count: imported, errors });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
}
