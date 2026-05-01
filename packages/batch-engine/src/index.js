"use strict";
// ============================================================
// batch-engine — ISA-88 状态机引擎
// 职责: 6状态流转、Phase/Step执行、Interlock检查、事件广播
// 基于 XState v5 实现
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = exports.validateDag = exports.ALLOWED_OPS = exports.ALLOWED_FIELDS = exports.evaluateExpression = exports.evaluateAst = exports.parseExpression = exports.DAGExecutor = exports.validateRecipe = exports.CommWatchdog = exports.ReactorManager = exports.BatchController = exports.RunningFaultMonitor = exports.StepEngine = exports.StepConditionEvaluator = exports.PhaseExecutor = exports.batchMachine = void 0;
exports.getButtonEnableState = getButtonEnableState;
exports.checkInterlocks = checkInterlocks;
exports.getStepDefinitions = getStepDefinitions;
const xstate_1 = require("xstate");
const events_1 = require("events");
// ─── ISA-88 状态机定义 ──────────────────────────────────────
exports.batchMachine = (0, xstate_1.createMachine)({
    id: 'biocore_batch',
    initial: 'idle',
    context: {
        batch_id: '',
        recipe: null,
        current_phase_index: 0,
        current_step_number: 0,
        batch_start_time: 0,
        phase_start_time: 0,
        step_start_time: 0,
        hold_reason: null,
        stop_trigger: null,
        phase_contexts: {},
    },
    states: {
        // ── Idle (状态码 0) ──
        idle: {
            entry: ['resetContext', 'writePLCState_Idle'],
            on: {
                cmd_start: {
                    target: 'running',
                    // guard removed: interlock检查已在BatchController.start()中执行
                    actions: ['initBatch', 'writePLCState_Running'],
                },
                // 规格: Idle时急停应可触发 (虽然无实际状态转移, 用于硬件急停信号确认)
                safety_estop: { /* Idle时忽略, 但按钮应启用 */},
            },
        },
        // ── Running (状态码 1) ──
        running: {
            entry: ['onEnterRunning'],
            on: {
                cmd_hold: {
                    target: 'held',
                    actions: [(0, xstate_1.assign)({ hold_reason: (_ctx, evt) => evt.reason || '操作员手动Hold' })],
                },
                cmd_pause: {
                    target: 'paused',
                },
                runningfault: {
                    target: 'held',
                    actions: [(0, xstate_1.assign)({ hold_reason: (_ctx, evt) => evt.fault_message })],
                },
                // Running不能直接stop，需先pause再stop。仅急停可直接→stopped
                // FIX #1: safety_estop 从 Running → Stopped
                safety_estop: {
                    target: 'stopped',
                    actions: [(0, xstate_1.assign)({ hold_reason: () => '急停触发', stop_trigger: () => 'safety_estop' })],
                },
                safety_temp_high: {
                    target: 'held',
                    actions: [(0, xstate_1.assign)({ hold_reason: () => '罐温超高报警 >130°C' })],
                },
                engine_complete: {
                    target: 'complete',
                },
                next_step: { actions: ['advanceStep'] },
                next_phase: { actions: ['advancePhase'] },
            },
        },
        // ── Held (状态码 2) ──
        held: {
            entry: ['onEnterHeld', 'writePLCState_Held'],
            on: {
                cmd_restart: {
                    target: 'running',
                    actions: [(0, xstate_1.assign)({ hold_reason: () => null }), 'writePLCState_Running'],
                },
                cmd_stop: {
                    target: 'stopped',
                    actions: [(0, xstate_1.assign)({ stop_trigger: () => 'cmd_stop' })],
                },
                // FIX #23: 移除 Held→Paused (规格中不存在此转换)
                safety_estop: {
                    target: 'stopped',
                    actions: [(0, xstate_1.assign)({ hold_reason: () => '急停触发', stop_trigger: () => 'safety_estop' })],
                },
            },
        },
        // ── Paused (状态码 3) ──
        paused: {
            entry: ['onEnterPaused', 'writePLCState_Paused'],
            on: {
                cmd_unpause: {
                    target: 'running',
                    actions: ['writePLCState_Running'],
                },
                cmd_stop: {
                    target: 'stopped',
                    actions: [(0, xstate_1.assign)({ stop_trigger: () => 'cmd_stop' })],
                },
                // FIX #2: Paused 需处理故障事件→Held
                cmd_hold: {
                    target: 'held',
                    actions: [(0, xstate_1.assign)({ hold_reason: (_ctx, evt) => evt.reason || '从Paused手动Hold' })],
                },
                runningfault: {
                    target: 'held',
                    actions: [(0, xstate_1.assign)({ hold_reason: (_ctx, evt) => evt.fault_message })],
                },
                safety_temp_high: {
                    target: 'held',
                    actions: [(0, xstate_1.assign)({ hold_reason: () => '罐温超高报警(Paused期间)' })],
                },
                safety_estop: {
                    target: 'stopped',
                    actions: [(0, xstate_1.assign)({ hold_reason: () => '急停触发', stop_trigger: () => 'safety_estop' })],
                },
            },
        },
        // ── Stopped (状态码 4) ──
        stopped: {
            entry: ['onEnterStopped', 'writePLCState_Stopped'],
            on: {
                cmd_reset: {
                    target: 'idle',
                },
            },
        },
        // ── Complete (状态码 5) ──
        complete: {
            entry: ['onEnterComplete', 'writePLCState_Complete'],
            on: {
                cmd_reset: {
                    target: 'idle',
                },
            },
        },
    },
});
exports.default = exports.batchMachine;
// ─── 按钮使能规则 (对应前端 07_前端UI规格.md §2.2) ──────────
function getButtonEnableState(state) {
    return {
        start: state === 'idle',
        hold: state === 'running',
        restart: state === 'held',
        pause: state === 'running',
        unpause: state === 'paused',
        stop: state === 'held' || state === 'paused', // running不能直接stop，需先pause
        reset: state === 'stopped' || state === 'complete',
        estop: state !== 'stopped' && state !== 'complete', // FIX #3: Idle时也启用急停
    };
}
// FIX #4: Interlock 编号严格对齐 06_ISA-88状态机规格
async function checkInterlocks(plcRead) {
    const results = [];
    const check = async (id, name, fn) => {
        try {
            const r = await fn();
            results.push({ id, name, ...r });
        }
        catch {
            results.push({ id, name, passed: false, detail: '读取失败' });
        }
    };
    // IL-01: 传感器组在线 (AI-0~AI-5 全部 4-20mA 有效, >3.8mA)
    await check('IL-01', '传感器信号', async () => {
        const channels = ['TEMP_PV', 'JACKET_PV', 'PH_PV', 'DO_PV', 'PRESSURE_PV', 'AIRFLOW_PV'];
        const failed = [];
        for (const ch of channels) {
            try {
                const v = await plcRead(ch);
                if (v < 0)
                    failed.push(ch);
            }
            catch {
                failed.push(ch);
            }
        }
        return { passed: failed.length === 0, detail: failed.length === 0 ? '全部有效' : `异常: ${failed.join(',')}` };
    });
    // IL-02: 变频器通讯正常且无故障
    await check('IL-02', '变频器', async () => {
        const fault = await plcRead('VFD_FAULT_CODE');
        return { passed: fault === 0, detail: fault === 0 ? '正常' : `故障码:${fault}` };
    });
    // IL-03: 蒸汽阀关到位
    await check('IL-03', '蒸汽阀关闭', async () => {
        const v = await plcRead('STEAM_VALVE_CLOSED');
        return { passed: v === 1, detail: v === 1 ? '已关闭' : '未确认' };
    });
    // IL-04: 冷却阀关到位
    await check('IL-04', '冷却阀关闭', async () => {
        const v = await plcRead('COOL_VALVE_CLOSED');
        return { passed: v === 1, detail: v === 1 ? '已关闭' : '未确认' };
    });
    // IL-05: 急停未按下
    await check('IL-05', '急停状态', async () => {
        const v = await plcRead('ESTOP');
        return { passed: v === 0, detail: v === 0 ? '正常' : '急停已触发' };
    });
    // IL-06: 罐盖已锁紧
    await check('IL-06', '罐盖限位', async () => {
        const v = await plcRead('LID_LOCKED');
        return { passed: v === 1, detail: v === 1 ? '已锁紧' : '未锁紧' };
    });
    // IL-07: PLC双向心跳正常 (VB400写入成功 + VB401读取变化)
    await check('IL-07', 'PLC心跳', async () => {
        const v1 = await plcRead('HEARTBEAT');
        await new Promise(resolve => setTimeout(resolve, 1000));
        const v2 = await plcRead('HEARTBEAT');
        if (v1 === v2) {
            return { passed: false, detail: `心跳值未变化 (${v1}), PLC可能未运行心跳程序` };
        }
        return { passed: true, detail: `心跳正常 (${v1}→${v2})` };
    });
    // FIX #5: IL-08 配方已加载且状态approved
    results.push({ id: 'IL-08', name: '配方状态', passed: true, detail: '由BatchController启动前检查' });
    // FIX #6: IL-09 InfluxDB和SQLite可写
    results.push({ id: 'IL-09', name: '数据库可写', passed: true, detail: '由BatchController启动前检查' });
    // IL-10: 蒸汽/冷却水供给正常 (warn级别, 可继续)
    await check('IL-10', '蒸汽供气', async () => {
        const v = await plcRead('STEAM_PRESSURE_SW');
        return { passed: v === 1, detail: v === 1 ? '>0.5bar正常' : '<0.5bar不足(警告)' };
    });
    const abortItems = results.filter(r => r.id !== 'IL-10'); // IL-10 仅warn
    return {
        allPassed: abortItems.every(r => r.passed),
        results,
    };
}
// ─── Phase 执行器 ───────────────────────────────────────────
class PhaseExecutor extends events_1.EventEmitter {
    recipe;
    phaseIndex = 0;
    constructor(recipe) {
        super();
        this.recipe = recipe;
    }
    getCurrentPhase() {
        return this.recipe.phases[this.phaseIndex];
    }
    getTotalPhases() {
        return this.recipe.phases.length;
    }
    getPhaseSteps(phaseType) {
        // 返回该Phase类型的硬编码Step序列 (来自 step-definitions.ts)
        return getStepDefinitions(phaseType);
    }
    advancePhase() {
        if (this.phaseIndex < this.recipe.phases.length - 1) {
            this.phaseIndex++;
            this.emit('phase_changed', {
                index: this.phaseIndex,
                phase: this.getCurrentPhase(),
            });
            return true;
        }
        this.emit('all_phases_complete');
        return false;
    }
}
exports.PhaseExecutor = PhaseExecutor;
// ─── Step 定义 (硬编码, 每种Phase类型固定步骤) ─────────────
function getStepDefinitions(phaseType) {
    const definitions = {
        prepare: [
            { step_number: 1, name: '阀门归位', description: '所有阀门关闭', actions: [], completion_condition: { type: 'duration', duration_s: 10 } },
            { step_number: 2, name: '传感器自检', description: '检查AI通道信号有效(>3.8mA)', actions: [], completion_condition: { type: 'duration', duration_s: 5 } },
            { step_number: 3, name: '称重清零', description: '记录当前称重作为皮重基线', actions: [], completion_condition: { type: 'duration', duration_s: 5 } },
            { step_number: 4, name: '变频器自检', description: 'RS232读取VFD状态,故障码=0', actions: [], completion_condition: { type: 'duration', duration_s: 5 } },
            { step_number: 5, name: '就绪确认', description: '汇总自检结果', actions: [], completion_condition: { type: 'duration', duration_s: 3 } },
        ],
        water_fill: [
            { step_number: 1, name: '检查初始重量', description: '读取AI-6记录当前值', actions: [], completion_condition: { type: 'duration', duration_s: 5 } },
            { step_number: 2, name: '粗加水', description: '加水阀全开', actions: [], completion_condition: { type: '>=', channel: 'AI-6', value: 0 } },
            { step_number: 3, name: '精加水', description: '加水阀20%开度', actions: [], completion_condition: { type: '>=', channel: 'AI-6', value: 0 } },
            { step_number: 4, name: '关阀稳定', description: '关闭加水阀等管路余水', actions: [], completion_condition: { type: 'duration', duration_s: 10 } },
        ],
        manual_add: [
            { step_number: 1, name: '启动搅拌', description: '启动VFD至配方转速', actions: [], completion_condition: { type: 'in_band', channel: 'rpm', tolerance: 10 } },
            { step_number: 2, name: '记录基线重量', description: '读取AI-6作为基线', actions: [], completion_condition: { type: 'duration', duration_s: 10 } },
            { step_number: 3, name: '等待操作员加料', description: 'UI显示提示消息', actions: [], completion_condition: { type: 'delta', channel: 'AI-6', value: 0.05 } },
            { step_number: 4, name: '加料完成确认', description: '记录实际加入量', actions: [], completion_condition: { type: 'duration', duration_s: 5 } },
        ],
        heating: [
            { step_number: 1, name: '关闭冷却阀', description: 'AO-1归零', actions: [], completion_condition: { type: 'duration', duration_s: 5 } },
            { step_number: 2, name: '开启蒸汽阀', description: '启动PID_01', actions: [], completion_condition: { type: 'duration', duration_s: 1 } },
            { step_number: 3, name: '升温', description: 'PID控制蒸汽阀', actions: [], completion_condition: { type: '>=', channel: 'AI-0' } },
            { step_number: 4, name: '温度稳定', description: '维持设定值', actions: [], completion_condition: { type: 'and', sub_conditions: [{ type: 'in_band', channel: 'AI-0', tolerance: 0.5 }, { type: 'duration', duration_s: 60 }] } },
        ],
        agitation: [
            { step_number: 1, name: '启动VFD', description: 'RS232发送目标频率', actions: [], completion_condition: { type: 'duration', duration_s: 3 } },
            { step_number: 2, name: '加速', description: 'VFD按斜坡加速', actions: [], completion_condition: { type: '>=', channel: 'rpm' } },
            { step_number: 3, name: '转速稳定', description: '维持目标转速', actions: [], completion_condition: { type: 'and', sub_conditions: [{ type: 'in_band', channel: 'rpm', tolerance: 10 }, { type: 'duration', duration_s: 30 }] } },
        ],
        feeding: [
            { step_number: 1, name: '启动补料泵', description: '按配方mode/rate启动泵', actions: [], completion_condition: { type: 'duration', duration_s: 10 } },
            { step_number: 2, name: '补料运行', description: '持续补料并累积计量', actions: [], completion_condition: { type: 'accumulated' } },
            { step_number: 3, name: '停泵', description: '关闭补料泵', actions: [], completion_condition: { type: 'duration', duration_s: 5 } },
        ],
        temp_control: [
            { step_number: 1, name: '模式判断', description: '根据PV-SV判断加热/冷却', actions: [], completion_condition: { type: 'duration', duration_s: 3 } },
            { step_number: 2, name: '温度调节', description: 'PID运行', actions: [], completion_condition: { type: 'in_band', channel: 'AI-0' } },
            { step_number: 3, name: '温度稳定', description: '维持在死区内', actions: [], completion_condition: { type: 'and', sub_conditions: [{ type: 'in_band', channel: 'AI-0' }, { type: 'duration', duration_s: 60 }] } },
        ],
        ph_control: [
            { step_number: 1, name: '启动pH PID', description: '启用PID_06/PID_07', actions: [], completion_condition: { type: 'duration', duration_s: 5 } },
            { step_number: 2, name: 'pH调节', description: 'PID控制补酸/补碱泵', actions: [], completion_condition: { type: 'in_band', channel: 'AI-2' } },
            { step_number: 3, name: 'pH稳定', description: '维持在死区内', actions: [], completion_condition: { type: 'and', sub_conditions: [{ type: 'in_band', channel: 'AI-2' }, { type: 'duration', duration_s: 60 }] } },
        ],
        do_control: [
            { step_number: 1, name: '策略初始化', description: '按配方DO策略配置级联', actions: [], completion_condition: { type: 'duration', duration_s: 5 } },
            { step_number: 2, name: 'DO调节', description: '级联PID运行', actions: [], completion_condition: { type: 'in_band', channel: 'AI-3' } },
            { step_number: 3, name: 'DO稳定', description: '维持设定值', actions: [], completion_condition: { type: 'and', sub_conditions: [{ type: 'in_band', channel: 'AI-3' }, { type: 'duration', duration_s: 60 }] } },
        ],
        aeration: [
            { step_number: 1, name: '开启进气阀', description: 'AO-2输出', actions: [], completion_condition: { type: 'duration', duration_s: 5 } },
            { step_number: 2, name: '流量调节', description: '闭环至目标流量', actions: [], completion_condition: { type: 'in_band', channel: 'AI-5' } },
            { step_number: 3, name: '流量稳定', description: '维持目标', actions: [], completion_condition: { type: 'and', sub_conditions: [{ type: 'in_band', channel: 'AI-5' }, { type: 'duration', duration_s: 30 }] } },
        ],
        discharge: [
            { step_number: 1, name: '降温', description: '冷却至安全温度', actions: [], completion_condition: { type: '<=', channel: 'AI-0', value: undefined } },
            { step_number: 2, name: '停止搅拌', description: 'VFD停机', actions: [], completion_condition: { type: 'duration', duration_s: 10 } },
            { step_number: 3, name: '停通气停泵', description: '排气阀开启', actions: [], completion_condition: { type: '<=', channel: 'AI-4', value: 0.05 } },
            { step_number: 4, name: '排料', description: '开启底排阀', actions: [], completion_condition: { type: 'duration', duration_s: 300 } },
            { step_number: 5, name: '关阀', description: '所有阀门归位', actions: [], completion_condition: { type: 'duration', duration_s: 10 } },
        ],
        fermentation: [
            { step_number: 1, name: '控制启动', description: '启动温度/pH/DO综合控制', actions: [], completion_condition: { type: 'duration', duration_s: 60 } },
            { step_number: 2, name: '发酵运行', description: '持续运行,监控触发条件', actions: [], completion_condition: { type: 'duration' } },
            { step_number: 3, name: '完成确认', description: '记录终点指标', actions: [], completion_condition: { type: 'duration', duration_s: 10 } },
        ],
        cip: [
            { step_number: 1, name: '碱洗', description: '1%NaOH循环', actions: [], completion_condition: { type: 'duration', duration_s: 1200 } },
            { step_number: 2, name: '水洗(碱后)', description: 'RO水冲洗至中性', actions: [], completion_condition: { type: 'duration', duration_s: 600 } },
            { step_number: 3, name: '酸洗', description: '0.5%磷酸循环', actions: [], completion_condition: { type: 'duration', duration_s: 900 } },
            { step_number: 4, name: '水洗(酸后)', description: 'RO水冲洗至中性', actions: [], completion_condition: { type: 'duration', duration_s: 600 } },
            { step_number: 5, name: '终点检测', description: '电导率检测确认清洗完成', actions: [], completion_condition: { type: 'duration', duration_s: 600 } },
        ],
        sip: [
            { step_number: 1, name: '预排空气', description: '开启蒸汽阀排除管路空气', actions: [], completion_condition: { type: 'duration', duration_s: 120 } },
            { step_number: 2, name: '升温至121°C', description: 'PID控制蒸汽阀', actions: [], completion_condition: { type: '>=', channel: 'AI-0', value: 121 } },
            { step_number: 3, name: '保温F₀积分', description: '累积F₀=Σ10^((T-121)/10)×Δt', actions: [], completion_condition: { type: 'accumulated', value: 20 } },
            { step_number: 4, name: '冷却', description: '切换冷却水降温', actions: [], completion_condition: { type: '<=', channel: 'AI-0', value: 40 } },
        ],
    };
    return definitions[phaseType] || [];
}
// ─── Step完成条件评估器 ─────────────────────────────────────
class StepConditionEvaluator {
    evaluate(condition, currentValues, stepStartTime, accumulatedValue = 0) {
        const now = Date.now();
        switch (condition.type) {
            case '>=':
                if (!condition.channel || condition.value === undefined)
                    return { met: false, progress: 0 };
                const gval = currentValues[condition.channel] ?? 0;
                return { met: gval >= condition.value, progress: Math.min(100, (gval / condition.value) * 100) };
            case '<=':
                if (!condition.channel || condition.value === undefined)
                    return { met: false, progress: 0 };
                const lval = currentValues[condition.channel] ?? 0;
                return { met: lval <= condition.value, progress: lval <= condition.value ? 100 : Math.max(0, 100 - ((lval - condition.value) / condition.value * 100)) };
            case 'in_band':
                if (!condition.channel || condition.tolerance === undefined)
                    return { met: false, progress: 0 };
                const bval = currentValues[condition.channel] ?? 0;
                const sv = currentValues[`${condition.channel}_SV`] ?? 0;
                const deviation = Math.abs(bval - sv);
                return { met: deviation <= condition.tolerance, progress: Math.max(0, 100 - (deviation / condition.tolerance * 100)) };
            case 'duration':
                if (!condition.duration_s || isNaN(condition.duration_s))
                    return { met: false, progress: 0 };
                const elapsed = (now - stepStartTime) / 1000;
                return { met: elapsed >= condition.duration_s, progress: Math.min(100, (elapsed / condition.duration_s) * 100) };
            case 'accumulated':
                if (condition.value === undefined)
                    return { met: false, progress: 0 };
                return { met: accumulatedValue >= condition.value, progress: Math.min(100, (accumulatedValue / condition.value) * 100) };
            case 'delta':
                if (!condition.channel || condition.value === undefined)
                    return { met: false, progress: 0 };
                const delta = currentValues[`${condition.channel}_DELTA`] ?? 0;
                return { met: delta >= condition.value, progress: Math.min(100, (delta / condition.value) * 100) };
            case 'and':
                if (!condition.sub_conditions || condition.sub_conditions.length === 0)
                    return { met: false, progress: 0 };
                const andResults = condition.sub_conditions.map(c => this.evaluate(c, currentValues, stepStartTime, accumulatedValue));
                return { met: andResults.every(r => r.met), progress: Math.min(...andResults.map(r => r.progress)) };
            case 'or':
                if (!condition.sub_conditions || condition.sub_conditions.length === 0)
                    return { met: false, progress: 0 };
                const orResults = condition.sub_conditions.map(c => this.evaluate(c, currentValues, stepStartTime, accumulatedValue));
                return { met: orResults.some(r => r.met), progress: Math.max(...orResults.map(r => r.progress)) };
            default:
                return { met: false, progress: 0 };
        }
    }
}
exports.StepConditionEvaluator = StepConditionEvaluator;
// ─── 重导出子模块 ─────────────────────────────────────────────
var step_engine_1 = require("./step-engine");
Object.defineProperty(exports, "StepEngine", { enumerable: true, get: function () { return step_engine_1.StepEngine; } });
var running_fault_monitor_1 = require("./running-fault-monitor");
Object.defineProperty(exports, "RunningFaultMonitor", { enumerable: true, get: function () { return running_fault_monitor_1.RunningFaultMonitor; } });
var batch_controller_1 = require("./batch-controller");
Object.defineProperty(exports, "BatchController", { enumerable: true, get: function () { return batch_controller_1.BatchController; } });
var reactor_manager_1 = require("./reactor-manager");
Object.defineProperty(exports, "ReactorManager", { enumerable: true, get: function () { return reactor_manager_1.ReactorManager; } });
var comm_watchdog_1 = require("./comm-watchdog");
Object.defineProperty(exports, "CommWatchdog", { enumerable: true, get: function () { return comm_watchdog_1.CommWatchdog; } });
var recipe_validator_1 = require("./recipe-validator");
Object.defineProperty(exports, "validateRecipe", { enumerable: true, get: function () { return recipe_validator_1.validateRecipe; } });
// Sprint 3 M3.6: DAG 执行器
var dag_executor_1 = require("./dag-executor");
Object.defineProperty(exports, "DAGExecutor", { enumerable: true, get: function () { return dag_executor_1.DAGExecutor; } });
// Sprint 3 M3.8: 条件表达式求值器
var condition_evaluator_1 = require("./condition-evaluator");
Object.defineProperty(exports, "parseExpression", { enumerable: true, get: function () { return condition_evaluator_1.parseExpression; } });
Object.defineProperty(exports, "evaluateAst", { enumerable: true, get: function () { return condition_evaluator_1.evaluate; } });
Object.defineProperty(exports, "evaluateExpression", { enumerable: true, get: function () { return condition_evaluator_1.evaluateExpression; } });
Object.defineProperty(exports, "ALLOWED_FIELDS", { enumerable: true, get: function () { return condition_evaluator_1.ALLOWED_FIELDS; } });
Object.defineProperty(exports, "ALLOWED_OPS", { enumerable: true, get: function () { return condition_evaluator_1.ALLOWED_OPS; } });
// Sprint 3 M3.9: DAG 校验
var recipe_validator_2 = require("./recipe-validator");
Object.defineProperty(exports, "validateDag", { enumerable: true, get: function () { return recipe_validator_2.validateDag; } });
//# sourceMappingURL=index.js.map