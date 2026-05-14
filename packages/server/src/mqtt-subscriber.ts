// MQTT Subscriber — FUXA / 外部 HMI → BIOCore (M3 Level 3). 订阅 biocore/commands/+ :
//   write_intent → ai_suggestions + audit_logs + WS;  view_change / device_config_change /
//   alarm_ack → audit_logs;  user_login → 仅 log.
// 硬约束: AI / HMI 永不直写 PLC, 一律走"建议-人工确认-engine 下发".

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

// FUXA view 编辑/保存事件 payload
interface ViewChangePayload {
  user_id?: string;
  view_id: string;
  action?: 'create' | 'update' | 'delete';
  changes_summary?: string;
  batch_id?: string;
}

// FUXA device 配置变更事件 payload
interface DeviceConfigChangePayload {
  user_id?: string;
  device_id: string;
  action?: string;
  field?: string;
  old_value?: unknown;
  new_value?: unknown;
  batch_id?: string;
}

// HMI 端报警确认事件 payload
interface AlarmAckPayload {
  user_id?: string;
  alarm_id: string;
  batch_id?: string;
}

// FUXA 端用户活动指示 payload (仅 log, 不入 DB)
interface UserLoginPayload {
  user_id?: string;
  session_id?: string;
  action?: 'login' | 'logout' | 'activity';
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
        switch (cmd) {
          case 'write_intent':
            handleWriteIntent(msg as WriteIntentPayload, opts);
            break;
          case 'view_change':
            handleViewChange(msg as ViewChangePayload, opts);
            break;
          case 'device_config_change':
            handleDeviceConfigChange(msg as DeviceConfigChangePayload, opts);
            break;
          case 'alarm_ack':
            handleAlarmAck(msg as AlarmAckPayload, opts);
            break;
          case 'user_login':
            handleUserLogin(msg as UserLoginPayload);
            break;
          default:
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

// ─── 公共审计辅助: 仅写 audit_logs, 不入 ai_suggestions / 不广播 WS ───

interface HmiAuditMessage {
  user_id?: string;
  batch_id?: string;
  target_id?: string;
  view_id?: string;
  device_id?: string;
  alarm_id?: string;
  old_value?: unknown;
  new_value?: unknown;
  reasoning?: string;
  changes_summary?: string;
}

function recordHmiAudit(
  deps: MqttSubscriberOptions,
  msg: HmiAuditMessage,
  action: string,
  target_type: string,
): void {
  const targetId =
    msg.target_id || msg.view_id || msg.device_id || msg.alarm_id;
  deps.sqlite.writeAuditLog({
    user_id: msg.user_id || 'hmi-anonymous',
    action,
    target_type,
    target_id: targetId,
    batch_id: msg.batch_id,
    old_value: msg.old_value != null ? String(msg.old_value) : undefined,
    new_value: msg.new_value != null ? String(msg.new_value) : undefined,
    reason: msg.reasoning || msg.changes_summary,
  });
}

// ─── FUXA view 编辑/保存 → 仅审计 ───
function handleViewChange(msg: ViewChangePayload, deps: MqttSubscriberOptions) {
  if (!msg.view_id) {
    console.warn(`[MQTT-Sub] view_change 缺 view_id, 丢弃`);
    return;
  }
  try {
    recordHmiAudit(deps, msg, 'fuxa_view_change', 'hmi_view');
    console.log(`[MQTT-Sub] view_change → audit (view=${msg.view_id} action=${msg.action || 'update'})`);
  } catch (e) {
    console.warn(`[MQTT-Sub] 处理 view_change 失败: ${(e as Error).message}`);
  }
}

// ─── FUXA device 配置变更 → 仅审计 (记录 old/new 用于回溯) ───
function handleDeviceConfigChange(
  msg: DeviceConfigChangePayload,
  deps: MqttSubscriberOptions,
) {
  if (!msg.device_id) {
    console.warn(`[MQTT-Sub] device_config_change 缺 device_id, 丢弃`);
    return;
  }
  try {
    // 把 field 拼进 reason, 便于审计页阅读
    const reason = msg.field
      ? `field=${msg.field}${msg.action ? ` action=${msg.action}` : ''}`
      : msg.action;
    recordHmiAudit(
      deps,
      { ...msg, reasoning: reason },
      'fuxa_device_config_change',
      'hmi_device',
    );
    console.log(
      `[MQTT-Sub] device_config_change → audit (device=${msg.device_id} field=${msg.field || '-'})`,
    );
  } catch (e) {
    console.warn(`[MQTT-Sub] 处理 device_config_change 失败: ${(e as Error).message}`);
  }
}

// ─── HMI 端报警确认 → 仅审计来源 (不调 BIOCore acknowledge API, 前端已调过) ───
function handleAlarmAck(msg: AlarmAckPayload, deps: MqttSubscriberOptions) {
  if (!msg.alarm_id) {
    console.warn(`[MQTT-Sub] alarm_ack 缺 alarm_id, 丢弃`);
    return;
  }
  try {
    recordHmiAudit(deps, msg, 'fuxa_alarm_ack', 'alarm');
    console.log(`[MQTT-Sub] alarm_ack → audit (alarm=${msg.alarm_id} user=${msg.user_id || 'hmi-anonymous'})`);
  } catch (e) {
    console.warn(`[MQTT-Sub] 处理 alarm_ack 失败: ${(e as Error).message}`);
  }
}

// ─── FUXA 端用户活动心跳 → 仅 log (避免 audit_logs 噪音) ───
function handleUserLogin(msg: UserLoginPayload) {
  const user = msg.user_id || 'hmi-anonymous';
  const session = msg.session_id ? ` session=${msg.session_id}` : '';
  console.log(`[MQTT-Sub] user_login → ${user} ${msg.action || 'activity'}${session}`);
}
