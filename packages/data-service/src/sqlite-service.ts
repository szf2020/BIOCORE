// ============================================================
// SQLiteService — 业务数据库完整实现
// 基于 05_数据库Schema详设.md 的全部表定义
// ============================================================

import Database from 'better-sqlite3';

export class SQLiteService {
  private db: Database.Database;

  constructor(dbPath: string = './data/biocore.db') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    // 注: 不再调用 initSchema(). schema 创建/演化已由 packages/server/migrations/
    // 下的 .sql 文件管理, 由 packages/server/src/migrator.ts 在 server 启动时执行.
  }

  /** @deprecated schema 已迁移到 packages/server/migrations/, 此方法保留为空仅为向前兼容 */
  private initSchema(): void {
    // schema 由 packages/server/src/migrator.ts 在 server 启动时执行 migration 文件创建
    // 历史 SQL 内容: 见 packages/server/migrations/001-baseline-schema.sql
  }

  // ─── 批次 CRUD ──────────────────────────────────────────────

  createBatch(batch: {
    batch_id: string; recipe_id: string; recipe_version: string;
    reactor_id?: string; organism?: string; operator_id: string; total_phases: number;
  }): void {
    this.db.prepare(`
      INSERT INTO batches (batch_id, recipe_id, recipe_version, reactor_id, organism, operator_id, total_phases)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(batch.batch_id, batch.recipe_id, batch.recipe_version,
      batch.reactor_id || 'F01', batch.organism || null, batch.operator_id, batch.total_phases);
  }

  // 安全: 白名单限制可更新的列名，防止 SQL 注入
  private static BATCH_UPDATABLE = new Set([
    'current_state', 'current_phase_index', 'current_phase_id', 'current_phase_type',
    'current_step_number', 'total_phases', 'state_snapshot', 'hold_reason',
    'stop_trigger', 'outcome', 'summary_text', 'notes', 'started_at', 'ended_at',
  ]);

  updateBatch(batchId: string, updates: Record<string, any>): void {
    const keys = Object.keys(updates).filter(k => SQLiteService.BATCH_UPDATABLE.has(k));
    if (keys.length === 0) return;
    const sets = keys.map(k => `"${k}" = ?`).join(', ');
    this.db.prepare(`UPDATE batches SET ${sets} WHERE batch_id = ?`).run(...keys.map(k => updates[k]), batchId);
  }

  getBatch(batchId: string): any {
    return this.db.prepare('SELECT * FROM batches WHERE batch_id = ?').get(batchId);
  }

  listBatches(limit = 50, offset = 0, reactorId?: string): any[] {
    // M2.3: 可选 reactor_id 过滤 (供多反应器对比的批次下拉用)
    if (reactorId) {
      return this.db.prepare(
        'SELECT * FROM batches WHERE reactor_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      ).all(reactorId, limit, offset);
    }
    return this.db.prepare('SELECT * FROM batches ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  }

  // ─── 状态流转日志 ──────────────────────────────────────────

  writeStateTransition(entry: {
    batch_id: string; from_state: string; to_state: string;
    event: string; triggered_by: string; phase_id?: string;
    step_number?: number; context?: any;
  }): void {
    this.db.prepare(`
      INSERT INTO state_transitions (batch_id, from_state, to_state, event, triggered_by, phase_id, step_number, context)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entry.batch_id, entry.from_state, entry.to_state, entry.event,
      entry.triggered_by, entry.phase_id || null, entry.step_number ?? null,
      entry.context ? JSON.stringify(entry.context) : null);
  }

  getStateTransitions(batchId: string): any[] {
    return this.db.prepare('SELECT * FROM state_transitions WHERE batch_id = ? ORDER BY timestamp').all(batchId);
  }

  // ─── 审计日志 ──────────────────────────────────────────────

  writeAuditLog(log: {
    user_id: string; action: string; target_type: string;
    batch_id?: string; target_id?: string; old_value?: string;
    new_value?: string; reason?: string; ip_address?: string;
    trace_id?: string;
    // T15: target_kind disambiguates the semantics of target_id
    // (e.g. 'phase_index' vs 'node_id' vs 'recipe_id').
    target_kind?: 'phase_index' | 'node_id' | 'recipe_id' | 'batch_id' | 'user_id' | 'channel_id';
  }): void {
    this.db.prepare(`
      INSERT INTO audit_logs (batch_id, user_id, action, target_type, target_id, old_value, new_value, reason, ip_address, trace_id, target_kind)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(log.batch_id || null, log.user_id, log.action, log.target_type,
      log.target_id || null, log.old_value || null, log.new_value || null,
      log.reason || null, log.ip_address || null, log.trace_id || null,
      log.target_kind || null);
  }

  getAuditLogs(batchId?: string, limit = 100): any[] {
    if (batchId) {
      return this.db.prepare('SELECT * FROM audit_logs WHERE batch_id = ? ORDER BY timestamp DESC LIMIT ?').all(batchId, limit);
    }
    return this.db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
  }

  // ─── 报警 ─────────────────────────────────────────────────

  createAlarm(alarm: {
    batch_id?: string; alarm_code: string; severity: string;
    source: string; message: string; channel?: string;
    pv_at_trigger?: number; sv_at_trigger?: number;
  }): number {
    const result = this.db.prepare(`
      INSERT INTO alarms (batch_id, alarm_code, severity, source, message, channel, pv_at_trigger, sv_at_trigger)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(alarm.batch_id || null, alarm.alarm_code, alarm.severity,
      alarm.source, alarm.message, alarm.channel || null,
      alarm.pv_at_trigger ?? null, alarm.sv_at_trigger ?? null);
    return result.lastInsertRowid as number;
  }

  acknowledgeAlarm(id: number, userId: string): void {
    this.db.prepare(`UPDATE alarms SET acknowledged_at = datetime('now'), acknowledged_by = ? WHERE id = ?`).run(userId, id);
  }

  getUnacknowledgedAlarms(batchId?: string): any[] {
    if (batchId) {
      return this.db.prepare('SELECT * FROM alarms WHERE batch_id = ? AND acknowledged_at IS NULL ORDER BY triggered_at DESC').all(batchId);
    }
    return this.db.prepare('SELECT * FROM alarms WHERE acknowledged_at IS NULL ORDER BY triggered_at DESC').all();
  }

  // ─── Phase/Step 日志 ──────────────────────────────────────

  writePhaseLog(log: {
    batch_id: string; phase_index: number; phase_id: string; phase_type: string;
    total_steps: number; entry_snapshot?: any;
  }): number {
    const result = this.db.prepare(`
      INSERT INTO phase_logs (batch_id, phase_index, phase_id, phase_type, total_steps, entry_snapshot)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(log.batch_id, log.phase_index, log.phase_id, log.phase_type,
      log.total_steps, log.entry_snapshot ? JSON.stringify(log.entry_snapshot) : null);
    return result.lastInsertRowid as number;
  }

  completePhaseLog(id: number, result: string, completedSteps: number, exitSnapshot?: any): void {
    this.db.prepare(`
      UPDATE phase_logs SET ended_at = datetime('now'), elapsed_sec = (julianday(datetime('now')) - julianday(started_at)) * 86400,
      result = ?, completed_steps = ?, exit_snapshot = ? WHERE id = ?
    `).run(result, completedSteps, exitSnapshot ? JSON.stringify(exitSnapshot) : null, id);
  }

  writeStepLog(log: {
    batch_id: string; phase_index: number; phase_id: string; phase_type: string;
    step_number: number; step_name: string; elapsed_sec: number; result: string;
    condition_actual?: number; entry_snapshot?: any; exit_snapshot?: any;
  }): void {
    this.db.prepare(`
      INSERT INTO step_logs (batch_id, phase_index, phase_id, phase_type, step_number, step_name,
        started_at, ended_at, elapsed_sec, result, condition_actual, entry_snapshot, exit_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' seconds'), datetime('now'), ?, ?, ?, ?, ?)
    `).run(log.batch_id, log.phase_index, log.phase_id, log.phase_type,
      log.step_number, log.step_name, Math.round(log.elapsed_sec), log.elapsed_sec,
      log.result, log.condition_actual ?? null,
      log.entry_snapshot ? JSON.stringify(log.entry_snapshot) : null,
      log.exit_snapshot ? JSON.stringify(log.exit_snapshot) : null);
  }

  getPhaseLogs(batchId: string): any[] {
    return this.db.prepare('SELECT * FROM phase_logs WHERE batch_id = ? ORDER BY phase_index').all(batchId);
  }

  getStepLogs(batchId: string, phaseIndex?: number): any[] {
    if (phaseIndex !== undefined) {
      return this.db.prepare('SELECT * FROM step_logs WHERE batch_id = ? AND phase_index = ? ORDER BY step_number').all(batchId, phaseIndex);
    }
    return this.db.prepare('SELECT * FROM step_logs WHERE batch_id = ? ORDER BY phase_index, step_number').all(batchId);
  }

  // ─── 通讯事件 ─────────────────────────────────────────────

  writeCommEvent(event: {
    batch_id?: string; connection_id: string; event_type: string;
    reason?: string; pc_counter?: number; plc_counter?: number;
    downtime_s?: number; auto_held?: boolean;
  }): void {
    this.db.prepare(`
      INSERT INTO comm_events (batch_id, connection_id, event_type, reason, pc_counter, plc_counter, downtime_s, auto_held)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(event.batch_id || null, event.connection_id, event.event_type,
      event.reason || null, event.pc_counter ?? null, event.plc_counter ?? null,
      event.downtime_s ?? null, event.auto_held ? 1 : 0);
  }

  // ─── 离线取样 ─────────────────────────────────────────────

  addOfflineSample(sample: {
    batch_id: string; sample_time: string; sampled_by: string;
    od600?: number; dcw_g_L?: number; glucose_g_L?: number;
    acetate_g_L?: number; product_titer?: number; product_unit?: string;
    // M2.4 新增字段 (migration 004)
    lactate_g_L?: number; biomass_g_L?: number; cell_viability_pct?: number; ethanol_g_L?: number;
    extra_analytes?: any; notes?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO offline_samples (batch_id, sample_time, sampled_by, od600, dcw_g_L, glucose_g_L,
        acetate_g_L, product_titer, product_unit,
        lactate_g_L, biomass_g_L, cell_viability_pct, ethanol_g_L,
        extra_analytes, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sample.batch_id, sample.sample_time, sample.sampled_by,
      sample.od600 ?? null, sample.dcw_g_L ?? null, sample.glucose_g_L ?? null,
      sample.acetate_g_L ?? null, sample.product_titer ?? null, sample.product_unit || null,
      sample.lactate_g_L ?? null, sample.biomass_g_L ?? null,
      sample.cell_viability_pct ?? null, sample.ethanol_g_L ?? null,
      sample.extra_analytes ? JSON.stringify(sample.extra_analytes) : null,
      sample.notes || null);
  }

  getOfflineSamples(batchId: string): any[] {
    return this.db.prepare('SELECT * FROM offline_samples WHERE batch_id = ? ORDER BY sample_time').all(batchId);
  }

  // ─── AI建议缓冲区 ────────────────────────────────────────

  createSuggestion(s: {
    batch_id: string; suggestion_type: string; source_module: string;
    target_param: string; current_value?: number; suggested_value?: number;
    confidence?: number; reasoning?: string; expires_at?: string;
  }): number {
    const result = this.db.prepare(`
      INSERT INTO ai_suggestions (batch_id, suggestion_type, source_module, target_param,
        current_value, suggested_value, confidence, reasoning, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(s.batch_id, s.suggestion_type, s.source_module, s.target_param,
      s.current_value ?? null, s.suggested_value ?? null, s.confidence ?? null,
      s.reasoning || null, s.expires_at || null);
    return result.lastInsertRowid as number;
  }

  acceptSuggestion(id: number, userId: string): void {
    this.db.prepare(`
      UPDATE ai_suggestions SET status = 'accepted', decided_by = ?, decided_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(userId, id);
  }

  rejectSuggestion(id: number, userId: string): void {
    this.db.prepare(`
      UPDATE ai_suggestions SET status = 'rejected', decided_by = ?, decided_at = datetime('now')
      WHERE id = ? AND status = 'pending'
    `).run(userId, id);
  }

  expirePendingSuggestions(batchId: string): void {
    this.db.prepare(`
      UPDATE ai_suggestions SET status = 'expired', decided_at = datetime('now')
      WHERE batch_id = ? AND status = 'pending'
    `).run(batchId);
  }

  getPendingSuggestions(batchId?: string): any[] {
    if (batchId) {
      return this.db.prepare(
        "SELECT * FROM ai_suggestions WHERE batch_id = ? AND status = 'pending' ORDER BY created_at DESC"
      ).all(batchId);
    }
    return this.db.prepare(
      "SELECT * FROM ai_suggestions WHERE status = 'pending' ORDER BY created_at DESC"
    ).all();
  }

  // ─── 配方 ─────────────────────────────────────────────────

  createRecipe(recipe: {
    recipe_id: string; version: string; name: string; author: string;
    target_organism?: string; vessel_config: any;
    phases?: any[];                 // 老 v1 线性 phases 数组
    dag?: any;                      // 新 v2 DAG 对象 (RecipeDAG)
    dag_schema_version?: number;    // 1 = 老线性, 2 = 新 DAG
    is_template?: number;           // 0 / 1 (M3.3)
    parent_template_id?: string;
    parent_version?: string;        // 自动设置 (M3.1)
    created_by: string;
  }): void {
    // 序列化策略:
    //   - dag_schema_version=2 + dag 字段 → 写 DAG JSON 到 phases 列, dag_schema_version=2
    //   - 否则 → 写老 phases 数组到 phases 列, dag_schema_version=1
    const schemaVer = recipe.dag_schema_version ?? (recipe.dag ? 2 : 1);
    const phasesJson = schemaVer === 2 && recipe.dag
      ? JSON.stringify(recipe.dag)
      : JSON.stringify(recipe.phases || []);

    // 自动算 parent_version: 当前已有最新版本的 version (M3.1)
    let parentVersion = recipe.parent_version;
    if (parentVersion === undefined) {
      const prev: any = this.db.prepare(
        'SELECT version FROM recipes WHERE recipe_id = ? ORDER BY created_at DESC LIMIT 1'
      ).get(recipe.recipe_id);
      if (prev) parentVersion = prev.version;
    }

    this.db.prepare(`
      INSERT INTO recipes
        (recipe_id, version, name, author, target_organism, vessel_config, phases, created_by,
         dag_schema_version, is_template, parent_template_id, parent_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      recipe.recipe_id, recipe.version, recipe.name, recipe.author,
      recipe.target_organism || null, JSON.stringify(recipe.vessel_config),
      phasesJson, recipe.created_by,
      schemaVer,
      recipe.is_template ?? 0,
      recipe.parent_template_id || null,
      parentVersion || null,
    );
  }

  approveRecipe(recipeId: string, version: string, approvedBy: string): void {
    // M3.2: 只能从 pending_approval 批准 (更严格)
    // 注意: 通过 UPDATE WHERE status IN (draft, pending_approval) 保持向后兼容
    this.db.prepare(`
      UPDATE recipes SET status = 'approved', approved_by = ?, approved_at = datetime('now'),
        rejection_reason = NULL
      WHERE recipe_id = ? AND version = ? AND status IN ('draft','pending_approval')
    `).run(approvedBy, recipeId, version);
  }

  // M3.2: 提交审核
  submitForReview(recipeId: string, version: string): void {
    this.db.prepare(`
      UPDATE recipes SET status = 'pending_approval', rejection_reason = NULL
      WHERE recipe_id = ? AND version = ? AND status = 'draft'
    `).run(recipeId, version);
  }

  // M3.2: 拒绝 (写 rejection_reason + 回到 draft)
  rejectRecipe(recipeId: string, version: string, reason: string): void {
    if (!reason || !reason.trim()) throw new Error('拒绝必须带原因');
    this.db.prepare(`
      UPDATE recipes SET status = 'draft', rejection_reason = ?
      WHERE recipe_id = ? AND version = ? AND status = 'pending_approval'
    `).run(reason, recipeId, version);
  }

  // M3.2: 审核队列 (全部 pending_approval 记录)
  listPendingApprovals(): any[] {
    return this.db.prepare(`
      SELECT recipe_id, version, name, author, created_at, created_by, parent_version, dag_schema_version
      FROM recipes
      WHERE status = 'pending_approval' AND is_template = 0
      ORDER BY created_at DESC
    `).all();
  }

  countPendingApprovals(): number {
    const row: any = this.db.prepare(
      "SELECT COUNT(*) AS cnt FROM recipes WHERE status = 'pending_approval' AND is_template = 0"
    ).get();
    return row?.cnt ?? 0;
  }

  // ── 配方废弃流程 ──

  // 提交废弃申请 (draft/approved → pending_deprecation)
  submitForDeprecation(recipeId: string, version: string): void {
    this.db.prepare(`
      UPDATE recipes SET status = 'pending_deprecation',
        pre_deprecation_status = status, rejection_reason = NULL
      WHERE recipe_id = ? AND version = ? AND status IN ('draft','approved')
    `).run(recipeId, version);
  }

  // 批准废弃 (pending_deprecation → deprecated)
  approveDeprecation(recipeId: string, version: string, approvedBy: string): void {
    this.db.prepare(`
      UPDATE recipes SET status = 'deprecated', approved_by = ?, approved_at = datetime('now'),
        pre_deprecation_status = NULL
      WHERE recipe_id = ? AND version = ? AND status = 'pending_deprecation'
    `).run(approvedBy, recipeId, version);
  }

  // 拒绝废弃 (回到 pre_deprecation_status)
  rejectDeprecation(recipeId: string, version: string, reason: string): void {
    if (!reason || !reason.trim()) throw new Error('拒绝必须带原因');
    this.db.prepare(`
      UPDATE recipes SET status = pre_deprecation_status,
        rejection_reason = ?, pre_deprecation_status = NULL
      WHERE recipe_id = ? AND version = ? AND status = 'pending_deprecation'
    `).run(reason, recipeId, version);
  }

  // 从废弃恢复到草稿
  restoreDeprecated(recipeId: string, version: string): void {
    this.db.prepare(`
      UPDATE recipes SET status = 'draft', rejection_reason = NULL
      WHERE recipe_id = ? AND version = ? AND status = 'deprecated'
    `).run(recipeId, version);
  }

  // 统一审核列表 (pending_approval + pending_deprecation)
  listPendingReview(): any[] {
    return this.db.prepare(`
      SELECT recipe_id, version, name, author, created_at, created_by,
             parent_version, dag_schema_version, status, pre_deprecation_status
      FROM recipes
      WHERE status IN ('pending_approval','pending_deprecation') AND is_template = 0
      ORDER BY created_at DESC
    `).all();
  }

  getRecipe(recipeId: string, version?: string): any {
    if (version) {
      return this.db.prepare('SELECT * FROM recipes WHERE recipe_id = ? AND version = ?').get(recipeId, version);
    }
    return this.db.prepare("SELECT * FROM recipes WHERE recipe_id = ? AND status = 'approved' ORDER BY version DESC LIMIT 1").get(recipeId);
  }

  listRecipes(status?: string, opts: { isTemplate?: boolean } = {}): any[] {
    // M3.3: 默认排除模板 (列表页只显示真正的配方)
    // 想拿模板要显式 isTemplate=true
    const where: string[] = [];
    const params: any[] = [];
    if (opts.isTemplate === true) {
      where.push('is_template = 1');
    } else if (opts.isTemplate === false) {
      where.push('is_template = 0');
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const sql = where.length > 0
      ? `SELECT * FROM recipes WHERE ${where.join(' AND ')} ORDER BY recipe_id, version DESC`
      : 'SELECT * FROM recipes ORDER BY recipe_id, version DESC';
    return this.db.prepare(sql).all(...params);
  }

  // M3.1: 列出某个 recipe_id 的所有版本(含 draft / approved / archived 全部)
  listRecipeVersions(recipeId: string): any[] {
    return this.db.prepare(
      `SELECT recipe_id, version, status, created_at, created_by, parent_version, dag_schema_version, name
       FROM recipes
       WHERE recipe_id = ?
       ORDER BY created_at DESC`
    ).all(recipeId);
  }

  // M3.1: 抓两个版本完整数据用于 diff
  getRecipeForDiff(recipeId: string, v1: string, v2: string): { v1: any; v2: any } | null {
    const r1: any = this.db.prepare('SELECT * FROM recipes WHERE recipe_id = ? AND version = ?').get(recipeId, v1);
    const r2: any = this.db.prepare('SELECT * FROM recipes WHERE recipe_id = ? AND version = ?').get(recipeId, v2);
    if (!r1 || !r2) return null;
    return { v1: r1, v2: r2 };
  }

  // M3.3: 把指定 recipe@version 复制为新的模板行
  // 新行: recipe_id 改为 TPL-{srcId}, version=1.0.0, is_template=1, status='approved' (模板始终可用)
  saveAsTemplate(srcRecipeId: string, srcVersion: string, createdBy: string): { template_id: string; version: string } {
    const src: any = this.db.prepare(
      'SELECT * FROM recipes WHERE recipe_id = ? AND version = ?'
    ).get(srcRecipeId, srcVersion);
    if (!src) throw new Error(`源配方不存在: ${srcRecipeId}@${srcVersion}`);

    // 模板 ID 加 TPL- 前缀, 同一源不允许重复模板, 用 timestamp 后缀避免冲突
    const templateId = `TPL-${srcRecipeId}-${Date.now()}`;
    const templateVersion = '1.0.0';

    this.db.prepare(`
      INSERT INTO recipes
        (recipe_id, version, name, author, target_organism, vessel_config, phases, metadata,
         status, created_by, dag_schema_version, is_template, parent_template_id, parent_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, 1, NULL, NULL)
    `).run(
      templateId, templateVersion,
      `${src.name}(模板)`,
      src.author, src.target_organism,
      src.vessel_config, src.phases, src.metadata,
      createdBy,
      src.dag_schema_version ?? 1,
    );
    return { template_id: templateId, version: templateVersion };
  }

  // M3.3: 从模板创建一个新的实例配方
  // newRecipeId 由调用方决定 (避免命名冲突), parent_template_id 指向源
  instantiateTemplate(templateId: string, templateVersion: string, newRecipeId: string, newName: string, createdBy: string): void {
    const tpl: any = this.db.prepare(
      'SELECT * FROM recipes WHERE recipe_id = ? AND version = ? AND is_template = 1'
    ).get(templateId, templateVersion);
    if (!tpl) throw new Error(`模板不存在: ${templateId}@${templateVersion}`);

    this.db.prepare(`
      INSERT INTO recipes
        (recipe_id, version, name, author, target_organism, vessel_config, phases, metadata,
         status, created_by, dag_schema_version, is_template, parent_template_id, parent_version)
      VALUES (?, '1.0.0', ?, ?, ?, ?, ?, ?, 'draft', ?, ?, 0, ?, NULL)
    `).run(
      newRecipeId, newName, createdBy, tpl.target_organism,
      tpl.vessel_config, tpl.phases, tpl.metadata,
      createdBy,
      tpl.dag_schema_version ?? 1,
      templateId,
    );
  }

  // ─── 校准 ─────────────────────────────────────────────────

  addCalibration(cal: {
    channel: string; sensor_type: string; calibrated_by: string;
    cal_point_low_raw?: number; cal_point_low_eng?: number;
    cal_point_high_raw?: number; cal_point_high_eng?: number;
    do_zero_offset?: number; do_slope?: number; do_barometric_mbar?: number;
    expires_at?: string; notes?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO calibrations (channel, sensor_type, calibrated_by,
        cal_point_low_raw, cal_point_low_eng, cal_point_high_raw, cal_point_high_eng,
        do_zero_offset, do_slope, do_barometric_mbar, expires_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(cal.channel, cal.sensor_type, cal.calibrated_by,
      cal.cal_point_low_raw ?? null, cal.cal_point_low_eng ?? null,
      cal.cal_point_high_raw ?? null, cal.cal_point_high_eng ?? null,
      cal.do_zero_offset ?? null, cal.do_slope ?? null, cal.do_barometric_mbar ?? null,
      cal.expires_at || null, cal.notes || null);
  }

  getLatestCalibration(channel: string): any {
    return this.db.prepare('SELECT * FROM calibrations WHERE channel = ? ORDER BY calibrated_at DESC LIMIT 1').get(channel);
  }

  // ─── 反应器/设备配置 ────────────────────────────────────────

  // M2.5: 设备类型枚举 (应用层校验, 因 SQLite ALTER 无法加 CHECK 约束)
  static readonly REACTOR_CATEGORIES: readonly string[] = ['fermenter', 'bioreactor', 'centrifuge', 'purification', 'mixer', 'other'];

  listReactorConfigs(): any[] {
    return this.db.prepare('SELECT * FROM reactor_configs ORDER BY sort_order, reactor_id').all();
  }

  getReactorConfig(reactorId: string): any {
    return this.db.prepare('SELECT * FROM reactor_configs WHERE reactor_id = ?').get(reactorId);
  }

  upsertReactorConfig(config: {
    reactor_id: string; name: string; description?: string;
    vessel_volume_L?: number; plc_connection_id?: string; plc_protocol?: string;
    plc_ip?: string; plc_port?: number; plc_rack?: number; plc_slot?: number;
    heartbeat_write?: string; heartbeat_read?: string;
    enabled?: number; sort_order?: number;
    category?: string;
  }): void {
    // M2.5: category 白名单校验 (非法值回退 fermenter)
    const category = config.category && SQLiteService.REACTOR_CATEGORIES.includes(config.category)
      ? config.category
      : 'fermenter';
    this.db.prepare(`INSERT OR REPLACE INTO reactor_configs
      (reactor_id, name, description, vessel_volume_L, plc_connection_id, plc_protocol,
       plc_ip, plc_port, plc_rack, plc_slot, heartbeat_write, heartbeat_read,
       enabled, sort_order, category, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      config.reactor_id, config.name, config.description || '',
      config.vessel_volume_L ?? 5, config.plc_connection_id || null,
      config.plc_protocol || 's7', config.plc_ip || '192.168.2.1',
      config.plc_port ?? 102, config.plc_rack ?? 0, config.plc_slot ?? 1,
      config.heartbeat_write || 'VB400', config.heartbeat_read || 'VB401',
      config.enabled ?? 1, config.sort_order ?? 0,
      category,
    );
  }

  deleteReactorConfig(reactorId: string): void {
    this.db.prepare('DELETE FROM reactor_configs WHERE reactor_id = ?').run(reactorId);
  }

  // ─── 原料库 M9 (Sprint 2 M2.6) ──────────────────────────────

  // 原料类别白名单 (应用层校验)
  static readonly RAW_MATERIAL_CATEGORIES: readonly string[] = [
    'media', 'buffer', 'reagent', 'substrate', 'additive', 'other',
  ];

  listRawMaterials(opts: { category?: string; limit?: number; offset?: number } = {}): any[] {
    const where = ['deleted_at IS NULL'];
    const params: any[] = [];
    if (opts.category && SQLiteService.RAW_MATERIAL_CATEGORIES.includes(opts.category)) {
      where.push('category = ?');
      params.push(opts.category);
    }
    const limit = Math.min(opts.limit ?? 200, 1000);
    const offset = Math.max(opts.offset ?? 0, 0);
    const rows: any[] = this.db.prepare(
      `SELECT * FROM raw_materials WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    // JSON 字段回解析
    return rows.map(r => ({
      ...r,
      physical_properties: r.physical_properties ? JSON.parse(r.physical_properties) : null,
    }));
  }

  getRawMaterial(materialId: string): any {
    const row: any = this.db.prepare(
      'SELECT * FROM raw_materials WHERE material_id = ? AND deleted_at IS NULL'
    ).get(materialId);
    if (!row) return null;
    return {
      ...row,
      physical_properties: row.physical_properties ? JSON.parse(row.physical_properties) : null,
    };
  }

  createRawMaterial(m: {
    material_id: string; name: string; category: string;
    supplier?: string; catalog_no?: string; unit?: string;
    cost_per_unit?: number; storage?: string;
    physical_properties?: any; notes?: string;
    created_by?: string;
  }): void {
    if (!SQLiteService.RAW_MATERIAL_CATEGORIES.includes(m.category)) {
      throw new Error(`非法 category: ${m.category}`);
    }
    this.db.prepare(`
      INSERT INTO raw_materials
        (material_id, name, category, supplier, catalog_no, unit, cost_per_unit, storage,
         physical_properties, notes, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      m.material_id, m.name, m.category,
      m.supplier || null, m.catalog_no || null, m.unit || null,
      m.cost_per_unit ?? null, m.storage || null,
      m.physical_properties ? JSON.stringify(m.physical_properties) : null,
      m.notes || null, m.created_by || null,
    );
  }

  updateRawMaterial(materialId: string, patch: Partial<{
    name: string; category: string; supplier: string; catalog_no: string;
    unit: string; cost_per_unit: number; storage: string;
    physical_properties: any; notes: string;
  }>): void {
    if (patch.category !== undefined && !SQLiteService.RAW_MATERIAL_CATEGORIES.includes(patch.category)) {
      throw new Error(`非法 category: ${patch.category}`);
    }
    const fields: string[] = [];
    const values: any[] = [];
    for (const [k, v] of Object.entries(patch)) {
      fields.push(`${k} = ?`);
      values.push(k === 'physical_properties' && v ? JSON.stringify(v) : (v ?? null));
    }
    if (fields.length === 0) return;
    fields.push("updated_at = datetime('now')");
    this.db.prepare(
      `UPDATE raw_materials SET ${fields.join(', ')} WHERE material_id = ? AND deleted_at IS NULL`
    ).run(...values, materialId);
  }

  softDeleteRawMaterial(materialId: string): void {
    this.db.prepare(
      "UPDATE raw_materials SET deleted_at = datetime('now') WHERE material_id = ? AND deleted_at IS NULL"
    ).run(materialId);
  }

  setMsdsFilename(materialId: string, filename: string): void {
    this.db.prepare(
      "UPDATE raw_materials SET msds_filename = ?, msds_uploaded_at = datetime('now'), updated_at = datetime('now') WHERE material_id = ? AND deleted_at IS NULL"
    ).run(filename, materialId);
  }

  // ─── DoE 研究 CRUD ───────────────────────────────────────

  createDoeStudy(study: {
    study_id: string;
    name: string;
    description?: string;
    base_recipe_id?: string;
    base_recipe_version?: string;
    design_type: string;
    factors: any[];
    responses: any[];
    created_by: string;
  }): void {
    this.db.prepare(`
      INSERT INTO doe_studies
        (study_id, name, description, base_recipe_id, base_recipe_version,
         design_type, factors, responses, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(
      study.study_id, study.name, study.description || null,
      study.base_recipe_id || null, study.base_recipe_version || null,
      study.design_type,
      JSON.stringify(study.factors),
      JSON.stringify(study.responses),
      study.created_by,
    );
  }

  listDoeStudies(): any[] {
    const rows = this.db.prepare(`
      SELECT s.*, COUNT(r.run_id) AS run_count,
        SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) AS completed_count
      FROM doe_studies s
      LEFT JOIN doe_runs r ON r.study_id = s.study_id
      GROUP BY s.study_id
      ORDER BY s.created_at DESC
    `).all();
    return rows.map((r: any) => ({
      ...r,
      factors: JSON.parse(r.factors || '[]'),
      responses: JSON.parse(r.responses || '[]'),
    }));
  }

  getDoeStudy(studyId: string): any {
    const row: any = this.db.prepare('SELECT * FROM doe_studies WHERE study_id = ?').get(studyId);
    if (!row) return null;
    return {
      ...row,
      factors: JSON.parse(row.factors || '[]'),
      responses: JSON.parse(row.responses || '[]'),
    };
  }

  updateDoeStudyStatus(studyId: string, status: string): void {
    this.db.prepare(
      "UPDATE doe_studies SET status = ?, updated_at = datetime('now') WHERE study_id = ?"
    ).run(status, studyId);
  }

  updateDoeStudy(studyId: string, patch: { name?: string; description?: string; factors?: any[]; responses?: any[]; design_type?: string; base_recipe_id?: string; base_recipe_version?: string }): void {
    const sets: string[] = [];
    const params: any[] = [];
    if (patch.name !== undefined)               { sets.push('name = ?');               params.push(patch.name); }
    if (patch.description !== undefined)        { sets.push('description = ?');        params.push(patch.description); }
    if (patch.design_type !== undefined)        { sets.push('design_type = ?');        params.push(patch.design_type); }
    if (patch.factors !== undefined)            { sets.push('factors = ?');            params.push(JSON.stringify(patch.factors)); }
    if (patch.responses !== undefined)          { sets.push('responses = ?');          params.push(JSON.stringify(patch.responses)); }
    if (patch.base_recipe_id !== undefined)     { sets.push('base_recipe_id = ?');     params.push(patch.base_recipe_id); }
    if (patch.base_recipe_version !== undefined){ sets.push('base_recipe_version = ?');params.push(patch.base_recipe_version); }
    if (sets.length === 0) return;
    sets.push("updated_at = datetime('now')");
    params.push(studyId);
    this.db.prepare(`UPDATE doe_studies SET ${sets.join(', ')} WHERE study_id = ?`).run(...params);
  }

  deleteDoeStudy(studyId: string): void {
    // runs 级联删除 (ON DELETE CASCADE)
    this.db.prepare('DELETE FROM doe_studies WHERE study_id = ?').run(studyId);
  }

  // ─── DoE 运行 CRUD ───────────────────────────────────────

  replaceDoeRuns(studyId: string, rows: { run_index: number; factor_values: any }[]): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM doe_runs WHERE study_id = ?').run(studyId);
      const ins = this.db.prepare(`
        INSERT INTO doe_runs (run_id, study_id, run_index, factor_values, status)
        VALUES (?, ?, ?, ?, 'pending')
      `);
      for (const r of rows) {
        ins.run(
          `${studyId}-${r.run_index}`,
          studyId,
          r.run_index,
          JSON.stringify(r.factor_values),
        );
      }
    });
    tx();
    this.updateDoeStudyStatus(studyId, 'designed');
  }

  listDoeRuns(studyId: string): any[] {
    const rows = this.db.prepare(
      'SELECT * FROM doe_runs WHERE study_id = ? ORDER BY run_index ASC'
    ).all(studyId);
    return rows.map((r: any) => ({
      ...r,
      factor_values: JSON.parse(r.factor_values || '{}'),
      response_values: r.response_values ? JSON.parse(r.response_values) : null,
    }));
  }

  getDoeRun(studyId: string, runIndex: number): any {
    const row: any = this.db.prepare(
      'SELECT * FROM doe_runs WHERE study_id = ? AND run_index = ?'
    ).get(studyId, runIndex);
    if (!row) return null;
    return {
      ...row,
      factor_values: JSON.parse(row.factor_values || '{}'),
      response_values: row.response_values ? JSON.parse(row.response_values) : null,
    };
  }

  updateDoeRunRecipe(studyId: string, runIndex: number, recipeId: string, recipeVersion: string): void {
    this.db.prepare(`
      UPDATE doe_runs
      SET recipe_id = ?, recipe_version = ?, status = 'recipe_generated'
      WHERE study_id = ? AND run_index = ?
    `).run(recipeId, recipeVersion, studyId, runIndex);
  }

  bindDoeRunBatch(studyId: string, runIndex: number, batchId: string): void {
    this.db.prepare(`
      UPDATE doe_runs
      SET batch_id = ?, status = 'running', started_at = datetime('now')
      WHERE study_id = ? AND run_index = ?
    `).run(batchId, studyId, runIndex);
  }

  setDoeRunResponse(studyId: string, runIndex: number, responses: Record<string, number>, notes?: string): void {
    this.db.prepare(`
      UPDATE doe_runs
      SET response_values = ?, status = 'completed', completed_at = datetime('now'),
          notes = COALESCE(?, notes)
      WHERE study_id = ? AND run_index = ?
    `).run(JSON.stringify(responses), notes || null, studyId, runIndex);
  }

  // ─── 工具 ─────────────────────────────────────────────────

  getDatabase(): Database.Database { return this.db; }

  close(): void { this.db.close(); }
}

// ─── Notification system (T35) ───────────────────────────────
// Module-level CRUD helpers for notification_channels / notification_rules
// (created by migration 022-notification-tables.sql).
// Keep these as standalone functions so @biocore/notifier and admin routes
// can import them without instantiating a full SQLiteService.

export interface NotificationChannel {
  id: string;
  type: 'feishu' | 'dingtalk' | 'telegram' | 'webhook';
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

export interface NotificationRule {
  id: number;
  event_type: string;
  channel_id: string;
  enabled: boolean;
  min_severity: 'info' | 'warn' | 'critical';
}

export function listChannels(db: Database.Database): NotificationChannel[] {
  return (db.prepare('SELECT * FROM notification_channels ORDER BY created_at DESC').all() as Array<{
    id: string;
    type: string;
    config: string;
    enabled: number;
    created_at: string;
  }>).map(r => ({
    id: r.id,
    type: r.type as NotificationChannel['type'],
    config: JSON.parse(r.config),
    enabled: r.enabled === 1,
    created_at: r.created_at,
  }));
}

export function upsertChannel(db: Database.Database, ch: Omit<NotificationChannel, 'created_at'>): void {
  db.prepare(`
    INSERT INTO notification_channels(id, type, config, enabled) VALUES(?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      config = excluded.config,
      enabled = excluded.enabled
  `).run(ch.id, ch.type, JSON.stringify(ch.config), ch.enabled ? 1 : 0);
}

export function deleteChannel(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM notification_channels WHERE id = ?').run(id);
}

export function listRules(db: Database.Database): NotificationRule[] {
  return (db.prepare('SELECT * FROM notification_rules ORDER BY id').all() as Array<{
    id: number;
    event_type: string;
    channel_id: string;
    enabled: number;
    min_severity: string;
  }>).map(r => ({
    id: r.id,
    event_type: r.event_type,
    channel_id: r.channel_id,
    enabled: r.enabled === 1,
    min_severity: r.min_severity as NotificationRule['min_severity'],
  }));
}

export function setRules(db: Database.Database, rules: Array<Omit<NotificationRule, 'id'>>): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM notification_rules').run();
    const stmt = db.prepare(`
      INSERT INTO notification_rules(event_type, channel_id, enabled, min_severity)
      VALUES(?, ?, ?, ?)
    `);
    for (const r of rules) {
      stmt.run(r.event_type, r.channel_id, r.enabled ? 1 : 0, r.min_severity);
    }
  });
  tx();
}

// ─── B1.1 DAG runtime — current_node_id persistence (T12) ────
// Persist/read the DAG node currently being executed so a crashed
// batch can be resumed via BatchController.resumeBatch().
// Column added by migration 023.

export function updateBatchCurrentNodeId(
  db: Database.Database,
  batchId: string,
  nodeId: string | null,
): void {
  db.prepare('UPDATE batches SET current_node_id = ? WHERE batch_id = ?').run(nodeId, batchId);
}

export function getBatchCurrentNodeId(
  db: Database.Database,
  batchId: string,
): string | null {
  const row = db
    .prepare('SELECT current_node_id FROM batches WHERE batch_id = ?')
    .get(batchId) as { current_node_id: string | null } | undefined;
  return row?.current_node_id ?? null;
}

// v1.7.2 — boot-time crash recovery helpers
//
// When the server (re)starts and SQLite has rows with current_state ∈
// {running, held, paused}, those represent batches whose engines died with
// the previous process. We do NOT auto-resume — that would silently restart
// fermentations after an unattended outage, which is unsafe (PVs could have
// drifted, alarms may have been missed). Instead, surface them to the
// operator by marking each as 'held' with a recovery reason, so they appear
// in the UI's hold queue for explicit resume/abort decisions.

export interface OrphanBatchRow {
  batch_id: string;
  recipe_id: string;
  recipe_version: string;
  reactor_id: string;
  current_state: string;
  current_node_id: string | null;
  current_phase_index: number | null;
}

export function getOrphanBatches(db: Database.Database): OrphanBatchRow[] {
  return db.prepare(`
    SELECT batch_id, recipe_id, recipe_version, reactor_id,
           current_state, current_node_id, current_phase_index
    FROM batches
    WHERE current_state IN ('running','held','paused')
    ORDER BY started_at DESC
  `).all() as OrphanBatchRow[];
}

export function markBatchHeldForRecovery(
  db: Database.Database,
  batchId: string,
  reason: string,
): void {
  db.prepare(
    "UPDATE batches SET current_state = 'held', hold_reason = ? WHERE batch_id = ?",
  ).run(reason, batchId);
}

// v1.9.0 P2 bucket 2 — boot-time RecoveryPolicy may choose to abort an orphan
// batch outright rather than hold it for operator review. We map abort to
// current_state='stopped' + stop_trigger='cmd_stop' because the schema's CHECK
// constraint only allows {'cmd_stop','safety_estop'} for stop_trigger, and
// 'cmd_stop' is the closest semantic fit (operator-initiated, not a safety event).
// The actual recovery context is preserved in `notes` (appended, not overwritten)
// so the row keeps its prior history.
export function markBatchAborted(
  db: Database.Database,
  batchId: string,
  reason: string,
): void {
  db.prepare(
    "UPDATE batches SET current_state = 'stopped', stop_trigger = 'cmd_stop', notes = COALESCE(notes, '') || ? WHERE batch_id = ?",
  ).run(`\nrecovery_abort: ${reason}`, batchId);
}
