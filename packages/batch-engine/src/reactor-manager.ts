// ============================================================
// ReactorManager — 多反应器管理 (最多8台)
// 每个反应器对应一个独立的BatchController实例
// ============================================================

import { BatchController, BatchControllerConfig } from './batch-controller';

export class ReactorManager {
  private reactors = new Map<string, BatchController>();

  /** 注册反应器, 最多8台 */
  addReactor(reactorId: string, config: BatchControllerConfig): BatchController {
    if (this.reactors.size >= 8) {
      throw new Error('最多支持8个反应器');
    }
    if (this.reactors.has(reactorId)) {
      throw new Error(`反应器 ${reactorId} 已存在`);
    }
    const ctrl = new BatchController(config);
    this.reactors.set(reactorId, ctrl);
    return ctrl;
  }

  /** 获取指定反应器 */
  getReactor(reactorId: string): BatchController | undefined {
    return this.reactors.get(reactorId);
  }

  /** 列出所有反应器状态 */
  listReactors(): { id: string; state: string; batchId: string }[] {
    const result: { id: string; state: string; batchId: string }[] = [];
    for (const [id, ctrl] of this.reactors) {
      result.push({
        id,
        state: ctrl.currentState,
        batchId: (ctrl as any).batchId || '',
      });
    }
    return result;
  }

  /** 移除反应器 (会先destroy) */
  removeReactor(reactorId: string): void {
    const ctrl = this.reactors.get(reactorId);
    if (ctrl) {
      ctrl.destroy();
      this.reactors.delete(reactorId);
    }
  }

  /** 销毁所有反应器 */
  destroyAll(): void {
    for (const [id] of this.reactors) {
      this.removeReactor(id);
    }
  }

  /** 反应器数量 */
  get size(): number {
    return this.reactors.size;
  }

  /** 检查反应器是否存在 */
  has(reactorId: string): boolean {
    return this.reactors.has(reactorId);
  }
}
