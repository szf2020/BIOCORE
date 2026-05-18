// ============================================================
// ws-server — WebSocketServer setup + connection auth + broadcast
// ============================================================
// Extracted from index.ts (v1.9.0 P2 bucket 1).
//
// createWsServer() builds a WebSocketServer attached to a given http
// server, wires the connection-time auth gate (JWT token / API key /
// AUTH_ENABLED=false dev fallback), and returns the server instance
// plus a hardened broadcast() helper.
//
// broadcast() preserves v1.7.1 hardening: per-client try/catch around
// ws.send() so a single misbehaving client cannot bubble synchronous
// throws into BatchController EventEmitter listeners and trip
// runtime-guard's uncaughtException handler.
// ============================================================

import http from 'http';
import { timingSafeEqual } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type Database from 'better-sqlite3';

import { hashApiKey } from './middlewares/auth';
import type { MqttPublisher } from './mqtt-publisher';

// SP-FX-47 F-06 (HIGH): timing-safe API Key hash 比较，防止 timing attack。
// hashApiKey 输出固定 64-char hex (SHA-256)；防御性处理长度不等情况。
export function safeCompareApiKeyHash(computed: string, stored: string): boolean {
  if (!computed || !stored) return false;
  const bufA = Buffer.from(computed);
  const bufB = Buffer.from(stored);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type BroadcastFn = (
  channel: string,
  payload: any,
  batchId?: string | null,
  reactorId?: string | null,
) => void;

export interface WsServerHandles {
  wss: WebSocketServer;
  broadcast: BroadcastFn;
}

export interface CreateWsServerOptions {
  server: http.Server;
  sqlite: { getDatabase: () => Database.Database };
  verifyJWT: (token: string) => Record<string, any> | null;
  authEnabled: boolean;
  mqttPublisher?: MqttPublisher;   // 可选: 提供时所有 broadcast 自动 mirror 到 MQTT topic
}

export function createWsServer(opts: CreateWsServerOptions): WsServerHandles {
  const { server, sqlite, verifyJWT, authEnabled, mqttPublisher } = opts;

  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcast: BroadcastFn = (channel, payload, batchId, reactorId) => {
    // 镜像到 MQTT (fire-and-forget, 失败不阻塞 WS 主路径)
    if (mqttPublisher) {
      try {
        mqttPublisher.publish(channel, payload, batchId, reactorId);
      } catch (e) {
        console.warn(`[MQTT-mirror] publish 失败 channel=${channel}: ${(e as Error).message}`);
      }
    }

    const msg = JSON.stringify({
      channel,
      timestamp: new Date().toISOString(),
      batch_id: batchId ?? null,
      reactor_id: reactorId ?? null,
      payload,
    });
    // v1.7.1 hardening: ws.send() can throw synchronously when the underlying
    // socket is half-closed or its send buffer is exhausted. The broadcast()
    // helper is invoked from EventEmitter listeners (phase_started /
    // phase_completed / branch_evaluated) — letting an exception escape would
    // bubble through ctrl.emit() into readyNextPhase() and trip runtime-guard's
    // uncaughtException handler, taking the whole server down for a single
    // misbehaving WS client. Wrap each per-client send so one bad client cannot
    // crash the engine.
    wss.clients.forEach(client => {
      if (client.readyState !== WebSocket.OPEN) return;
      try {
        client.send(msg);
      } catch (e) {
        console.warn(`[WS] broadcast send failed (channel=${channel}):`, (e as Error).message);
      }
    });
  };

  // WS 鉴权:
  //   - 客户端连接 ws://localhost:3001/ws?token=<JWT>  (前端 UI)
  //   - 或 ws://localhost:3001/ws?api_key=<rawKey>     (MES/外部系统)
  //   - 或 X-API-Key header 方式 (但 WebSocket 标准不推荐 header)
  //   - 鉴权失败 close(1008, 'Unauthorized')
  //   - 开发回退: AUTH_ENABLED=false 时跳过验证 (与 HTTP middleware 一致)
  wss.on('connection', (ws, req) => {
    const remoteIp = req.socket.remoteAddress;
    let user: any = null;

    if (authEnabled) {
      try {
        const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        const token = url.searchParams.get('token');
        const apiKey = url.searchParams.get('api_key') || (req.headers['x-api-key'] as string | undefined);

        if (apiKey) {
          // 验证 API Key
          const dotIdx = apiKey.indexOf('.');
          if (dotIdx > 0) {
            const keyId = apiKey.slice(0, dotIdx);
            const rawKey = apiKey.slice(dotIdx + 1);
            const row: any = sqlite.getDatabase().prepare(
              'SELECT key_hash, salt, scopes FROM api_keys WHERE key_id = ? AND revoked = 0'
            ).get(keyId);
            // SP-FX-47 F-06: 使用 timingSafeEqual 防止 timing attack
            if (row && safeCompareApiKeyHash(hashApiKey(rawKey, row.salt), row.key_hash)) {
              user = { user_id: `apikey:${keyId}`, role: 'service' };
              sqlite.getDatabase().prepare('UPDATE api_keys SET last_used_at = datetime("now") WHERE key_id = ?').run(keyId);
            }
          }
        } else if (token) {
          const payload = verifyJWT(token);
          if (payload) user = payload;
        }
      } catch { /* parse error → user 仍为 null */ }

      if (!user) {
        console.warn(`[${new Date().toISOString()}] [WARN] [WS] 未授权连接拒绝: ${remoteIp}`);
        ws.close(1008, 'Unauthorized');
        return;
      }
    } else {
      // 开发模式回退
      user = { user_id: 'admin-001', role: 'admin' };
    }

    (ws as any).user = user;
    console.log(`[${new Date().toISOString()}] [INFO] [WS] 客户端连接 user=${user.user_id} from=${remoteIp} (总数: ${wss.clients.size})`);
    ws.on('close', () => console.log(`[${new Date().toISOString()}] [INFO] [WS] 客户端断开 user=${user.user_id} (剩余: ${wss.clients.size})`));
  });

  return { wss, broadcast };
}
