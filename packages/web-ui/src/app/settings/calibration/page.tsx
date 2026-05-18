'use client';
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, RefreshCw, Layers } from 'lucide-react';
import { useAudit } from '@/hooks/useAudit';
import { BatchCalibrationWizard } from '@/components/BatchCalibrationWizard';
import { useLocale } from '@/i18n/useLocale';

const API = 'http://localhost:3001';
const CHANNELS = [
  { id: 'AI-0', name: '罐温', type: 'temperature' },
  { id: 'AI-1', name: '夹套温度', type: 'temperature' },
  { id: 'AI-2', name: 'pH', type: 'pH' },
  { id: 'AI-3', name: 'DO', type: 'DO' },
  { id: 'AI-4', name: '罐压', type: 'pressure' },
  { id: 'AI-5', name: '空气流量', type: 'airflow' },
  { id: 'AI-6', name: '称重', type: 'weight' },
];

export default function CalibrationPage() {
  const [selected, setSelected] = useState('AI-2');
  const [cal, setCal] = useState<any>(null);
  const [form, setForm] = useState({ low_raw: 0, low_eng: 4, high_raw: 27648, high_eng: 10 });
  const [saving, setSaving] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const audit = useAudit();

  useEffect(() => {
    fetch(`${API}/api/calibrations/${selected}`).then(r => r.json()).then(d => {
      if (d) { setCal(d); setForm({ low_raw: d.cal_point_low_raw || 0, low_eng: d.cal_point_low_eng || 0, high_raw: d.cal_point_high_raw || 27648, high_eng: d.cal_point_high_eng || 14 }); }
      else setCal(null);
    }).catch(() => {});
  }, [selected]);

  const doSave = async () => {
    setSaving(true);
    const ch = CHANNELS.find(c => c.id === selected)!;
    await fetch(`${API}/api/calibrations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: selected, sensor_type: ch.type, calibrated_by: 'admin-001',
        cal_point_low_raw: form.low_raw, cal_point_low_eng: form.low_eng,
        cal_point_high_raw: form.high_raw, cal_point_high_eng: form.high_eng }),
    });
    setSaving(false);
  };

  const save = () => {
    const ch = CHANNELS.find(c => c.id === selected)!;
    const oldStr = cal
      ? `低${cal.cal_point_low_raw}/${cal.cal_point_low_eng} 高${cal.cal_point_high_raw}/${cal.cal_point_high_eng}`
      : '未校准';
    const newStr = `低${form.low_raw}/${form.low_eng} 高${form.high_raw}/${form.high_eng}`;
    audit.confirm({
      description: `更新 ${selected} (${ch.name}) 校准参数`,
      action: 'calibration_update', targetType: 'calibration', targetId: selected,
      oldValue: oldStr, newValue: newStr,
      onConfirm: doSave,
    });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">传感器校准</h1>
        <Button variant="outline" onClick={() => setWizardOpen(true)}>
          <Layers className="w-4 h-4 mr-1.5" />批量校准
        </Button>
      </div>
      <p className="text-muted-foreground">两点线性校准: 低点标准液 + 高点标准液</p>
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
        <SelectContent>{CHANNELS.map(c => <SelectItem key={c.id} value={c.id}>{c.id} — {c.name}</SelectItem>)}</SelectContent>
      </Select>
      <Card>
        <CardHeader><CardTitle>两点校准 — {selected}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>低点原始值(mA→raw)</Label><Input type="number" value={form.low_raw} onChange={e => setForm({ ...form, low_raw: parseFloat(e.target.value) })} /></div>
          <div><Label>低点工程值</Label><Input type="number" value={form.low_eng} onChange={e => setForm({ ...form, low_eng: parseFloat(e.target.value) })} /></div>
          <div><Label>高点原始值(mA→raw)</Label><Input type="number" value={form.high_raw} onChange={e => setForm({ ...form, high_raw: parseFloat(e.target.value) })} /></div>
          <div><Label>高点工程值</Label><Input type="number" value={form.high_eng} onChange={e => setForm({ ...form, high_eng: parseFloat(e.target.value) })} /></div>
          <div className="col-span-2 flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              斜率: {form.high_raw !== form.low_raw ? ((form.high_eng - form.low_eng) / (form.high_raw - form.low_raw)).toFixed(6) : '—'}
            </span>
            <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-1" /> {saving ? '保存中...' : '保存校准'}</Button>
          </div>
          {cal && <div className="col-span-2 text-sm text-muted-foreground">上次校准: {cal.calibrated_at}</div>}
        </CardContent>
      </Card>
      {/* 批量校准向导 */}
      <BatchCalibrationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        channels={CHANNELS.map(c => ({ channel: c.id, label: c.name, sensorType: c.type }))}
        audit={audit}
      />
      {audit.dialog}
    </div>
  );
}
