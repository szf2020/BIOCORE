import { EventEmitter } from 'events';
import type { BatchState, Recipe, ButtonEnableState, StepDefinition } from '@biocore/types';
import type { PhaseStatus } from './index';
export interface BatchControllerConfig {
    plcRead: (tag: string) => Promise<number>;
    plcWrite: (tag: string, value: number) => Promise<void>;
    pollIntervalMs?: number;
    getTemplateSteps?: (phaseType: string) => StepDefinition[] | null;
    getInterlockConfigs?: () => any[];
}
export declare class BatchController extends EventEmitter {
    private actor;
    private stepEngine;
    private faultMonitor;
    private config;
    private recipe;
    private batchId;
    private phaseIndex;
    private pollTimer;
    private batchStartTime;
    private ticking;
    private phaseStatuses;
    private static STATE_CODES;
    constructor(config: BatchControllerConfig);
    get currentState(): BatchState;
    get currentBatchId(): string;
    get buttons(): ButtonEnableState;
    start(recipe: Recipe, batchId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    hold(reason?: string): void;
    restart(): void;
    pause(): void;
    unpause(): void;
    stop(): void;
    estop(): void;
    reset(): void;
    /** 手动启动指定Phase */
    startPhaseByIndex(phaseIndex: number): {
        success: boolean;
        message: string;
    };
    /** Hold指定Phase */
    holdPhase(phaseIndex: number, reason?: string): void;
    /** 恢复held Phase */
    restartPhase(phaseIndex: number): void;
    /** 跳过指定Phase */
    skipPhase(phaseIndex: number): void;
    /** 获取所有Phase状态 */
    getPhaseStatuses(): PhaseStatus[];
    /** 将下一个pending Phase标记为ready; 顺序模式下自动启动 */
    private readyNextPhase;
    /** 检查是否所有Phase都已完成/跳过 */
    private checkAllPhasesComplete;
    onCommLoss(reason: string): void;
    /**
     * 解析步骤定义: 优先从数据库模板读取, 回退到硬编码
     */
    private resolveStepDefinitions;
    private launchPhaseEngine;
    private startPolling;
    private stopPolling;
    private tick;
    private tickInternal;
    private readProcessValues;
    private writePLCState;
    private broadcastStateUpdate;
    destroy(): void;
}
//# sourceMappingURL=batch-controller.d.ts.map