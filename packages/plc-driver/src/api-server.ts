#!/usr/bin/env tsx
// ============================================================
// PLC 配置 API 服务器 (精简版)
// 连接池复用，避免反复创建/销毁 PLC 连接
// 用法: npx tsx src/api-server.ts
// ============================================================

import http from 'http';
import { URL } from 'url';
import { S7Client } from 'node-snap7';
import { PLCConnectionManager, validateAddr, parseAddr, byteLen, decode, scale } from './index';
import type { PLCConnectionConfig, PLCVariableMapping } from './types';

const PORT = 3001;

// ─── 内存存储 ──────────────────────────────────────────────────

const connections: PLCConnectionConfig[] = [];
const variables: PLCVariableMapping[] = [];

// ─── 只读S7连接 (安全关键) ──────────────────────────────────
// 测试操作使用原生 S7Client 直接读取，绝不写入
// 每个连接用完立即断开，不驻留

const AREA_DB = 0x84;
const WORDLEN_BYTE = 0x02;
let readOnlyBusy = false;  // 全局锁，同一时间只允许一个读取操作

async function readOnlyS7(
  conn: PLCConnectionConfig,
  byteStart: number,
  length: number,
  db: number,
): Promise<Buffer> {
  // 并发控制: 等待上一个读取完成 (最多5秒)
  const deadline = Date.now() + 5000;
  while (readOnlyBusy && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 50));
  }
  if (readOnlyBusy) throw new Error('PLC读取忙，请稍后重试');

  readOnlyBusy = true;
  const client = new S7Client();
  try {
    // S7-200 SMART 必须用 ConnectionType=3
    client.SetConnectionType(3);

    await new Promise<void>((resolve, reject) => {
      client.ConnectTo(conn.ip, conn.rack ?? 0, conn.slot ?? 1, (err: any) => {
        if (err) reject(new Error(`S7连接失败: errCode=${err}`));
        else resolve();
      });
    });

    const buf: Buffer = await new Promise((resolve, reject) => {
      client.ReadArea(AREA_DB, db, byteStart, length, WORDLEN_BYTE, (err: any, data: Buffer) => {
        if (err) reject(new Error(`S7读取 DB${db}.${byteStart} 失败: errCode=${err}`));
        else resolve(data);
      });
    });

    return buf;
  } finally {
    client.Disconnect();
    readOnlyBusy = false;
  }
}

// ─── PC→PLC 心跳写入服务 ───────────────────────────────────────
// 每秒向 PLC 写入递增计数器 (UINT16: 0~65535)
// PLC 端监测此值，连续 N 秒不变 → 触发安全连锁
// 每个连接独立一个心跳线程，使用专用 S7Client

interface HeartbeatState {
  client: S7Client;
  timer: ReturnType<typeof setInterval>;
  counter: number;
  running: boolean;
  connId: string;
  db: number;
  byteAddr: number;
  errors: number;
  lastOk: number;
}

const heartbeats = new Map<string, HeartbeatState>();

async function startHeartbeat(conn: PLCConnectionConfig): Promise<void> {
  // 已在运行则跳过
  if (heartbeats.has(conn.id) && heartbeats.get(conn.id)!.running) {
    return;
  }

  // 校验写入地址
  const writeAddr = conn.heartbeat_write_address;
  const addrValid = validateAddr(writeAddr);
  if (!addrValid.valid) throw new Error(`心跳写入地址无效: ${addrValid.error}`);

  const parsed = parseAddr(writeAddr);
  const db = parsed.db ?? conn.s7_db ?? 1;

  // 创建专用连接
  const client = new S7Client();
  client.SetConnectionType(3);

  await new Promise<void>((resolve, reject) => {
    client.ConnectTo(conn.ip, conn.rack ?? 0, conn.slot ?? 1, (err: any) => {
      if (err) reject(new Error(`心跳连接失败: errCode=${err}`));
      else resolve();
    });
  });

  const state: HeartbeatState = {
    client,
    timer: null as any,
    counter: 0,
    running: true,
    connId: conn.id,
    db,
    byteAddr: parsed.byte,
    errors: 0,
    lastOk: Date.now(),
  };

  // 每秒写入递增值
  // VB addresses are 1-byte; use UInt8 for VB, UInt16 for VW
  const isVBAddr = /^VB\d+$/i.test(writeAddr);
  const writeLen = isVBAddr ? 1 : 2;
  state.timer = setInterval(() => {
    if (!state.running) return;

    const buf = Buffer.alloc(writeLen);
    if (isVBAddr) {
      buf.writeUInt8(state.counter % 256, 0);
    } else {
      buf.writeUInt16BE(state.counter, 0);
    }

    client.WriteArea(AREA_DB, state.db, state.byteAddr, writeLen, WORDLEN_BYTE, buf, (err: any) => {
      if (err) {
        state.errors++;
        console.log(`[心跳] 写入失败 (${conn.name} DB${state.db}.${writeAddr}=${state.counter}): errCode=${err}`);
        // 连续失败超过10次，尝试重连
        if (state.errors > 10) {
          console.log(`[心跳] 连续失败，停止心跳: ${conn.name}`);
          stopHeartbeat(conn.id);
        }
      } else {
        state.errors = 0;
        state.lastOk = Date.now();
      }
    });

    state.counter = (state.counter + 1) % (isVBAddr ? 256 : 65536);
  }, 1000);

  heartbeats.set(conn.id, state);
  console.log(`[心跳] 启动: ${conn.name} → DB${db}.${writeAddr} (0~65535, 每秒+1)`);
}

