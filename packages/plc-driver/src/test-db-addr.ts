import { PLCConnectionManager, parseAddr } from './index';

const mgr = new PLCConnectionManager({
  id: 'test', name: 'test', protocol: 's7',
  ip: '192.168.1.10', port: 102, rack: 0, slot: 1, s7_db: 1,
  enabled: true,
  heartbeat_write_address: 'VB10', heartbeat_read_address: 'VB5',
  heartbeat_timeout_ms: 3000, reconnect_interval_ms: 5000,
});

mgr.setVariables([
  { id: '1', tag_name: 'HEART_PLC', description: 'Comm_Heart_PLC', plc_address: 'DB2.DBW4', data_type: 'INT16', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 32767, eng_unit: '', group: '心跳', poll_rate_ms: 1000, enabled: true, connection_id: 'test' },
  { id: '2', tag_name: 'HEART_1', description: 'PLC心跳#1', plc_address: 'DB2.DBW0', data_type: 'INT16', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 32767, eng_unit: '', group: '心跳', poll_rate_ms: 1000, enabled: true, connection_id: 'test' },
  { id: '3', tag_name: 'HEART_MIRROR', description: '心跳镜像', plc_address: 'DB2.DBW22', data_type: 'INT16', direction: 'READ', scaling_enabled: false, raw_min: 0, raw_max: 0, eng_min: 0, eng_max: 32767, eng_unit: '', group: '心跳', poll_rate_ms: 1000, enabled: true, connection_id: 'test' },
]);

async function main() {
  console.log('地址解析测试:');
  console.log('  DB2.DBW4  =>', JSON.stringify(parseAddr('DB2.DBW4')));
  console.log('  DB2.DBX0.3 =>', JSON.stringify(parseAddr('DB2.DBX0.3')));
  console.log('  VW100     =>', JSON.stringify(parseAddr('VW100')));

  await mgr.connect();
  console.log('\n实机读取 (DB2.DBW 格式):');

  for (let i = 0; i < 3; i++) {
    const all = await mgr.readAll();
    console.log(`  第${i + 1}秒: HEART_PLC=${all.HEART_PLC}, HEART_1=${all.HEART_1}, MIRROR=${all.HEART_MIRROR}`);
    if (i < 2) await new Promise(r => setTimeout(r, 1000));
  }

  const snap = await mgr.readSnapshot();
  console.log('\nSnapshot quality:', snap.quality);
  console.log('DB地址格式验证通过');

  await mgr.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
