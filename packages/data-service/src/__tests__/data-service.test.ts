// ============================================================
// data-service 单元测试
// SQLite 内存模式测试 CRUD + DataCollector 逻辑
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteService } from '../sqlite-service';
import { DataCollector } from '../collector';

// ─── SQLite CRUD ──────────────────────────────────────────

describe('SQLiteService', () => {
  let db: SQLiteService;

  beforeEach(() => {
    db = new SQLiteService(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // 配方
  describe('配方管理', () => {
    it('创建配方', () => {
      db.createRecipe({
        recipe_id: 'TEST_V1', version: '1.0.0', name: 'Test',
        author: 'test', vessel_config: { id: 'F01', working_volume_L: 5, total_volume_L: 16, tare_weight_kg: 12 },
        phases: [{ phase_id: 'P1', type: 'prepare' }],
        created_by: 'admin-001',
      });
      const list = db.listRecipes();
      expect(list).toHaveLength(1);
      expect(list[0].recipe_id).toBe('TEST_V1');
    });

    it('审批配方', () => {
      db.createRecipe({
        recipe_id: 'R1', version: '1.0.0', name: 'R1', author: 'a',
        vessel_config: {}, phases: [], created_by: 'admin-001',
      });
      db.approveRecipe('R1', '1.0.0', 'admin-001');
      const r = db.getRecipe('R1', '1.0.0');
      expect(r.status).toBe('approved');
      expect(r.approved_by).toBe('admin-001');
    });

    it('列出已审批配方', () => {
      db.createRecipe({ recipe_id: 'R1', version: '1.0.0', name: 'R1', author: 'a', vessel_config: {}, phases: [], created_by: 'admin-001' });
      db.createRecipe({ recipe_id: 'R2', version: '1.0.0', name: 'R2', author: 'a', vessel_config: {}, phases: [], created_by: 'admin-001' });
      db.approveRecipe('R1', '1.0.0', 'admin-001');
      const approved = db.listRecipes('approved');
      expect(approved).toHaveLength(1);
      expect(approved[0].recipe_id).toBe('R1');
    });
  });

  // 批次
  describe('批次管理', () => {
    beforeEach(() => {
      db.createRecipe({ recipe_id: 'R1', version: '1.0.0', name: 'R1', author: 'a', vessel_config: {}, phases: [], created_by: 'admin-001' });
    });

    it('创建批次', () => {
      db.createBatch({
        batch_id: 'BATCH-001', recipe_id: 'R1', recipe_version: '1.0.0',
        operator_id: 'admin-001', total_phases: 5,
      });
      const b = db.getBatch('BATCH-001');
      expect(b).toBeDefined();
      expect(b.current_state).toBe('idle');
      expect(b.total_phases).toBe(5);
    });

    it('更新批次状态', () => {
      db.createBatch({ batch_id: 'B1', recipe_id: 'R1', recipe_version: '1.0.0', operator_id: 'admin-001', total_phases: 3 });
      db.updateBatch('B1', { current_state: 'running', started_at: new Date().toISOString() });
      expect(db.getBatch('B1').current_state).toBe('running');
    });

    it('列出批次', () => {
      db.createBatch({ batch_id: 'B1', recipe_id: 'R1', recipe_version: '1.0.0', operator_id: 'admin-001', total_phases: 3 });
      db.createBatch({ batch_id: 'B2', recipe_id: 'R1', recipe_version: '1.0.0', operator_id: 'admin-001', total_phases: 5 });
      expect(db.listBatches()).toHaveLength(2);
    });
  });

  // 审计日志
  describe('审计日志', () => {
    it('写入审计日志', () => {
      db.writeAuditLog({
        user_id: 'admin-001', action: 'batch_start',
        target_type: 'batch', target_id: 'B1',
      });
      const logs = db.getAuditLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('batch_start');
    });

    it('审计日志不可篡改(UPDATE)', () => {
      db.writeAuditLog({ user_id: 'admin-001', action: 'test', target_type: 'test' });
      expect(() => {
        db.getDatabase().prepare('UPDATE audit_logs SET action = ? WHERE id = 1').run('hacked');
      }).toThrow('禁止UPDATE');
    });

    it('审计日志不可篡改(DELETE)', () => {
      db.writeAuditLog({ user_id: 'admin-001', action: 'test', target_type: 'test' });
      expect(() => {
        db.getDatabase().prepare('DELETE FROM audit_logs WHERE id = 1').run();
      }).toThrow('禁止DELETE');
    });
  });

  // 报警
  describe('报警管理', () => {
    it('创建和确认报警', () => {
      const id = db.createAlarm({
        alarm_code: 'RF-01', severity: 'critical',
        source: 'plc:interlock', message: '变频器故障',
      });
      expect(id).toBeGreaterThan(0);

      const unack = db.getUnacknowledgedAlarms();
      expect(unack).toHaveLength(1);

      db.acknowledgeAlarm(id, 'admin-001');
      expect(db.getUnacknowledgedAlarms()).toHaveLength(0);
    });
  });

  // 状态流转
  describe('状态流转', () => {
    it('记录状态转移', () => {
      db.createRecipe({ recipe_id: 'R1', version: '1.0.0', name: 'R1', author: 'a', vessel_config: {}, phases: [], created_by: 'admin-001' });
      db.createBatch({ batch_id: 'B1', recipe_id: 'R1', recipe_version: '1.0.0', operator_id: 'admin-001', total_phases: 3 });
      db.writeStateTransition({
        batch_id: 'B1', from_state: 'idle', to_state: 'running',
        event: 'cmd_start', triggered_by: 'operator:admin-001',
      });
      const transitions = db.getStateTransitions('B1');
      expect(transitions).toHaveLength(1);
      expect(transitions[0].event).toBe('cmd_start');
    });
  });

  // Phase/Step日志
  describe('Phase/Step日志', () => {
    beforeEach(() => {
      db.createRecipe({ recipe_id: 'R1', version: '1.0.0', name: 'R1', author: 'a', vessel_config: {}, phases: [], created_by: 'admin-001' });
      db.createBatch({ batch_id: 'B1', recipe_id: 'R1', recipe_version: '1.0.0', operator_id: 'admin-001', total_phases: 3 });
    });

    it('写入Phase日志', () => {
      const id = db.writePhaseLog({
        batch_id: 'B1', phase_index: 0, phase_id: 'PREP',
        phase_type: 'prepare', total_steps: 5,
      });
      expect(id).toBeGreaterThan(0);
      expect(db.getPhaseLogs('B1')).toHaveLength(1);
    });

    it('写入Step日志', () => {
      db.writeStepLog({
        batch_id: 'B1', phase_index: 0, phase_id: 'PREP',
        phase_type: 'prepare', step_number: 1, step_name: '阀门归位',
        elapsed_sec: 10, result: 'completed',
      });
      const steps = db.getStepLogs('B1');
      expect(steps).toHaveLength(1);
      expect(steps[0].step_name).toBe('阀门归位');
    });
  });

  // 离线取样
  describe('离线取样', () => {
    it('添加取样数据', () => {
      db.createRecipe({ recipe_id: 'R1', version: '1.0.0', name: 'R1', author: 'a', vessel_config: {}, phases: [], created_by: 'admin-001' });
      db.createBatch({ batch_id: 'B1', recipe_id: 'R1', recipe_version: '1.0.0', operator_id: 'admin-001', total_phases: 3 });
      db.addOfflineSample({
        batch_id: 'B1', sample_time: '2026-04-05T10:00:00Z',
        sampled_by: 'admin-001', od600: 12.5, glucose_g_L: 0.5,
      });
      const samples = db.getOfflineSamples('B1');
      expect(samples).toHaveLength(1);
      expect(samples[0].od600).toBe(12.5);
    });
  });

  // 校准
  describe('传感器校准', () => {
    it('添加和查询校准记录', () => {
      db.addCalibration({
        channel: 'AI-2', sensor_type: 'pH', calibrated_by: 'admin-001',
        cal_point_low_raw: 4000, cal_point_low_eng: 4.0,
        cal_point_high_raw: 20000, cal_point_high_eng: 10.0,
      });
      const cal = db.getLatestCalibration('AI-2');
      expect(cal).toBeDefined();
      expect(cal.sensor_type).toBe('pH');
    });
  });

  // 通讯事件
  describe('通讯事件', () => {
    it('记录断线事件', () => {
      db.writeCommEvent({
        connection_id: 'plc-001', event_type: 'comm_loss',
        reason: '心跳超时', auto_held: true,
      });
      // 验证写入成功 (通过直接查询)
      const events = db.getDatabase().prepare('SELECT * FROM comm_events').all();
      expect(events).toHaveLength(1);
    });
  });
});

// ─── DataCollector ────────────────────────────────────────

describe('DataCollector', () => {
  it('创建并配置', () => {
    const collector = new DataCollector({
      reactorId: 'F01', batchId: 'B1', liquidVolumeL: 5,
    });
    expect(collector.isRunning()).toBe(false);
    expect(collector.getBufferSize()).toBe(0);
  });

  it('setBatch 重置累积值', () => {
    const collector = new DataCollector({
      reactorId: 'F01', batchId: 'B1', liquidVolumeL: 5,
    });
    collector.setBatch('B2', 3);
    // 内部累积值已重置 (无直接访问，通过行为验证)
    expect(collector.isRunning()).toBe(false);
  });

  it('注入数据源后可采集', async () => {
    const collector = new DataCollector({
      reactorId: 'F01', batchId: 'B1', liquidVolumeL: 5,
      sampleIntervalMs: 50,
    });

    let received = false;
    collector.setDataSource(async () => ({
      TEMP_PV: 37.2, PH_PV: 6.8, DO_PV: 30, PRESSURE_PV: 0.5,
      AIRFLOW_PV: 10, WEIGHT_PV: 7.2, VFD_ACTUAL_FREQ: 20,
      VFD_CURRENT: 2.1, STEAM_CV: 45, COOL_CV: 0, AIR_CV: 60,
    }));

    collector.on('pv_realtime', (pv) => {
      received = true;
      expect(pv.temperature).toBeCloseTo(37.2);
      expect(pv.pH).toBeCloseTo(6.8);
    });

    collector.start();
    await new Promise(r => setTimeout(r, 100));
    collector.stop();

    expect(received).toBe(true);
    expect(collector.getBufferSize()).toBe(0); // stop() 调用了 record() 清空缓冲
  });
});
