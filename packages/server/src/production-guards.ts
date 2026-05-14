// ============================================================
// production-guards — 生产环境启动期 fail-fast 守卫
// ============================================================
// 仅在 NODE_ENV=production 时生效, 其他模式 (dev/test) 直接 return。
// 触发任意检查失败 → 抛 Error, 让 server 启动崩溃 (符合 fail-fast 语义)。
//
// 当前覆盖两项实机部署 audit 风险:
//   1. MOCK_PLC=true 在生产模式 → 控制指令会被静默丢弃 (plc-bridge.ts
//      plcWrite 在 MOCK_PLC 下是空函数)。
//   2. admin 用户密码仍为默认 'admin123' → ensureAdminAccount() 首次
//      启动会自动写入该默认值, 部署前必须由运维通过 UI 改密。
//
// JWT_SECRET 的生产守卫已由 startup.ts:assertJwtSecretSafe() 覆盖, 此
// 处不重复实现。
// ============================================================

import bcrypt from 'bcrypt';
import type { SQLiteService } from '@biocore/data-service';

/** assertProductionReady 所需的依赖注入。 */
export interface ProductionGuardDeps {
  /** 进程当前 NODE_ENV (调用方传 process.env.NODE_ENV)。 */
  nodeEnv: string | undefined;
  /** 是否启用了 MOCK_PLC (调用方传 process.env.MOCK_PLC === 'true')。 */
  mockPlc: boolean;
  /** 用于查询 users 表的 SQLite 服务实例。 */
  sqlite: SQLiteService;
}

// 默认 admin 密码常量, 与 startup.ts:ensureAdminAccount() 保持同源。
const DEFAULT_ADMIN_PASSWORD = 'admin123';

/**
 * 生产环境启动期检查。检查不通过时抛错, 让上层 await 链路自然 reject
 * → server 启动崩溃。dev/test 模式无副作用。
 */
export async function assertProductionReady(deps: ProductionGuardDeps): Promise<void> {
  // 非生产模式直接放行 — 不影响 dev/test 启动 (即便 MOCK_PLC=true)。
  if (deps.nodeEnv !== 'production') return;

  // 检查 1: MOCK_PLC 在生产模式必须为 false。
  if (deps.mockPlc) {
    throw new Error(
      'FATAL: MOCK_PLC=true 在生产环境禁止 — 控制指令将静默丢弃。请设置 MOCK_PLC=false 并验证 PLC 真实连接。',
    );
  }

  // 检查 2: admin 用户密码不能仍为默认值 'admin123'。
  // bcrypt.compare 在 hash 格式异常时返回 false, 不会抛错; 用户不存在
  // 时跳过 (留给 ensureAdminAccount 处理), 不视为致命。
  const row = deps.sqlite
    .getDatabase()
    .prepare('SELECT password_hash FROM users WHERE username = ?')
    .get('admin') as { password_hash?: string } | undefined;

  if (row?.password_hash) {
    const isDefault = await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, row.password_hash);
    if (isDefault) {
      throw new Error(
        'FATAL: admin 用户密码仍为默认值 admin123 — 请通过 UI 修改后再生产部署。',
      );
    }
  }

  console.log('[production-guards] all checks passed');
}
