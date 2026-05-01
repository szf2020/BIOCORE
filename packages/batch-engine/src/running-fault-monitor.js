"use strict";
// ============================================================
// RunningFaultMonitor — 运行时故障检测 (RF-01 ~ RF-11)
// Running状态下每秒调用 check()，故障时 emit('runningfault')
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunningFaultMonitor = void 0;
const events_1 = require("events");
class RunningFaultMonitor extends events_1.EventEmitter {
    trackers = new Map();
    lastValues = new Map();
    vfdConsecutiveSame = 0;
    vfdLastValue = null;
    // 获取或创建持续计时器
    track(code, condition) {
        let t = this.trackers.get(code);
        if (condition) {
            if (!t || !t.active) {
                t = { active: true, startTime: Date.now() };
                this.trackers.set(code, t);
            }
            return (Date.now() - t.startTime) / 1000;
        }
        else {
            if (t)
                t.active = false;
            return 0;
        }
    }
    // 每秒调用，传入PLC过程值，返回所有触发的故障
    check(pv) {
        const faults = [];
        // RF-01: 变频器故障码非零
        const vfdFault = pv['VFD_FAULT_CODE'] ?? 0;
        if (vfdFault !== 0) {
            faults.push({
                code: 'RF-01', name: '变频器故障',
                faulted: true, detail: `故障码=${vfdFault}`,
                severity: 'critical', holdAction: '搅拌急停',
            });
        }
        // RF-02: VFD通讯超时 (only triggers on actual read failure, not on repeated valid values)
        const vfdFaultRaw = pv['VFD_FAULT_CODE'];
        if (vfdFaultRaw === undefined) {
            // Read failure — treat as communication loss
            this.vfdConsecutiveSame++;
        }
        else {
            // Valid numeric value received — reset counter
            this.vfdConsecutiveSame = 0;
            this.vfdLastValue = vfdFaultRaw;
        }
        if (this.vfdConsecutiveSame >= 3) {
            faults.push({
                code: 'RF-02', name: 'VFD通讯超时',
                faulted: true,
                detail: `VFD连续${this.vfdConsecutiveSame}次相同/无响应 (>3s)`,
                severity: 'critical', holdAction: '搅拌急停',
            });
        }
        // RF-03: 罐温偏差>2°C 持续>3min
        const tempPV = pv['TEMP_PV'] ?? pv['AI-0'];
        const tempSV = pv['TEMP_SV'] ?? pv['AI-0_SV'];
        if (tempPV !== undefined && tempSV !== undefined) {
            const tempDev = Math.abs(tempPV - tempSV);
            const tempDur = this.track('RF-03', tempDev > 2);
            if (tempDur >= 180) {
                faults.push({
                    code: 'RF-03', name: '温度偏差过大',
                    faulted: true, detail: `偏差${tempDev.toFixed(1)}°C持续${Math.round(tempDur)}秒`,
                    severity: 'critical', holdAction: '温度PID继续运行',
                });
            }
        }
        // RF-04: pH偏差>0.5 持续>5min 且泵满速 (P01或P04速率>40mL/h)
        const phPV = pv['PH_PV'] ?? pv['AI-2'];
        const phSV = pv['PH_SV'] ?? pv['AI-2_SV'];
        const pumpFullSpeed = (pv['P01_RATE'] ?? 0) > 40 || (pv['P04_RATE'] ?? 0) > 40;
        if (phPV !== undefined && phSV !== undefined) {
            const phDev = Math.abs(phPV - phSV);
            const phDur = this.track('RF-04', phDev > 0.5 && pumpFullSpeed);
            if (phDur >= 300) {
                faults.push({
                    code: 'RF-04', name: 'pH偏差过大(泵满速)',
                    faulted: true, detail: `偏差${phDev.toFixed(2)}持续${Math.round(phDur)}秒, 泵已满速`,
                    severity: 'critical', holdAction: '补料泵停',
                });
            }
        }
        // RF-05: DO<5% 持续>5min
        const doPV = pv['DO_PV'] ?? pv['AI-3'];
        if (doPV !== undefined) {
            const doDur = this.track('RF-05', doPV < 5);
            if (doDur >= 300) {
                faults.push({
                    code: 'RF-05', name: 'DO过低',
                    faulted: true, detail: `DO=${doPV.toFixed(1)}%持续${Math.round(doDur)}秒`,
                    severity: 'critical', holdAction: '补料泵停',
                });
            }
        }
        // RF-06: 罐压>2.5bar
        const pressure = pv['PRESSURE_PV'] ?? pv['AI-4'];
        if (pressure !== undefined && pressure > 2.5) {
            faults.push({
                code: 'RF-06', name: '罐压过高',
                faulted: true, detail: `罐压=${pressure.toFixed(2)}bar (>2.5bar)`,
                severity: 'critical', holdAction: '排气阀全开, 蒸汽阀关',
            });
        }
        // RF-07/RF-08: 传感器断线(<3.6mA即原始值~0) 或饱和(>20.5mA即原始值~27648+)
        const channels = [
            { tag: 'TEMP_PV', name: 'AI-0 温度' },
            { tag: 'PH_PV', name: 'AI-2 pH' },
            { tag: 'DO_PV', name: 'AI-3 DO' },
            { tag: 'PRESSURE_PV', name: 'AI-4 罐压' },
            { tag: 'AIRFLOW_PV', name: 'AI-5 空气流量' },
        ];
        for (const ch of channels) {
            const raw = pv[`${ch.tag}_RAW`];
            if (raw !== undefined) {
                if (raw < 100) { // 接近0，断线
                    faults.push({
                        code: 'RF-07', name: `传感器断线(${ch.name})`,
                        faulted: true, detail: `raw=${raw} (<100, 疑似断线)`,
                        severity: 'warning',
                    });
                }
                else if (raw > 28000) { // 接近满量程，饱和
                    faults.push({
                        code: 'RF-08', name: `传感器饱和(${ch.name})`,
                        faulted: true, detail: `raw=${raw} (>28000, 疑似饱和)`,
                        severity: 'warning',
                    });
                }
            }
        }
        // RF-09: 称重30min无变化但补料泵在运行
        const weight = pv['WEIGHT_PV'] ?? pv['AI-6'];
        const feedPump = pv['P02_RATE'] ?? 0;
        if (weight !== undefined && feedPump > 0) {
            const lastWeight = this.lastValues.get('weight_for_rf09') ?? weight;
            const weightChange = Math.abs(weight - lastWeight);
            const noChangeDur = this.track('RF-09', weightChange < 0.01);
            if (noChangeDur >= 1800) { // 30分钟
                faults.push({
                    code: 'RF-09', name: '称重无变化(泵运行中)',
                    faulted: true, detail: `称重${weight.toFixed(2)}kg, 30min无变化, 补料泵速率=${feedPump}mL/h`,
                    severity: 'warning', holdAction: '补料泵停',
                });
            }
            // 每分钟更新基线
            if (noChangeDur === 0)
                this.lastValues.set('weight_for_rf09', weight);
        }
        // RF-10: 称重突增>5% 且无泵动作 (泡沫)
        if (weight !== undefined) {
            const prevWeight = this.lastValues.get('weight_prev') ?? weight;
            const allPumpsOff = (pv['P01_RATE'] ?? 0) === 0 && (pv['P02_RATE'] ?? 0) === 0 &&
                (pv['P03_RATE'] ?? 0) === 0 && (pv['P04_RATE'] ?? 0) === 0;
            if (prevWeight > 0 && (weight - prevWeight) / prevWeight > 0.05 && allPumpsOff) {
                faults.push({
                    code: 'RF-10', name: '疑似泡沫事件',
                    faulted: true, detail: `称重从${prevWeight.toFixed(2)}→${weight.toFixed(2)}kg (突增>${5}%)`,
                    severity: 'warning', holdAction: '消泡泵P04脉冲5s',
                });
            }
            this.lastValues.set('weight_prev', weight);
        }
        // 发射所有critical故障
        const criticals = faults.filter(f => f.severity === 'critical');
        for (const fault of criticals) {
            this.emit('runningfault', fault);
        }
        return faults;
    }
    // 重置所有计时器 (状态机从Held→Running时调用)
    reset() {
        this.trackers.clear();
        this.lastValues.clear();
        this.vfdConsecutiveSame = 0;
        this.vfdLastValue = null;
    }
}
exports.RunningFaultMonitor = RunningFaultMonitor;
//# sourceMappingURL=running-fault-monitor.js.map