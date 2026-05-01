import { EventEmitter } from 'events';
export interface FaultCheckResult {
    code: string;
    name: string;
    faulted: boolean;
    detail: string;
    severity: 'critical' | 'warning';
    holdAction?: string;
}
export declare class RunningFaultMonitor extends EventEmitter {
    private trackers;
    private lastValues;
    private vfdConsecutiveSame;
    private vfdLastValue;
    private track;
    check(pv: Record<string, number>): FaultCheckResult[];
    reset(): void;
}
//# sourceMappingURL=running-fault-monitor.d.ts.map