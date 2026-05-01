// ============================================================
// BatchController — 顶层批次控制器
// 串联: 状态机 + StepEngine + CommWatchdog + FaultMonitor
// 对外暴露: 命令接口 (start/hold/restart...) + 事件
// ============================================================

import { EventEmitter } from 'events';
import { createActor } from 'xstate';
import { batchMachine, getButtonEnableState, checkInterlocks, getStepDefinitions } from './index';
import { StepEngine } from './step-engine';
import { RunningFaultMonitor } from './running-fault-monitor';
import { validateRecipe } from './recipe-validator';
import type {
  BatchState, Recipe, ButtonEnableState, StateUpdatePayload,
  StepDefinition,
} from '@biocore/types';
import type { PhaseState, PhaseStatus } from './index';
import { DAGExecutor, type RecipeDAG, type DAGEvalContext, linearToDag } from './dag-executor';
import { evaluateExpression as evaluateConditionExpression } from './condition-evaluator';

export interface BatchControllerConfig {
  // PLC读写函数 (由外部注入)
  plcRead: (tag: string) => Promise<number>;
  plcWrite: (tag: string, value: number) => Promise<void>;
  // 定时轮询间隔 (默认1000ms)
  pollIntervalMs?: number;
  // Phase模板步骤定义提供器 (从数据库读取, 优先于硬编码)
  // 返回 null 表示该类型无数据库模板, 回退硬编码
  getTemplateSteps?: (phaseType: string) => StepDefinition[] | null;
  // IL/RF 连锁故障配置 (从数据库读取)
  getInterlockConfigs?: () => any[];
}

export class BatchController extends EventEmitter {
  private actor: ReturnType<typeof createActor>;
  private stepEngine: StepEngine | null = null;
  private faultMonitor = new RunningFaultMonitor();
  private config: BatchControllerConfig;
  private recipe: Recipe | null = null;
  private batchId = '';
  private phaseIndex = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private batchStartTime = 0;
  private ticking = false;
  // T8: phaseStatuses now keyed by DAG node id; array view exposed via getter
  private phaseStatusesMap: Map<string, PhaseStatus> = new Map();

  // DAG runtime fields (T4 plumbing — wired up in T7+)
  private currentNodeId: string | null = null;
  private dag: RecipeDAG | null = null;
  private dagExecutor: DAGExecutor | null = null;

  /** Array view of phaseStatuses sorted by phase_index (transitional shim until all consumers move to nodeId). */
  private get phaseStatuses(): PhaseStatus[] {
    return Array.from(this.phaseStatusesMap.values()).sort((a, b) => a.phase_index - b.phase_index);
  }

  /** Lookup PhaseStatus by phase_index (transitional helper for index-based code paths). */
  private getPhaseStatusByIndex(idx: number): PhaseStatus | undefined {
    for (const ps of this.phaseStatusesMap.values()) {
      if (ps.phase_index === idx) return ps;
    }
    return undefined;
  }

  // 状态码 → PLC VW2
  private static STATE_CODES: Record<BatchState, number> = {
    idle: 0, running: 1, held: 2, paused: 3, stopped: 4, complete: 5,
  };

  constructor(config: BatchControllerConfig) {
    super();
    // P1 修复: 设置 max listeners 为 50, 避免多 reactor 场景的 Node warning
    this.setMaxListeners(50);
    this.config = config;

    // 创建 XState actor
    this.actor = createActor(batchMachine);
    this.actor.subscribe(snapshot => {
      const state = snapshot.value as BatchState;
      this.emit('state_changed', state);
      this.broadcastStateUpdate();

      // 写入PLC状态码
      this.writePLCState(state).catch(() => {});
    });
    this.actor.start();

    // 监听故障事件
    this.faultMonitor.on('runningfault', (fault) => {
      if (this.currentState === 'running' || this.currentState === 'paused') {
        this.actor.send({ type: 'runningfault', fault_message: `${fault.code}: ${fault.name} — ${fault.detail}` });
        this.emit('alarm', {
          code: fault.code,
          severity: fault.severity,
          message: fault.detail,
          holdAction: fault.holdAction,
        });
      }
    });
  }

