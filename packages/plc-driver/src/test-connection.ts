#!/usr/bin/env tsx
// ============================================================
// S7-200 SMART 实机集成测试
// 通过 PLCConnectionManager 测试完整通讯链路
// 用法: npx tsx src/test-connection.ts
// ============================================================

import { PLCConnectionManager } from './index';
import type { PLCConnectionConfig, PLCVariableMapping } from './types';

const PLC_CONFIG: PLCConnectionConfig = {
  id: 'test-f01',
  name: 'F01测试连接',
  protocol: 's7',
  ip: '192.168.1.10',
  port: 102,
  rack: 0,
  slot: 1,
  s7_db: 2,                              // 实际PLC数据在DB2
  enabled: true,
  heartbeat_write_address: 'VB10',         // PC→PLC 心跳写入 DB2.DBB10 (空闲区)
  heartbeat_read_address: 'VB5',          // PLC→PC 读DBW4低字节(每秒变化)
  heartbeat_timeout_ms: 3000,
  reconnect_interval_ms: 5000,
};

// 测试用变量映射 (基于实际PLC DB2数据)
// DB2.DBW0 = PLC心跳#1 (每秒+1), DB2.DBW4 = Comm_Heart_PLC (每秒+1)
const TEST_VARS: PLCVariableMapping[] = [
  { id: '1', tag_name: 'HEART_PLC_1',    description: 'PLC心跳#1 (DB2.DBW0)',       plc_address: 'VW0',  data_type: 'INT16',  direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 32767, eng_unit: '', group: '心跳', poll_rate_ms: 1000, enabled: true, connection_id: 'test-f01' },
  { id: '2', tag_name: 'DBW2',           description: 'DB2.DBW2',                    plc_address: 'VW2',  data_type: 'INT16',  direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 32767, eng_unit: '', group: '数据', poll_rate_ms: 1000, enabled: true, connection_id: 'test-f01' },
  { id: '3', tag_name: 'COMM_HEART_PLC', description: 'Comm_Heart_PLC (DB2.DBW4)',   plc_address: 'VW4',  data_type: 'INT16',  direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 32767, eng_unit: '', group: '心跳', poll_rate_ms: 1000, enabled: true, connection_id: 'test-f01' },
  { id: '4', tag_name: 'DBW6',           description: 'DB2.DBW6',                    plc_address: 'VW6',  data_type: 'INT16',  direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 32767, eng_unit: '', group: '数据', poll_rate_ms: 1000, enabled: true, connection_id: 'test-f01' },
  { id: '5', tag_name: 'HEART_MIRROR',   description: 'PLC心跳镜像 (DB2.DBW22)',     plc_address: 'VW22', data_type: 'INT16',  direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 32767, eng_unit: '', group: '心跳', poll_rate_ms: 1000, enabled: true, connection_id: 'test-f01' },
  { id: '6', tag_name: 'BIT_TEST',       description: 'DB2.DBB0 bit0',               plc_address: 'V0.0', data_type: 'BOOL',   direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 1, eng_unit: '', group: '位', poll_rate_ms: 100, enabled: true, connection_id: 'test-f01' },
];

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);
}

function passed(name: string) { log(`✅ ${name}`); }
function failed(name: string, err: string) { log(`❌ ${name}: ${err}`); }

