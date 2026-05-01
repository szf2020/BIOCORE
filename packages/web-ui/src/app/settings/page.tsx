'use client';

import React from 'react';
import Link from 'next/link';
import {
  Wifi, Blocks, Gauge, Users, Bot, Database, Server,
} from 'lucide-react';

const SETTINGS_SECTIONS = [
  { href: '/settings/device-config', icon: Server, label: '设备配置', description: '配置系统管理的发酵罐数量、PLC连接和心跳参数' },
  { href: '/settings/plc-config', icon: Wifi, label: 'PLC通讯配置', description: '管理PLC连接、变量映射和通讯参数' },
  { href: '/settings/phase-templates', icon: Blocks, label: 'Phase模板配置', description: '配置Phase类型和Step模板' },
  { href: '/settings/calibration', icon: Gauge, label: '传感器校准', description: '校准温度、pH、DO等传感器' },
  { href: '/settings/users', icon: Users, label: '用户管理', description: '管理操作员账户和权限' },
  { href: '/settings/ai-config', icon: Bot, label: 'AI配置', description: '配置Ollama URL、模型选择和云端API密钥' },
  { href: '/settings/data-maintenance', icon: Database, label: '数据维护', description: '数据备份、保留策略和日志清理' },
];

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">系统设置</h1>
      <p className="text-sm text-muted-foreground mb-6">管理BIOCore平台的所有配置项</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SETTINGS_SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted transition-colors"
          >
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <section.icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">{section.label}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