  // ── 当前状态 ──

  get currentState(): BatchState {
    return this.actor.getSnapshot().value as BatchState;
  }

  // 当前正在运行的 batch_id, 状态机非 running 时返回空字符串
  // 用于 InfluxDB 时序采集标记 (collector tick)
  get currentBatchId(): string {
    return this.batchId;
  }

  get buttons(): ButtonEnableState {
    return getButtonEnableState(this.currentState);
  }

  // ── 命令接口 ──

  async start(recipe: Recipe, batchId: string): Promise<{ success: boolean; message: string }> {
    if (this.currentState !== 'idle') {
      return { success: false, message: `当前状态${this.currentState}不允许启动` };
    }

    // 配方校验
    const validation = validateRecipe(recipe);
    if (!validation.valid) {
      return { success: false, message: `配方校验失败: ${validation.errors.map(e => e.message).join('; ')}` };
    }

    // Interlock检查
    const interlocks = await checkInterlocks(this.config.plcRead);
    if (!interlocks.allPassed) {
      const failed = interlocks.results.filter(r => !r.passed);
      return { success: false, message: `互锁检查未通过: ${failed.map(f => `${f.id} ${f.name}: ${f.detail}`).join('; ')}` };
    }

    // 初始化
    this.recipe = recipe;
    this.batchId = batchId;
    this.phaseIndex = 0;
    this.batchStartTime = Date.now();

    // T7: parallel DAG runtime initialization (does not affect old phaseIndex path yet)
    this.dag = this.linearToDagIfNeeded(recipe);
    this.dagExecutor = new DAGExecutor(this.dag);
    this.dagExecutor.start();
    this.currentNodeId = this.dagExecutor.getCurrentNode()?.id ?? null;

    // T8: 初始化所有Phase状态 (Map keyed by node id), 顺序与 DAG 中 phase 节点顺序一致
    // 第一个phase为ready, 其余为pending; 优先从数据库模板读取步骤定义, 回退到硬编码
    this.phaseStatusesMap.clear();
    const phaseNodes = (this.dag?.nodes ?? []).filter(n => n.type === 'phase');
    phaseNodes.forEach((node, idx) => {
      const phaseFromRecipe = recipe.phases?.[idx];
      const phaseId = (node as any).phase_id ?? phaseFromRecipe?.phase_id ?? `phase_${idx}`;
      const phaseType = (node as any).phase_type ?? phaseFromRecipe?.type ?? 'unknown';
      const steps = this.resolveStepDefinitions(phaseType);
      this.phaseStatusesMap.set(node.id, {
        phase_id: phaseId,
        phase_type: phaseType,
        phase_index: idx,
        node_id: node.id,
        state: (idx === 0 ? 'ready' : 'pending') as PhaseState,
        step_number: 0,
        total_steps: steps.length,
        step_name: steps.length > 0 ? steps[0].name : '',
      });
    });

    // Transition state machine first
    this.actor.send({ type: 'cmd_start' });

    // Verify state is 'running' before proceeding
    if ((this.currentState as string) !== 'running') {
      return { success: false, message: `状态机未能转换到running状态, 当前: ${this.currentState}` };
    }

    // Start polling
    this.startPolling();

    this.emit('batch_started', { batch_id: batchId, recipe_id: recipe.recipe_id });

    // 顺序模式: 自动启动第一个Phase
    if (recipe.execution_mode === 'sequential') {
      this.startPhaseByIndex(0);
      return { success: true, message: `批次${batchId}已启动 (顺序模式), Phase自动执行` };
    }

    return { success: true, message: `批次${batchId}已启动 (自由模式), 请手动启动Phase` };
  }