function stopHeartbeat(connId: string): void {
  const state = heartbeats.get(connId);
  if (!state) return;

  state.running = false;
  clearInterval(state.timer);
  state.client.Disconnect();
  heartbeats.delete(connId);
  console.log(`[心跳] 停止: ${connId}`);
}

function getHeartbeatStatus(connId: string) {
  const state = heartbeats.get(connId);
  if (!state) return { running: false, counter: 0, errors: 0 };
  return {
    running: state.running,
    counter: state.counter,
    errors: state.errors,
    lastOk: new Date(state.lastOk).toISOString(),
  };
}

// ─── 路由工具 ──────────────────────────────────────────────────

function json(res: http.ServerResponse, data: any, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('JSON解析失败')); }
    });
  });
}

// ─── HTTP 服务器 ───────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method || 'GET';

  try {
    // ── PLC 连接 CRUD ──

    if (path === '/api/plc/connections' && method === 'GET') {
      return json(res, connections);
    }

    if (path === '/api/plc/connections' && method === 'POST') {
      const body = await readBody(req);
      const conn: PLCConnectionConfig = {
        id: body.id || crypto.randomUUID(),
        name: body.name || '',
        protocol: body.protocol || 's7',
        ip: body.ip || '192.168.1.10',
        port: body.port || 102,
        rack: body.rack ?? 0,
        slot: body.slot ?? 1,
        s7_db: body.s7_db ?? 1,
        serial_port: body.serial_port,
        baudrate: body.baudrate || 9600,
        parity: body.parity || 'even',
        slave_id: body.slave_id || 1,
        heartbeat_write_address: body.heartbeat_write_address || 'VB400',
        heartbeat_read_address: body.heartbeat_read_address || 'VB401',
        heartbeat_timeout_ms: body.heartbeat_timeout_ms || 3000,
        reconnect_interval_ms: body.reconnect_interval_ms || 5000,
        enabled: body.enabled ?? true,
      };
      const idx = connections.findIndex(c => c.id === conn.id);
      if (idx >= 0) {
        connections[idx] = conn;
      } else {
        connections.push(conn);
      }
      console.log(`[API] 保存连接: ${conn.name} (${conn.ip}, DB${conn.s7_db})`);
      return json(res, conn);
    }

    const connMatch = path.match(/^\/api\/plc\/connections\/([^/]+)$/);
    if (connMatch && method === 'PUT') {
      const body = await readBody(req);
      const id = connMatch[1];
      const idx = connections.findIndex(c => c.id === id);
      if (idx < 0) return json(res, { error: '连接不存在' }, 404);
      connections[idx] = { ...connections[idx], ...body, id };

      return json(res, connections[idx]);
    }

    if (connMatch && method === 'DELETE') {
      const id = connMatch[1];
      const idx = connections.findIndex(c => c.id === id);
      if (idx < 0) return json(res, { error: '连接不存在' }, 404);

      connections.splice(idx, 1);
      for (let i = variables.length - 1; i >= 0; i--) {
        if (variables[i].connection_id === id) variables.splice(i, 1);
      }
      return json(res, { success: true });
    }

    // ── PLC 连接测试 ──

    const testMatch = path.match(/^\/api\/plc\/connections\/([^/]+)\/test$/);
    if (testMatch && method === 'POST') {
      const id = testMatch[1];
      const conn = connections.find(c => c.id === id);
      if (!conn) return json(res, { success: false, message: '连接不存在' });

      // 校验心跳地址
      const hbValid = validateAddr(conn.heartbeat_read_address);
      if (!hbValid.valid) return json(res, { success: false, message: `心跳读取地址无效: ${hbValid.error}` });

      console.log(`[API] 只读测试连接: ${conn.name}`);
      try {
        const parsed = parseAddr(conn.heartbeat_read_address);
        const db = parsed.db ?? conn.s7_db ?? 1;
        const buf = await readOnlyS7(conn, parsed.byte, 2, db);
        const hbVal = buf.readUInt16BE(0);
        return json(res, {
          success: true,
          message: `连接成功! DB${db}.${conn.heartbeat_read_address}=${hbVal}`,
        });
      } catch (e) {
        return json(res, { success: false, message: `连接失败: ${(e as Error).message}` });
      }
    }

    // ── 心跳控制 ──

    const hbStartMatch = path.match(/^\/api\/plc\/connections\/([^/]+)\/heartbeat\/start$/);
    if (hbStartMatch && method === 'POST') {
      const id = hbStartMatch[1];
      const conn = connections.find(c => c.id === id);
      if (!conn) return json(res, { success: false, message: '连接不存在' });
      try {
        await startHeartbeat(conn);
        return json(res, { success: true, message: `心跳已启动: ${conn.heartbeat_write_address}` });
      } catch (e) {
        return json(res, { success: false, message: (e as Error).message });
      }
    }

    const hbStopMatch = path.match(/^\/api\/plc\/connections\/([^/]+)\/heartbeat\/stop$/);
    if (hbStopMatch && method === 'POST') {
      const id = hbStopMatch[1];
      stopHeartbeat(id);
      return json(res, { success: true, message: '心跳已停止' });
    }

    const hbStatusMatch = path.match(/^\/api\/plc\/connections\/([^/]+)\/heartbeat\/status$/);
    if (hbStatusMatch && method === 'GET') {
      return json(res, getHeartbeatStatus(hbStatusMatch[1]));
    }

    // ── 单变量只读测试 (绝不写入PLC) ──

    const varTestMatch = path.match(/^\/api\/plc\/variables\/([^/]+)\/test$/);
    if (varTestMatch && method === 'POST') {
      const body = await readBody(req);
      const v: PLCVariableMapping = body;

      // 安全检查1: 地址格式校验
      const addrValid = validateAddr(v.plc_address, v.data_type);
      if (!addrValid.valid) {
        return json(res, { success: false, message: `地址无效: ${addrValid.error}` });
      }

      const conn = connections.find(c => c.id === v.connection_id);
      if (!conn) return json(res, { success: false, message: '未找到关联的PLC连接' });

      console.log(`[API] 只读测试变量: ${v.tag_name} (${v.plc_address})`);
      try {
        const parsed = parseAddr(v.plc_address);
        const len = byteLen(v.data_type);
        const db = parsed.db ?? conn.s7_db ?? 1;
        const buf = await readOnlyS7(conn, parsed.byte, len, db);
        const raw = decode(buf, v.data_type, parsed.bit);
        const eng = v.scaling_enabled ? scale(raw, v) : raw;

        return json(res, {
          success: true,
          value: Math.round(eng * 100) / 100,
          raw,
          message: `${v.tag_name} = ${eng}${v.eng_unit ? ' ' + v.eng_unit : ''} (raw=${raw})`,
        });
      } catch (e) {
        return json(res, { success: false, message: `读取失败: ${(e as Error).message}` });
      }
    }

    // ── 变量映射 CRUD ──

    if (path === '/api/plc/variables' && method === 'GET') {
      const connId = url.searchParams.get('connection_id');
      const result = connId
        ? variables.filter(v => v.connection_id === connId)
        : variables;
      return json(res, result);
    }

    if (path === '/api/plc/variables' && method === 'POST') {
      const body = await readBody(req);
      const v: PLCVariableMapping = { id: body.id || crypto.randomUUID(), ...body };

      // 保存前强制校验地址
      const addrCheck = validateAddr(v.plc_address, v.data_type);
      if (!addrCheck.valid) {
        return json(res, { error: `地址无效: ${addrCheck.error}` }, 400);
      }

      const idx = variables.findIndex(x => x.id === v.id);
      if (idx >= 0) variables[idx] = v;
      else variables.push(v);
      return json(res, v);
    }

    if (path === '/api/plc/variables' && method === 'PUT') {
      const body = await readBody(req);
      const list: PLCVariableMapping[] = Array.isArray(body) ? body : [];
      const errors: string[] = [];
      for (const v of list) {
        try {
          const idx = variables.findIndex(x => x.id === v.id || x.tag_name === v.tag_name);
          if (idx >= 0) variables[idx] = v;
          else variables.push(v);
        } catch (e) { errors.push(`${v.tag_name}: ${e}`); }
      }
      return json(res, { updated: list.length - errors.length, errors });
    }

    const varMatch = path.match(/^\/api\/plc\/variables\/([^/]+)$/);
    if (varMatch && method === 'PUT') {
      const body = await readBody(req);
      const id = varMatch[1];
      const idx = variables.findIndex(v => v.id === id);
      if (idx < 0) return json(res, { error: '变量不存在' }, 404);
      variables[idx] = { ...body, id };
      return json(res, variables[idx]);
    }

    if (varMatch && method === 'DELETE') {
      const id = varMatch[1];
      const idx = variables.findIndex(v => v.id === id);
      if (idx >= 0) variables.splice(idx, 1);
      return json(res, { success: true });
    }

    // ── 导入导出 ──

    if (path === '/api/plc/export/json' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename=plc_config.json',
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(JSON.stringify({ connections, variables }, null, 2));
    }

    if (path === '/api/plc/export/csv' && method === 'GET') {
      const headers = ['tag_name','description','plc_address','data_type','direction',
        'scaling_enabled','raw_min','raw_max','eng_min','eng_max','eng_unit','group',
        'poll_rate_ms','enabled','connection_id'];
      const rows = variables.map(v =>
        headers.map(h => {
          const val = (v as any)[h];
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : String(val ?? '');
        }).join(',')
      );
      const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename=plc_variables.csv',
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(csv);
    }

    if (path === '/api/plc/import/json' && method === 'POST') {
      const body = await readBody(req);
      let imported = 0;
      for (const c of body.connections || []) {
        const idx = connections.findIndex(x => x.id === c.id);
        if (idx >= 0) connections[idx] = c;
        else connections.push(c);
        imported++;
      }
      for (const v of body.variables || []) {
        const idx = variables.findIndex(x => x.id === v.id);
        if (idx >= 0) variables[idx] = v;
        else variables.push(v);
        imported++;
      }
      return json(res, { imported, errors: [] });
    }

    if (path === '/api/plc/import/csv' && method === 'POST') {
      const body = await readBody(req);
      const list: PLCVariableMapping[] = body.variables || [];
      for (const v of list) {
        v.id = v.id || crypto.randomUUID();
        const idx = variables.findIndex(x => x.tag_name === v.tag_name);
        if (idx >= 0) variables[idx] = v;
        else variables.push(v);
      }
      return json(res, { imported: list.length, errors: [] });
    }

    // ── PLC 状态 ──

    if (path === '/api/plc/status' && method === 'GET') {
      return json(res, {
        read_only_busy: readOnlyBusy,
        connections: connections.map(c => ({ id: c.id, name: c.name })),
      });
    }

    json(res, { error: `未知路由: ${method} ${path}` }, 404);

  } catch (e) {
    console.error(`[API] 错误:`, e);
    json(res, { error: (e as Error).message }, 500);
  }
});

process.on('SIGINT', () => {
  console.log('\n[API] 关闭，停止所有心跳...');
  for (const [id] of heartbeats) stopHeartbeat(id);
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   BIOCore PLC Config API Server              ║
  ║   http://localhost:${PORT}                      ║
  ╠══════════════════════════════════════════════╣
  ║   模式: 只读测试 (绝不写入PLC)             ║
  ║   校验: 地址格式强制检查                   ║
  ╚══════════════════════════════════════════════╝
  `);
});
