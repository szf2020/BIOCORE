// ============================================================
// MQTT Subscriber — FUXA / 外部 HMI 写操作 → BIOCore 建议缓冲区
// 阶段 M3 (Level 3): 不修改 FUXA 源码, 通过 MQTT 反向通信
//   FUXA HMI 按钮点击 → setValue → publish biocore/commands/write_intent
//   → BIOCore 订阅接收 → 插入 ai_suggestions 表 (status=pending)
//   → audit_logs 记录 action=hmi_write_intent
//   → WS broadcast 'suggestion_new' 通知操作员
//   → 操作员前端确认 → 现有 /api/v1/ai-suggestions/:id/accept → batch-engine 下发 PLC
//
// 安全约束 (CLAUDE.md 第 7 节硬约束):
//   AI / HMI / 外部系统 永不直写 PLC. 一律走"建议缓冲区"-"人工确认"-"engine 下发".
// ============================================================

import mqtt, { MqttClient } from 'mqtt';
import type { SQLiteService } from '@biocore/data-service';
import type { BroadcastFn } from './ws-server';

export interface MqttSubscriberOptions {
  brokerUrl?: string;
  clientId?: string;
  enabled?: boolean;
  sqlite: SQLiteService;
  broadcast: BroadcastFn;
}

export interface MqttSubscriber {
  close: () => Promise<void>;
  isConnected: () => boolean;
}

interface WriteIntentPayload {
  batch_id?: string;
  target_param: string;
  suggested_value: number;
  user_id?: string;
  source?: string;
  reasoning?: string;
  current_value?: number;
  confidence?: number;
}

export function createMqttSubscriber(opts: MqttSubscriberOptions): MqttSubscriber {
  const enabled = opts.enabled !== false;
  if (!enabled) {
    return { close: async () => {}, isConnected: () => false };
  }

  const brokerUrl = opts.brokerUrl || process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  const clientId = opts.clientId || `biocore-sub-${Math.random().toString(36).slice(2, 10)}`;

  let connected = false;
  let client: MqttClient | null = null;

  try {
    client = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
      keepalive: 30,
    });

    client.on('connect', () => {
      connected = true;
      console.log(`[MQTT-Sub] 已连接 ${brokerUrl} clientId=${clientId}`);
      client?.subscribe('biocore/commands/+', { qos: 1 }, (err) => {
        if (err) console.warn(`[MQTT-Sub] 订阅失败: ${err.message}`);
        else console.log('[MQTT-Sub] 订阅 biocore/commands/+ 成功');
      });
    });

    client.on('error', (err) => console.warn(`[MQTT-Sub] 错误: ${err.message}`));
    client.on('close', () => {
      if (connected) console.log('[MQTT-Sub] 连接关闭');
      connected = false;
    });

    client.on('message', (topic, raw) => {
      if (!topic.startsWith('biocore/commands/')) return;
      const cmd = topic.slice('biocore/commands/'.length);
      try {
        const msg = JSON.parse(raw.toString('utf8'));
        if (cmd === 'write_intent') {
          handleWriteIntent(msg as WriteIntentPayload, opts);
        } else {
          console.warn(`[MQTT-Sub] 未知 command: ${cmd}`);
        }
      } catch (e) {
        console.warn(`[MQTT-Sub] 消息解析失败 topic=${topic}: ${(e as Error).message}`);
      }
    });
  } catch (err) {
    console.warn(`[MQTT-Sub] 初始化失败: ${(err as Error).message}`);
    client = null;
  }

  return {
    close: () => new Promise<void>((resolve) => {
      if (!client) return resolve();
      client.end(false, {}, () => resolve());
    }),
    isConnected: () => connected,
  };
}

/**
 * 处理 FUXA / HMI 写意图.
 * 写 ai_suggestions + audit_logs + WS broadcast. 严格不调 plcWrite.
 */
function handleWriteIntent(msg: WriteIntentPayload, deps: MqttSubscriberOptions) {
  const { sqlite, broadcast } = deps;

  if (!msg.target_param || typeof msg.suggested_value !== 'number') {
    console.warn(`[MQTT-Sub] write_intent 缺必填字段, 丢弃: ${JSON.stringify(msg)}`);
    return;
  }

  const batchId = msg.batch_id || 'idle';
  const userId = msg.user_id || 'hmi-anonymous';
  const source = msg.source || 'fuxa';

  try {
    const suggestionId = sqlite.createSuggestion({
      batch_id: batchId,
      suggestion_type: 'hmi_write',
      source_module: source,
      target_param: msg.target_param,
      current_value: msg.current_value,
      suggested_value: msg.suggested_value,
      confidence: msg.confidence ?? 1.0,
      reasoning: msg.reasoning || `HMI(${source}) 写入意图: ${msg.target_param}=${msg.suggested_value}`,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });

    sqlite.writeAuditLog({
      batch_id: batchId === 'idle' ? undefined : batchId,
      user_id: userId,
      action: 'hmi_write_intent',
      target_type: 'plc_tag',
      target_id: msg.target_param,
      old_value: msg.current_value != null ? String(msg.current_value) : undefined,
      new_value: String(msg.suggested_value),
      reason: msg.reasoning || `via ${source} MQTT`,
    });

    broadcast('suggestion_new', {
      id: suggestionId,
      source,
      target_param: msg.target_param,
      suggested_value: msg.suggested_value,
      batch_id: batchId === 'idle' ? null : batchId,
    }, batchId === 'idle' ? null : batchId, null);

    console.log(`[MQTT-Sub] write_intent → suggestion #${suggestionId} (${msg.target_param}=${msg.suggested_value} from ${source})`);
  } catch (e) {
    console.warn(`[MQTT-Sub] 处理 write_intent 失败: ${(e as Error).message}`);
  }
}
