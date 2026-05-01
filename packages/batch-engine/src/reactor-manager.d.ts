import { BatchController, BatchControllerConfig } from './batch-controller';
export declare class ReactorManager {
    private reactors;
    /** 注册反应器, 最多8台 */
    addReactor(reactorId: string, config: BatchControllerConfig): BatchController;
    /** 获取指定反应器 */
    getReactor(reactorId: string): BatchController | undefined;
    /** 列出所有反应器状态 */
    listReactors(): {
        id: string;
        state: string;
        batchId: string;
    }[];
    /** 移除反应器 (会先destroy) */
    removeReactor(reactorId: string): void;
    /** 销毁所有反应器 */
    destroyAll(): void;
    /** 反应器数量 */
    get size(): number;
    /** 检查反应器是否存在 */
    has(reactorId: string): boolean;
}
//# sourceMappingURL=reactor-manager.d.ts.map