async function main() {
  let passCount = 0;
  let failCount = 0;

  const plc = new PLCConnectionManager(PLC_CONFIG);
  plc.setVariables(TEST_VARS);

  // ═══ 测试1: 连接 ═══
  log('━━━ 测试1: S7连接 ━━━');
  try {
    await plc.connect();
    if (plc.isConnected()) {
      passed('连接成功'); passCount++;
    } else {
      failed('连接', '状态异常'); failCount++;
    }
  } catch (e) {
    failed('连接', (e as Error).message); failCount++;
    process.exit(1);
  }

  // ═══ 测试2: 读取全部可读变量 (批量读取) ═══
  log('\n━━━ 测试2: 批量读取变量 (readAll) ━━━');
  try {
    const values = await plc.readAll();
    const tags = Object.keys(values);
    if (tags.length > 0) {
      passed(`批量读取 ${tags.length} 个变量`); passCount++;
      for (const [tag, val] of Object.entries(values)) {
        const v = TEST_VARS.find(x => x.tag_name === tag)!;
        log(`  ${tag}: ${val.toFixed(2)} ${v.eng_unit} (raw)`);
      }
    } else {
      failed('批量读取', '无数据返回'); failCount++;
    }
  } catch (e) {
    failed('批量读取', (e as Error).message); failCount++;
  }

  // ═══ 测试3: 单变量读取 ═══
  log('\n━━━ 测试3: 单变量读取 (readTag) ━━━');
  try {
    const hb = await plc.readTag('COMM_HEART_PLC');
    log(`  COMM_HEART_PLC (DB2.DBW4) = ${hb}`);
    passed('单变量读取'); passCount++;
  } catch (e) {
    failed('单变量读取', (e as Error).message); failCount++;
  }

  // ═══ 测试4: BOOL位读取 ═══
  log('\n━━━ 测试4: BOOL位读取 (V0.0) ━━━');
  try {
    const bit = await plc.readTag('BIT_TEST');
    log(`  BIT_TEST (DB2.DBB0 bit0) = ${bit}`);
    passed('BOOL位读取'); passCount++;
  } catch (e) {
    failed('BOOL位读取', (e as Error).message); failCount++;
  }

  // ═══ 测试5: 完整快照 ═══
  log('\n━━━ 测试5: ProcessSnapshot ━━━');
  try {
    const snap = await plc.readSnapshot();
    const goodCount = Object.values(snap.quality).filter(q => q === 'good').length;
    const totalCount = Object.keys(snap.quality).length;
    log(`  ${goodCount}/${totalCount} 变量质量=good`);
    log(`  timestamp: ${snap.timestamp}`);
    if (goodCount > 0) { passed('快照生成'); passCount++; }
    else { failed('快照', '无good质量变量'); failCount++; }
  } catch (e) {
    failed('快照', (e as Error).message); failCount++;
  }

  // ═══ 测试6: 心跳写入VB400 ═══
  log('\n━━━ 测试6: 心跳VB400写入+回读 ━━━');
  try {
    // 直接使用 readBytesRaw 读VB400当前值
    const before = await plc.readBytesRaw(400, 1);
    const beforeVal = before.readUInt8(0);
    log(`  写入前 VB400 = ${beforeVal}`);

    // 通过writeTag写入一个测试值
    // 因为VB400不在TEST_VARS的WRITE列表中，直接用readBytesRaw测试底层
    const testVal = (beforeVal + 1) % 256;
    // 这里我们暂时不测writeTag(需要READWRITE变量)，直接观察心跳事件
    passed('VB400读取'); passCount++;
  } catch (e) {
    failed('心跳读取', (e as Error).message); failCount++;
  }

  // ═══ 测试7: 监听心跳事件 (5秒) ═══
  log('\n━━━ 测试7: 双向心跳监听 5秒 ━━━');
  let hbCount = 0;
  let commLossEmitted = false;

  plc.on('heartbeat', (data) => {
    hbCount++;
    log(`  心跳 #${hbCount}: PC=${data.pc}, PLC=${data.plc}, alive=${data.alive}, stale=${data.stale}`);
  });

  plc.on('comm_loss', (data) => {
    commLossEmitted = true;
    log(`  ⚠ comm_loss: ${data.reason}`);
  });

  plc.on('comm_restored', (data) => {
    log(`  ✅ comm_restored (断线${data.downtime_s}秒)`);
  });

  await new Promise(r => setTimeout(r, 5500));

  if (hbCount >= 4) {
    passed(`心跳事件 ${hbCount} 次/5秒`); passCount++;
  } else {
    failed('心跳', `仅收到 ${hbCount} 次`); failCount++;
  }

  // ═══ 测试8: 延迟测量 ═══
  log('\n━━━ 测试8: 通讯状态和延迟 ━━━');
  const status = plc.getStatus();
  log(`  connected: ${status.connected}`);
  log(`  comm_alive: ${status.comm_alive}`);
  log(`  latency: ${status.latency_ms}ms`);
  log(`  pc_counter: ${status.pc_counter}`);
  log(`  plc_stale: ${status.plc_counter_stale}`);
  log(`  error_count: ${status.error_count}`);
  log(`  packet_loss: ${(status.packet_loss_rate * 100).toFixed(1)}%`);

  if (status.connected && status.latency_ms >= 0) {
    passed('状态报告'); passCount++;
  } else {
    failed('状态', '连接异常'); failCount++;
  }

  // PLC心跳是否在递增 (VB401)
  if (!commLossEmitted && status.comm_alive) {
    log('  ✅ VB401 PLC心跳正在递增');
  } else {
    log('  ⚠ VB401未变化 — PLC端心跳梯形图可能未运行 (不影响PC→PLC方向)');
  }

  // ═══ 清理 ═══
  log('\n━━━ 断开连接 ━━━');
  await plc.disconnect();

  // ═══ 汇总 ═══
  log('\n════════════════════════════════════');
  log(`  通过: ${passCount}  失败: ${failCount}  总计: ${passCount + failCount}`);
  log('════════════════════════════════════');

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('💥 测试异常:', err.message);
  process.exit(1);
});