  hold(reason?: string): void {
    if (this.currentState === 'running') {
      this.actor.send({ type: 'cmd_hold', reason: reason || '操作员手动Hold' });
      this.emit('batch_held', { reason });
    }
  }

  restart(): void {
    if (this.currentState === 'held') {
      this.faultMonitor.reset();
      this.actor.send({ type: 'cmd_restart' });
      this.emit('batch_restarted');
    }
  }

  pause(): void {
    if (this.currentState === 'running') {
      this.actor.send({ type: 'cmd_pause' });
      this.emit('batch_paused');
    }
  }

  unpause(): void {
    if (this.currentState === 'paused') {
      this.actor.send({ type: 'cmd_unpause' });
      this.emit('batch_unpaused');
    }
  }

  stop(): void {
    // stop只允许从paused/held调用，running需先pause
    if (this.currentState === 'held' || this.currentState === 'paused') {
      this.stepEngine?.interrupt();
      this.stopPolling();
      this.actor.send({ type: 'cmd_stop' });
      this.emit('batch_stopped', { trigger: 'cmd_stop' });
    }
  }

  estop(): void {
    const state = this.currentState;
    if (state !== 'stopped' && state !== 'complete') {
      this.stepEngine?.interrupt();
      this.stopPolling();
      this.actor.send({ type: 'safety_estop' });
      this.emit('batch_stopped', { trigger: 'safety_estop' });
    }
  }

  reset(): void {
    if (this.currentState === 'stopped' || this.currentState === 'complete') {
      this.stepEngine = null;
      this.recipe = null;
      this.batchId = '';
      this.phaseIndex = 0;
      this.phaseStatusesMap.clear();
      this.dag = null;
      this.dagExecutor = null;
      this.currentNodeId = null;
      this.actor.send({ type: 'cmd_reset' });
      this.emit('batch_reset');
    }
  }

  // ── Phase级控制命令 ──

  /** 手动启动指定Phase */
  startPhaseByIndex(phaseIndex: number): { success: boolean; message: string } {
    if (!this.recipe || phaseIndex < 0 || phaseIndex >= this.recipe.phases.length) {
      return { success: false, message: '无效的Phase索引' };
    }
    const ps = this.getPhaseStatusByIndex(phaseIndex);
    if (!ps) return { success: false, message: 'Phase状态不存在' };
    if (ps.state !== 'ready' && ps.state !== 'pending') {
      return { success: false, message: `Phase ${phaseIndex} 当前状态 ${ps.state} 不允许启动` };
    }
    // 检查是否有其他Phase正在运行
    const runningPhase = this.phaseStatuses.find(p => p.state === 'running');
    if (runningPhase) {
      return { success: false, message: `Phase ${runningPhase.phase_index} 正在运行中, 请先完成或Hold` };
    }

    // 确保batch状态机是running
    if (this.currentState !== 'running') {
      return { success: false, message: `批次状态 ${this.currentState} 不允许启动Phase` };
    }

    ps.state = 'running';
    ps.started_at = new Date().toISOString();
    this.launchPhaseEngine(phaseIndex);
    this.broadcastStateUpdate();
    return { success: true, message: `Phase ${phaseIndex} 已启动` };
  }

  /** Hold指定Phase */
  holdPhase(phaseIndex: number, reason?: string): void {
    const ps = this.getPhaseStatusByIndex(phaseIndex);
    if (!ps || ps.state !== 'running') return;
    ps.state = 'held';
    ps.hold_reason = reason || '操作员手动Hold';
    this.emit('phase_held', { index: phaseIndex, reason: ps.hold_reason });
    this.broadcastStateUpdate();
  }

  /** 恢复held Phase */
  restartPhase(phaseIndex: number): void {
    const ps = this.getPhaseStatusByIndex(phaseIndex);
    if (!ps || ps.state !== 'held') return;
    ps.state = 'running';
    ps.hold_reason = undefined;
    this.emit('phase_restarted', { index: phaseIndex });
    this.broadcastStateUpdate();
  }

