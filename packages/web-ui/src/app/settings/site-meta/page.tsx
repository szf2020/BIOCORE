// 站点元数据 — 面包屑 facility/line/reactor_group 文案配置
'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, Save } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useAudit } from '@/hooks/useAudit';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SiteConfig {
  facility_name: string;
  line_name: string;
  reactor_group_name: string;
  _meta: { facility_source: string; line_source: string; reactor_group_source: string };
}

export default function SiteMetaPage() {
  const audit = useAudit();
  const [data, setData] = useState<SiteConfig | null>(null);
  const [facility, setFacility] = useState('');
  const [line, setLine] = useState('');
  const [group, setGroup] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    apiFetch(`${API}/api/system-config`)
      .then(r => r.ok ? r.json() : null)
      .then((d: SiteConfig | null) => {
        if (!d) return;
        setData(d);
        // 仅当来源 = 'db' 时填回输入框, 否则留空 (用户可见占位 = 实际推导/env 值)
        setFacility(d._meta.facility_source === 'db' ? d.facility_name : '');
        setLine(d._meta.line_source === 'db' ? d.line_name : '');
        setGroup(d._meta.reactor_group_source === 'db' ? d.reactor_group_name : '');
      });
  };
  useEffect(() => { load(); }, []);

  const save = () => {
    if (!data) return;
    audit.confirm({
      description: '修改站点元数据 (面包屑文案)',
      action: 'site_meta_update', targetType: 'system_config', targetId: 'breadcrumb',
      onConfirm: async () => {
        setSaving(true);
        setMsg(null);
        const r = await apiFetch(`${API}/api/system-config`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facility_name: facility,
            line_name: line,
            reactor_group_name: group,
          }),
        });
        if (r.ok) {
          setMsg({ ok: true, text: '已保存. 刷新页面看新面包屑' });
          load();
        } else {
          setMsg({ ok: false, text: '保存失败' });
        }
        setSaving(false);
      },
    });
  };

  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      {audit.dialog}

      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" /> 站点元数据
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          页面顶部面包屑显示的厂区/产线/反应器组名称. 留空 = 自动推导或使用 env 默认.
        </p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <Field
            label="厂区/车间名称 (面包屑第一段)"
            value={facility} onChange={setFacility}
            placeholder={data.facility_name}
            source={data._meta.facility_source}
            hint="留空回退顺序: env FACILITY_NAME → '生产车间'"
          />
          <Field
            label="产线名称 (面包屑第二段)"
            value={line} onChange={setLine}
            placeholder={data.line_name}
            source={data._meta.line_source}
            hint="留空回退顺序: env LINE_NAME → '发酵产线 #1'"
          />
          <Field
            label="反应器组名称 (面包屑第三段)"
            value={group} onChange={setGroup}
            placeholder={data.reactor_group_name}
            source={data._meta.reactor_group_source}
            hint="留空 = 从 reactor_configs 自动推导 (如 '5L 研发罐组 · 4台')"
          />

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" />{saving ? '保存中...' : '保存'}
            </Button>
            {msg && (
              <span className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{msg.text}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, source, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; source: string; hint: string;
}) {
  const SOURCE_LABEL: Record<string, string> = { db: '已设置', env: '环境变量', derived: '自动推导', default: '硬编码默认' };
  const SOURCE_COLOR: Record<string, string> = {
    db: 'bg-primary/15 text-primary',
    env: 'bg-blue-500/15 text-blue-600',
    derived: 'bg-emerald-500/15 text-emerald-600',
    default: 'bg-muted text-muted-foreground',
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <span className={`text-[12px] px-1.5 py-0.5 rounded ${SOURCE_COLOR[source] || ''}`}>
          当前来源: {SOURCE_LABEL[source] || source}
        </span>
      </div>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
      <p className="text-sm text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}
