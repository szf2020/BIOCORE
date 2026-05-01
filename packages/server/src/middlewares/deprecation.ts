// ============================================================
// deprecation.ts — V0 兼容期 deprecation header 中间件
//
// 给所有 /api/* (无 v1 前缀) 的请求添加:
//   - Header: Deprecation: version="v0", sunset="<DATE>"
//   - Header: Link: </api/v1/path>; rel="successor-version"
// 同时 console.warn 警告调用方 (开发期间发现遗漏)
//
// 兼容期截止: 默认部署日期 + 180 天, 可通过 .env 的 API_V0_DEPRECATION_DATE 覆盖
// ============================================================

import type { Request, Response, NextFunction } from 'express';

// 优先读环境变量, 否则取部署日期 + 180 天
const SUNSET_DATE = process.env.API_V0_DEPRECATION_DATE
  || new Date(Date.now() + 180 * 86400 * 1000).toISOString().slice(0, 10);

export function v0DeprecationMw(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Deprecation', `version="v0", sunset="${SUNSET_DATE}"`);
  res.setHeader('Link', `<${req.baseUrl}/v1${req.path}>; rel="successor-version"`);
  // 旧路径每次调用时打 WARN, 帮助识别遗漏的迁移点
  console.warn(`[DEPRECATED API] ${req.method} ${req.originalUrl} from ${req.ip} - 请改用 /api/v1${req.path}`);
  next();
}

export const API_V0_SUNSET = SUNSET_DATE;