  /** 跳过指定Phase */
  skipPhase(phaseIndex: number): void {
    const ps = this.getPhaseStatusByIndex(phaseIndex);
    if (!ps || ps.state === 'completed' || ps.state === 'skipped') return;
    const wasRunning = ps.state === 'running';
    ps.state = 'skipped';
    ps.ended_at = new Date().toISOString();
    if (wasRunning && this.stepEngine) {
      this.stepEngine.interrupt();
      this.stepEngine = null;
    }
    // 将下一个pending Phase设为ready
    this.readyNextPhase(phaseIndex);
    this.checkAllPhasesComplete();
    this.broadcastStateUpdate();
  }

  /** 获取所有Phase状态 */
  getPhaseStatuses(): PhaseStatus[] {
    return this.phaseStatuses.map(ps => ({ ...ps }));
  }

  /**
   * Build the evaluation context for branch nodes.
   * Provides a `evaluateExpression` impl backed by condition-evaluator,
   * with the most recent PV snapshot + phase_elapsed_min as fields.
   *
   * Note: BatchController does not currently retain a PV snapshot at this layer
   * (PV is read inline in tickInternal). Until a tracker is added (T11+), we
   * pass an empty fields object — this matches the DAG spec's PV-missing
   * behavior (branch falls back to default_branch ?? 'false').
   */
  private buildEvalContext(): DAGEvalContext {
    const lastPV: Record<string, number> = (this as any).lastSampledPV ?? {};
    // Best-effort: derive phase_elapsed_min from the currently running PhaseStatus's started_at
    const runningPS = this.phaseStatuses.find(p => p.state === 'running');
    const startedIso = runningPS?.started_at;
    const phaseStartedMs = startedIso ? Date.parse(startedIso) : Date.now();
    const phaseElapsedMin = (Date.now() - phaseStartedMs) / 60_000;

    return {
      evaluateExpression: (expr: string): boolean => {
        const fields = { ...lastPV, phase_elapsed_min: phaseElapsedMin };
        const result = evaluateConditionExpression(expr, fields as any);
        if (result.ok) return result.value;
        // Parse / runtime error → throw so DAGExecutor uses default_branch fallback
        throw new Error(result.error);
      },
    };
  }

  /** 将下一个pending Phase标记为ready; 顺序模式下自动启动 */
  private readyNextPhase(_afterIndex: number): void {
    if (!this.dagExecutor || !this.dag) {
      // Defensive: should never happen if start() was called
      return;
    }

    const ctx = this.buildEvalContext();
    // advance() may need to traverse branch → next phase; loop until we land
    // on a phase or end node (DAGExecutor.advance handles single hops only).
    let guard = 0;
    while (true) {
      const ok = this.dagExecutor.advance(ctx);
      if (!ok) break;
      const cur = this.dagExecutor.getCurrentNode();
      if (!cur || cur.type === 'phase' || cur.type === 'end') break;
      if (++guard > 1000) break; // safety: avoid infinite loop on malformed DAGs
    }

    const nextNode = this.dagExecutor.getCurrentNode();
    if (!nextNode || nextNode.type === 'end') {
      // No more phases. Caller (tickInternal / skipPhase) will run
      // checkAllPhasesComplete() which transitions the batch to complete.
      return;
    }

    if (nextNode.type === 'phase') {
      this.currentNodeId = nextNode.id;
      const ps = this.phaseStatusesMap.get(nextNode.id);
      if (!ps) return;

      if (this.recipe?.execution_mode === 'sequential') {
        // 顺序模式: 自动启动下一个Phase (preserves old behavior)
        this.startPhaseByIndex(ps.phase_index);
      } else {
        // 自由模式: 仅标记为ready, 等操作员手动启动
        if (ps.state === 'pending') {
          ps.state = 'ready';
        }
      }
    }
  }

