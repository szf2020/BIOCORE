import { EventEmitter } from 'events';
import type { PLCConnectionManager } from '@biocore/plc-driver';
export interface CommWatchdogConfig {
    autoRestartOnRestore: boolean;
    maxSafeHoldDuration_s: number;
}
export declare class CommWatchdog extends EventEmitter {
    private plc;
    private config;
    private holdStartTime;
    private safetyTimer;
    private commLost;
    constructor(plc: PLCConnectionManager, config?: Partial<CommWatchdogConfig>);
    private bindEvents;
    isCommLost(): boolean;
    getHoldDuration(): number;
    destroy(): void;
}
//# sourceMappingURL=comm-watchdog.d.ts.map