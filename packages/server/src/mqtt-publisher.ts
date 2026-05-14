// ============================================================
// MQTT Publisher — BIOCore tag/event 镜像到 MQTT broker
// 阶段 W2: FUXA (及其他订阅者) 通过 MQTT 实时消费 BIOCore 内部事件
// 接入点: ws-server.ts broadcast() 内同步调用 publish, fire-and-forget
// 不阻塞 WS 主路径, 失败仅 warn
// ============================================================

import mqtt, { MqttClient } from 'mqtt';

export interface MqttPublisher {
  publish: (channel: string, payload: any, batchId?: string | null, reactorId?: string | null) => void;
  close: () => Promise<void>;
  isConnected: () => boolean;
}

export interface MqttPublisherOptions {
  brokerUrl?: string;       // 默认 mqtt://localhost:1883
  clientId?: string;        // 默认 biocore-server-<random>
  topicPrefix?: string;     // 默认 'biocore'
  enabled?: boolean;        // 默认 true; false 时返回 no-op 实现
}

/**
 * 创建 MQTT 发布器. 内置自动重连, 连接失败不抛错 (仅 warn).
 * Topic 命名:
 *   - reactorId 存在: biocore/reactor/{reactorId}/{channel}
 *   - reactorId 为空: biocore/system/{channel}
 * Payload: 原 WS payload 的 JSON 字符串, 含 timestamp/batch_id 包装
 */
export function createMqttPublisher(opts: MqttPublisherOptions = {}): MqttPublisher {
  const enabled = opts.enabled !== false;
  const brokerUrl = opts.brokerUrl || process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  const topicPrefix = opts.topicPrefix || 'biocore';
  const clientId = opts.clientId || `biocore-server-${Math.random().toString(36).slice(2, 10)}`;

  // 禁用模式: 返回 no-op (开发期无 mosquitto 也不影响 server 启动)
  if (!enabled) {
    return {
      publish: () => {},
      close: async () => {},
      isConnected: () => false,
    };
  }

  let client: MqttClient | null = null;
  let connected = false;

  try {
    client = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,           // 不保留会话 (server 端无需 retained sub)
      reconnectPeriod: 5000, // 5s 重连
      connectTimeout: 10000,
      keepalive: 30,
    });

    client.on('connect', () => {
      connected = true;
      console.log(`[MQTT] 已连接 ${brokerUrl} clientId=${clientId}`);
      // Boot beacon: FUXA 等订阅者据此检测 BIOCore 上线
      try {
        client?.publish(`${topicPrefix}/system/boot`, JSON.stringify({
          channel: 'boot',
          timestamp: new Date().toISOString(),
          payload: { clientId, broker: brokerUrl, version: process.env.npm_package_version || 'unknown' },
        }), { qos: 1, retain: true });
      } catch { /* ignore */ }
    });
    client.on('reconnect', () => {
      console.log(`[MQTT] 重连尝试 ${brokerUrl}`);
    });
    client.on('error', (err) => {
      console.warn(`[MQTT] 错误: ${err.message}`);
    });
    client.on('close', () => {
      if (connected) console.log('[MQTT] 连接关闭');
      connected = false;
    });
    client.on('offline', () => {
      connected = false;
    });
  } catch (err) {
    console.warn(`[MQTT] 初始化失败, publisher 降级为 no-op: ${(err as Error).message}`);
    client = null;
  }

  const publish: MqttPublisher['publish'] = (channel, payload, batchId, reactorId) => {
    if (!client || !connected) return; // fire-and-forget, 离线丢弃
    const topic = reactorId
      ? `${topicPrefix}/reactor/${reactorId}/${channel}`
      : `${topicPrefix}/system/${channel}`;
    const msg = JSON.stringify({
      channel,
      timestamp: new Date().toISOString(),
      batch_id: batchId ?? null,
      reactor_id: reactorId ?? null,
      payload,
    });
    try {
      client.publish(topic, msg, { qos: 0, retain: false });
    } catch (e) {
      console.warn(`[MQTT] publish 失败 topic=${topic}: ${(e as Error).message}`);
    }
  };

  const close: MqttPublisher['close'] = () => {
    return new Promise<void>((resolve) => {
      if (!client) return resolve();
      client.end(false, {}, () => resolve());
    });
  };

  const isConnected = () => connected;

  return { publish, close, isConnected };
}