  /** 检查是否所有Phase都已完成/跳过 */
  private checkAllPhasesComplete(): void {
    const allDone = this.phaseStatuses.every(
      ps => ps.state === 'completed' || ps.state === 'skipped'
    );
    if (allDone) {
      this.stopPolling();
      this.actor.send({ type: 'engine_complete' });
      this.emit('batch_completed', { batch_id: this.batchId });
    }
  }

  // ── 通讯断线联动 (由外部 CommWatchdog 调用) ──

  onCommLoss(reason: string): void {
    if (this.currentState === 'running') {
      this.actor.send({ type: 'runningfault', fault_message: `RF-11: ${reason}` });
    }
  }

  // ── 内部方法 ──

  private linearToDagIfNeeded(recipe: Recipe): RecipeDAG {
    // Prefer v2 DAG if present
    const maybeDag = (recipe as any).dag;
    if (maybeDag && maybeDag.schema_version === 2) {
      return maybeDag as RecipeDAG;
    }
    return linearToDag((recipe as any).phases ?? []);
  }

  /**
   * 解析步骤定义: 优先从数据库模板读取, 回退到硬编码
   */
  private resolveStepDefinitions(phaseType: string): StepDefinition[] {
    if (this.config.getTemplateSteps) {
      const dbSteps = this.config.getTemplateSteps(phaseType);
      if (dbSteps && dbSteps.length > 0) return dbSteps;
    }
    return getStepDefinitions(phaseType as any);
  }

  private launchPhaseEngine(index: number): void {
    if (!this.recipe || index >= this.recipe.phases.length) return;

    // Remove listeners from previous StepEngine to prevent leaks
    if (this.stepEngine) {
      this.stepEngine.removeAllListeners();
    }

    const phase = this.recipe.phases[index];
    this.phaseIndex = index;
    // 优先用数据库模板的步骤定义
    const templateSteps = this.resolveStepDefinitions(phase.type);
    this.stepEngine = new StepEngine(phase.type, index, phase.phase_id, phase.params || {}, templateSteps);

    this.stepEngine.on('step_completed', (log) => this.emit('step_completed', log));
    this.stepEngine.on('step_started', (info) => {
      // 同步step信息到phaseStatuses
      const ps = this.getPhaseStatusByIndex(index);
      if (ps) {
        ps.step_number = info.step_number ?? 0;
        ps.step_name = info.step_name ?? '';
      }
      this.emit('step_started', info);
    });
    this.stepEngine.on('step_timeout', (log) => {
      this.holdPhase(index, `Step超时: ${log.step_name}`);
    });

    this.emit('phase_started', {
      index, phase_id: phase.phase_id, phase_type: phase.type,
      total_steps: this.stepEngine.totalSteps,
    });
  }

  private startPolling(): void {
    const interval = this.config.pollIntervalMs ?? 1000;
    this.pollTimer = setInterval(() => this.tick(), interval);
  }

