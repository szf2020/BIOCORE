'use client';

import React from 'react';
import Link from 'next/link';
import {
  Wifi, Blocks, Gauge, Users, Bot, Database, Server,
} from 'lucide-react';
import { useLocale } from '@/i18n/useLocale';

export default function SettingsPage() {
  const { t } = useLocale();

  const SETTINGS_SECTIONS = [
    { href: '/settings/device-config', icon: Server, label: t('settings.device-config.label'), description: t('settings.device-config.desc') },
    { href: '/settings/plc-config', icon: Wifi, label: t('settings.plc-config.label'), description: t('settings.plc-config.desc') },
    { href: '/settings/phase-templates', icon: Blocks, label: t('settings.phase-templates.label'), description: t('settings.phase-templates.desc') },
    { href: '/settings/calibration', icon: Gauge, label: t('settings.calibration.label'), description: t('settings.calibration.desc') },
    { href: '/settings/users', icon: Users, label: t('settings.users.label'), description: t('settings.users.desc') },
    { href: '/settings/ai-config', icon: Bot, label: t('settings.ai-config.label'), description: t('settings.ai-config.desc') },
    { href: '/settings/data-maintenance', icon: Database, label: t('settings.data-maintenance.label'), description: t('settings.data-maintenance.desc') },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">{t('settings.title')}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t('settings.subtitle')}</p>

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
              <p className="text-sm text-muted-foreground mt-0.5">{section.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
