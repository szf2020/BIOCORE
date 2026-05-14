// ============================================================
// Dashboard 二级菜单: 工艺画面 (FUXA HMI 集成)
// 阶段 1 (W1): iframe 嵌入 FUXA 官方镜像 (默认 http://localhost:1881)
// 后续:
//   W2: FUXA 通过 MQTT 订阅 BIOCore tag, 实时数据接通
//   W3: nginx 反代 + BIOCore JWT SSO, 关闭 FUXA 直连
// ============================================================

'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronLeft, ExternalLink, AlertCircle } from 'lucide-react';

const FUXA_URL = process.env.NEXT_PUBLIC_FUXA_URL || 'http://localhost:1881';

export default function HmiPage() {
  return (
    <div className="flex flex-col h-screen bg-slate-50">
      {/* 顶部工具栏 */}
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 rounded"
          >
            <ChevronLeft className="w-4 h-4" />
            返回 Dashboard
          </Link>
          <div className="h-5 w-px bg-slate-300" />
          <h1 className="text-base font-semibold">工艺画面 (FUXA HMI)</h1>
          <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded">
            W1 集成阶段
          </span>
        </div>
        <a
          href={FUXA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
        >
          独立窗口打开
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </header>

      {/* W1 阶段提示横幅 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>
          阶段 1 集成: FUXA 独立运行于 <code className="px-1 bg-amber-100 rounded">{FUXA_URL}</code>，
          尚未对接 BIOCore 实时 tag (W2 任务)。当前仅用于绘制工艺图测试。
          启动: <code className="px-1 bg-amber-100 rounded">docker compose -f docker-compose.fuxa.yml up -d</code>
        </span>
      </div>

      {/* FUXA iframe 主区 */}
      <main className="flex-1 relative bg-slate-100">
        <iframe
          src={FUXA_URL}
          className="absolute inset-0 w-full h-full border-0"
          title="FUXA HMI"
          allow="clipboard-read; clipboard-write"
        />
      </main>
    </div>
  );
}
