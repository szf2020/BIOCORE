"use strict";
// ============================================================
// comm-watchdog.ts — 通讯断线监控与状态机联动
//
// 职责:
//   监听 plc-driver 的 comm_loss / comm_restored 事件
//   断线 → 状态机自动进入 Held (hold_reason = '通讯断开')
//   恢复 → 发出 comm_restored 事件, 但不自动恢复Running
//          (需操作员确认后手动 cmd_restart)
//
// PLC端行为 (PLC梯形图独立实现, 不依赖本模块):
//   VB400 连续3秒不变 → PLC进入安全驻留:
//     - 补料泵全停
//     - 搅拌降速至200rpm (维持最低搅拌防止沉降)
//     - 温度PID继续运行 (防止培养物冻死/过热)
//     - pH PID继续运行
//     - DO级联暂停, 通气维持当前值
//   VB400 恢复变化 → PLC自动退出安全驻留, 等待上位机指令
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommWatchdog = void 0;
const events_1 = require("events");
class CommWatchdog extends events_1.EventEmitter {
    plc;
    config;
    holdStartTime = null;
    safetyTimer = null;
    commLost = false;
    constructor(plc, config) {
        super();
        this.plc = plc;
        this.config = {
            autoRestartOnRestore: config?.autoRestartOnRestore ?? false,
            maxSafeHoldDuration_s: config?.maxSafeHoldDuration_s ?? 3600,
        };
        this.bindEvents();
    }
    bindEvents() {
        // ── 通讯断开 → 触发状态机 Hold ──
        this.plc.on('comm_loss', (detail) => {
            if (this.commLost)
                return; // 避免重复触发
            this.commLost = true;
            this.holdStartTime = Date.now();
            // 发送自动Hold命令给batch-engine
            this.emit('auto_hold', {
                reason: `PLC通讯断开: ${detail.reason}`,
                triggered_by: 'watchdog:comm_loss',
                connection_id: detail.id,
                timestamp: new Date().toISOString(),
            });
            // 启动安全超时计时器
            this.safetyTimer = setTimeout(() => {
                this.emit('safety_timeout', {
                    reason: `通讯断开超过${this.config.maxSafeHoldDuration_s}秒, 触发安全停机`,
                    triggered_by: 'watchdog:safety_timeout',
                    hold_duration_s: this.config.maxSafeHoldDuration_s,
                });
            }, this.config.maxSafeHoldDuration_s * 1000);
        });
        // ── 通讯恢复 ──
        this.plc.on('comm_restored', (detail) => {
            if (!this.commLost)
                return;
            this.commLost = false;
            const holdDuration = this.holdStartTime
                ? Math.round((Date.now() - this.holdStartTime) / 1000)
                : 0;
            this.holdStartTime = null;
            // 清除安全超时计时器
            if (this.safetyTimer) {
                clearTimeout(this.safetyTimer);
                this.safetyTimer = null;
            }
            this.emit('comm_restored', {
                connection_id: detail.id,
                downtime_s: detail.downtime_s,
                hold_duration_s: holdDuration,
                auto_restart: this.config.autoRestartOnRestore,
                timestamp: new Date().toISOString(),
            });
            // 可选: 自动恢复 (生产环境建议关闭, 让操作员手动确认)
            if (this.config.autoRestartOnRestore) {
                this.emit('auto_restart', {
                    reason: '通讯恢复, 自动Restart',
                    triggered_by: 'watchdog:auto_restart',
                });
            }
        });
        // ── 重连状态 ──
        this.plc.on('reconnecting', () => {
            this.emit('status_change', { status: 'reconnecting' });
        });
        this.plc.on('reconnected', () => {
            this.emit('status_change', { status: 'reconnected' });
        });
    }
    isCommLost() {
        return this.commLost;
    }
    getHoldDuration() {
        if (!this.holdStartTime)
            return 0;
        return Math.round((Date.now() - this.holdStartTime) / 1000);
    }
    destroy() {
        if (this.safetyTimer)
            clearTimeout(this.safetyTimer);
        this.removeAllListeners();
    }
}
exports.CommWatchdog = CommWatchdog;
// ─── PLC 梯形图心跳程序参考 (伪代码, 供自控工程师实现) ──────
//
// (* PLC梯形图: 心跳监控与安全驻留 *)
// (* 放在OB1主程序中, 每个扫描周期执行 *)
//
// NETWORK 1 — PLC端心跳输出 (每秒递增VB401)
//   T37 (1秒定时器) → VB401 := (VB401 + 1) MOD 256
//
// NETWORK 2 — 监测PC端心跳 (VB400)
//   IF VB400 == VB400_LastScan THEN
//     VW402 := VW402 + 1              (* 计数器: PC心跳未变次数 *)
//   ELSE
//     VW402 := 0                       (* 重置计数器 *)
//     VB400_LastScan := VB400          (* 记录当前值 *)
//   END_IF
//
// NETWORK 3 — 安全驻留判定
//   IF VW402 >= 3 THEN                 (* PC心跳连续3秒未更新 *)
//     V500.0 := TRUE                   (* 安全驻留标志位 *)
//   ELSE
//     V500.0 := FALSE
//   END_IF
//
// NETWORK 4 — 安全驻留动作
//   IF V500.0 = TRUE THEN
//     Q0.0 := OFF                      (* 补碱泵停 *)
//     Q0.1 := OFF                      (* 补料泵停 *)
//     Q0.2 := OFF                      (* 氮源泵停 *)
//     Q0.3 := OFF                      (* 补酸泵停 *)
//     VFD_SV := 200                    (* 搅拌降至200rpm *)
//     (* 温度PID_01/02 继续运行 — 维持培养温度 *)
//     (* pH PID_06/07 继续运行 — 维持培养pH *)
//     (* DO级联暂停, 通气维持当前阀位 *)
//   END_IF
//# sourceMappingURL=comm-watchdog.js.map