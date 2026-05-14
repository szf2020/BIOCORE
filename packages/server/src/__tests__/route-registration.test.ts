/**
 * 路由注册完整性测试 — 防止 v1.13.0 式回归
 *
 * 背景：v1.13.0 中 registerAuditLogRoutes 已定义但未在 index.ts 调用，
 * 导致审计日志 API 全部 404。v1.14.0 (e3ebf14) 修复。
 *
 * 本测试采用静态分析方案：
 *   1. 扫描 packages/server/src/ 下所有 *-routes.ts（含 middlewares/）
 *      提取所有 `export function register*Routes` 符号
 *   2. 读取 index.ts 内容，提取所有实际调用的 register*Routes(...)
 *   3. 双向 diff：缺失注册 & 孤儿调用都 fail
 *
 * 无需启动 server，运行时间 < 100ms。
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// 扫描根目录（packages/server/src）
const SRC_DIR = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(SRC_DIR, 'index.ts');

// 顶层只扫 *-routes.ts；middlewares/ 扫全部 .ts（因 permissions.ts 不按命名规范但含 register*Routes）
const ROUTES_SCAN_DIR = SRC_DIR;
const MIDDLEWARE_SCAN_DIR = path.join(SRC_DIR, 'middlewares');

/** 从单个文件内容中提取所有 `export function register*Routes` 函数名 */
function extractExportedRegisterFunctions(content: string): string[] {
  // 匹配：export function registerXxxRoutes / export async function registerXxxRoutes
  const pattern = /export\s+(?:async\s+)?function\s+(register\w+Routes)\s*[(<]/g;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/** 从 index.ts 内容中提取所有 `register*Routes(` 调用的函数名 */
function extractCalledRegisterFunctions(content: string): string[] {
  // 匹配：registerXxxRoutes( — 调用点（排除 import 行）
  const pattern = /\b(register\w+Routes)\s*\(/g;
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    names.add(match[1]);
  }
  return Array.from(names);
}

/** 扫描顶层目录，返回所有 *-routes.ts 文件路径 */
function findTopLevelRoutesFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('-routes.ts') && !f.endsWith('.test.ts'))
    .map((f) => path.join(dir, f));
}

/**
 * 扫描 middlewares/ 目录下所有 .ts 文件（非测试）。
 * 该目录存在 permissions.ts 等未遵循 *-routes.ts 命名但包含 register*Routes 的文件。
 */
function findMiddlewareFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => path.join(dir, f));
}

// ─── 数据收集（仅执行一次，共享给两个测试用例）───────────────────────────────

/** 所有候选文件中导出的 register*Routes，格式：Map<函数名, 来源文件相对路径> */
function collectAllExportedFunctions(): Map<string, string> {
  const result = new Map<string, string>();

  // 顶层：只扫 *-routes.ts
  const topFiles = findTopLevelRoutesFiles(ROUTES_SCAN_DIR);
  // middlewares/：扫全部 .ts（permissions.ts 不符合 *-routes.ts 命名但含 register*Routes）
  const middlewareFiles = findMiddlewareFiles(MIDDLEWARE_SCAN_DIR);

  for (const filePath of [...topFiles, ...middlewareFiles]) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const names = extractExportedRegisterFunctions(content);
    const relPath = path.relative(SRC_DIR, filePath);
    for (const name of names) {
      result.set(name, relPath);
    }
  }
  return result;
}

/** index.ts 中实际调用的所有 register*Routes 函数名集合 */
function collectCalledFunctions(): Set<string> {
  const content = fs.readFileSync(INDEX_PATH, 'utf-8');
  return new Set(extractCalledRegisterFunctions(content));
}

// ─── 测试套件 ────────────────────────────────────────────────────────────────

describe('Route registration completeness', () => {
  it('所有 *-routes.ts 中 export 的 register*Routes 函数都在 index.ts 中被调用', () => {
    // Arrange
    const exported = collectAllExportedFunctions(); // Map<函数名, 文件>
    const called = collectCalledFunctions();         // Set<函数名>

    // Act：找出已导出但未调用的函数
    const missing: string[] = [];
    for (const [fnName, sourceFile] of exported) {
      if (!called.has(fnName)) {
        missing.push(`${fnName}  (定义于 ${sourceFile})`);
      }
    }

    // Assert
    expect(
      missing,
      `以下 register*Routes 函数已定义但未在 index.ts 中调用，` +
        `会导致对应 API 全部 404:\n  ${missing.join('\n  ')}`
    ).toHaveLength(0);
  });

  it('index.ts 中调用的所有 register*Routes 都能在 *-routes.ts 中找到对应导出（无孤儿调用）', () => {
    // Arrange
    const exported = collectAllExportedFunctions(); // Map<函数名, 文件>
    const called = collectCalledFunctions();         // Set<函数名>

    // Act：找出已调用但找不到导出来源的函数（孤儿调用）
    const orphans: string[] = [];
    for (const fnName of called) {
      if (!exported.has(fnName)) {
        orphans.push(fnName);
      }
    }

    // Assert
    expect(
      orphans,
      `以下函数在 index.ts 中被调用，但在任何 *-routes.ts 中找不到对应 export，` +
        `可能是文件被删除或重命名:\n  ${orphans.join('\n  ')}`
    ).toHaveLength(0);
  });
});