  private stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  // 每秒执行一次
  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.tickInternal();
    } finally {
      this.ticking = false;
    }
  }

  private async tickInternal(): Promise<void> {
    if (this.currentState !== 'running' || !this.recipe) return;

    // 找到当前running的Phase
    const runningPS = this.phaseStatuses.find(ps => ps.state === 'running');
    if (!runningPS || !this.stepEngine) {
      // 没有running的Phase, 只广播状态
      this.broadcastStateUpdate();
      return;
    }

    // held的Phase不执行tick
    if (runningPS.state !== 'running') return;

    // 读取PLC过程值
    let pv: Record<string, number>;
    try {
      pv = await this.readProcessValues();
    } catch {
      return; // PLC读取失败由心跳/CommWatchdog处理
    }

    // 运行故障检测
    this.faultMonitor.check(pv);

    // Step引擎评估
    const result = this.stepEngine.evaluate(pv);

    switch (result.action) {
      case 'phase_complete': {
        // 标记当前Phase为completed
        runningPS.state = 'completed';
        runningPS.ended_at = new Date().toISOString();
        this.emit('phase_completed', {
          index: runningPS.phase_index,
          phase_id: this.recipe.phases[runningPS.phase_index].phase_id,
        });

        // 不自动启动下一个Phase, 仅将下一个pending设为ready
        this.readyNextPhase(runningPS.phase_index);
        this.checkAllPhasesComplete();
        break;
      }
      case 'timeout_hold':
        this.holdPhase(runningPS.phase_index, result.reason);
        break;

      case 'step_advanced':
        // 同步step信息
        runningPS.step_number = this.stepEngine.currentStep;
        runningPS.step_name = this.stepEngine.currentStepName;
        this.broadcastStateUpdate();
        break;

      case 'continue':
        this.broadcastStateUpdate();
        break;
    }
  }  // end tickInternal

  private async readProcessValues(): Promise<Record<string, number>> {
    const tags = [
      'TEMP_PV', 'PH_PV', 'DO_PV', 'PRESSURE_PV', 'AIRFLOW_PV', 'WEIGHT_PV',
      'TEMP_SV', 'PH_SV', 'DO_SV',
      'VFD_FAULT_CODE', 'STEAM_CV', 'COOL_CV',
    ];
    const pv: Record<string, number> = {};
    for (const tag of tags) {
      try { pv[tag] = await this.config.plcRead(tag); } catch { /* skip */ }
    }
    // 别名映射 (StepConditionEvaluator 用 AI-x 格式)
    pv['AI-0'] = pv['TEMP_PV'] ?? 0;
    pv['AI-2'] = pv['PH_PV'] ?? 0;
    pv['AI-3'] = pv['DO_PV'] ?? 0;
    pv['AI-4'] = pv['PRESSURE_PV'] ?? 0;
    pv['AI-5'] = pv['AIRFLOW_PV'] ?? 0;
    pv['AI-6'] = pv['WEIGHT_PV'] ?? 0;
    return pv;
  }

  private async writePLCState(state: BatchState): Promise<void> {
    const code = BatchController.STATE_CODES[state];
    try {
      await this.config.plcWrite('STATE_CODE', code);
    } catch { /* PLC写入失败不影响状态机 */ }
  }

  private broadcastStateUpdate(): void {
    if (!this.recipe) return;

    // 找到当前活跃Phase (running or 最后一个有意义的)
    const activePS = this.phaseStatuses.find(ps => ps.state === 'running')
      || this.getPhaseStatusByIndex(this.phaseIndex);
    const phase = this.recipe.phases[activePS?.phase_index ?? this.phaseIndex];

    // 推导batch状态: 如果有phase running -> batch running, 全部done -> complete
    const update: StateUpdatePayload = {
      state: this.currentState,
      phase_index: activePS?.phase_index ?? this.phaseIndex,
      phase_id: phase?.phase_id || '',
      phase_type: phase?.type || 'prepare',
      phase_name: phase?.phase_id || '',
      total_phases: this.recipe.phases.length,
      step_number: this.stepEngine?.currentStep ?? 0,
      step_name: this.stepEngine?.currentStepName ?? '',
      total_steps: this.stepEngine?.totalSteps ?? 0,
      step_elapsed_sec: this.stepEngine?.stepElapsedSec ?? 0,
      batch_elapsed_sec: this.batchStartTime > 0 ? Math.round((Date.now() - this.batchStartTime) / 1000) : 0,
      hold_reason: this.actor.getSnapshot().context.hold_reason,
      buttons: this.buttons,
      phase_statuses: this.getPhaseStatuses(),
    };
    this.emit('state_update', update);
  }

  // ── 清理 ──

  destroy(): void {
    this.stopPolling();
    this.actor.stop();
    this.faultMonitor.removeAllListeners();
    this.removeAllListeners();
  }
}
