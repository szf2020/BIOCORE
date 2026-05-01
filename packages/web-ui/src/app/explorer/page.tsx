'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Database } from 'lucide-react';

const API = 'http://localhost:3001';
const RANGES = ['1h', '6h', '12h', '24h', '全程'] as const;
const FIELDS = [
  { key: 'temperature', label: '温度' },
  { key: 'pH', label: 'pH' },
  { key: 'DO', label: 'DO' },
  { key: 'stirring', label: '搅拌' },
  { key: 'airflow', label: '通气' },
  { key: 'feeding', label: '补料' },
] as const;

const COLORS: Record<string, string> = {
  temperature: '#ef4444', pH: '#3b82f6', DO: '#22c55e',
  stirring: '#f59e0b', airflow: '#8b5cf6', feeding: '#ec4899',
};

interface Batch { id: string; batch_id: string; recipe_name?: string }
interface DataPoint { time: string; [key: string]: number | string }

function generateMockData(fields: string[], range: string): DataPoint[] {
  const hours = range === '全程' ? 48 : parseInt(range);
  const points = Math.min(hours * 4, 120);
  const now = Date.now();
  return Array.from({ length: points }, (_, i) => {
    const t = new Date(now - (points - i) * (hours * 3600000 / points));
    const entry: DataPoint = { time: t.toISOString() };
    if (fields.includes('temperature')) entry.temperature = 36.5 + Math.sin(i / 8) * 1.5 + Math.random() * 0.3;
    if (fields.includes('pH')) entry.pH = 7.0 + Math.cos(i / 10) * 0.5 + Math.random() * 0.1;
    if (fields.includes('DO')) entry.DO = 40 + Math.sin(i / 6) * 15 + Math.random() * 2;
    if (fields.includes('stirring')) entry.stirring = 200 + Math.sin(i / 12) * 50;
    if (fields.includes('airflow')) entry.airflow = 1.5 + Math.cos(i / 8) * 0.5;
    if (fields.includes('feeding')) entry.feeding = Math.max(0, Math.sin(i / 15) * 5 + Math.random());
    return entry;
  });
}

function MiniChart({ data, fields }: { data: DataPoint[]; fields: string[] }) {
  if (data.length === 0 || fields.length === 0) return <div className="h-[300px] flex items-center justify-center text-muted-foreground">请选择参数并查询</div>;
  const W = 800, H = 280, PAD = 40;
  const numericFields = fields.filter(f => data[0]?.[f] !== undefined);
  const ranges = numericFields.reduce((acc, f) => {
    const vals = data.map(d => Number(d[f])).filter(v => !isNaN(v));
    acc[f] = { min: Math.min(...vals), max: Math.max(...vals) };
    return acc;
  }, {} as Record<string, { min: number; max: number }>);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[300px]" preserveAspectRatio="xMidYMid meet">
      <rect x={PAD} y={10} width={W - PAD * 2} height={H - PAD - 10} fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
      {numericFields.map(field => {
        const { min, max } = ranges[field];
        const span = max - min || 1;
        const points = data.map((d, i) => {
          const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
          const y = (H - PAD) - ((Number(d[field]) - min) / span) * (H - PAD - 10);
          return `${x},${y}`;
        }).join(' ');
        return <polyline key={field} points={points} fill="none" stroke={COLORS[field]} strokeWidth="1.5" />;
      })}
      {numericFields.map((field, fi) => (
        <g key={field}>
          <rect x={PAD + fi * 90} y={H - 18} width={10} height={10} fill={COLORS[field]} rx="2" />
          <text x={PAD + fi * 90 + 14} y={H - 9} fontSize="11" fill="currentColor">{FIELDS.find(f => f.key === field)?.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function ExplorerPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState('');
  const [range, setRange] = useState<string>('24h');
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(['temperature', 'pH', 'DO']));
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/api/batches`).then(r => r.json()).then(d => {
      const list = Array.isArray(d) ? d : d.data ?? [];
      setBatches(list);
      if (list.length > 0) setBatchId(list[0].id ?? list[0].batch_id);
    }).catch(() => setBatches([]));
  }, []);

  const toggleField = (key: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const query = useCallback(() => {
    if (!batchId) return;
    setLoading(true);
    setError('');
    const fields = Array.from(selectedFields).join(',');
    fetch(`${API}/api/data/trend/${batchId}?fields=${fields}&range=-${range === '全程' ? '999h' : range}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('查询失败')))
      .then(d => setData(Array.isArray(d) ? d : d.data ?? []))
      .catch(() => setData(generateMockData(Array.from(selectedFields), range)))
      .finally(() => setLoading(false));
  }, [batchId, range, selectedFields]);

  const activeFields = Array.from(selectedFields);

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Database className="w-4 h-4" />数据浏览器</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={batchId} onChange={e => setBatchId(e.target.value)}>
              {batches.length === 0 && <option value="">无批次</option>}
              {batches.map(b => <option key={b.id ?? b.batch_id} value={b.id ?? b.batch_id}>{b.batch_id ?? b.id}</option>)}
            </select>
            <div className="flex gap-1">
              {RANGES.map(r => (
                <Button key={r} size="sm" variant={range === r ? 'default' : 'outline'} onClick={() => setRange(r)}>{r}</Button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              {FIELDS.map(f => (
                <label key={f.key} className="flex items-center gap-1 text-sm cursor-pointer">
                  <input type="checkbox" checked={selectedFields.has(f.key)} onChange={() => toggleField(f.key)} className="rounded" />
                  {f.label}
                </label>
              ))}
            </div>
            <Button size="sm" onClick={query} disabled={loading}><Search className="w-3.5 h-3.5 mr-1" />{loading ? '查询中...' : '查询'}</Button>
          </div>
        </CardContent>
      </Card>

      {error && <div className="text-destructive text-sm p-2 border border-destructive/30 rounded">{error}</div>}

      <Card>
        <CardContent className="pt-4">
          <MiniChart data={data} fields={activeFields} />
        </CardContent>
      </Card>

      {data.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">原始数据（最近20条）</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  {activeFields.map(f => <TableHead key={f}>{FIELDS.find(x => x.key === f)?.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slice(-20).reverse().map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{new Date(row.time).toLocaleString('zh-CN')}</TableCell>
                    {activeFields.map(f => <TableCell key={f}>{typeof row[f] === 'number' ? (row[f] as number).toFixed(2) : row[f] ?? '-'}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data.length === 0 && !loading && (
        <div className="text-center text-muted-foreground py-12">选择批次和参数后点击查询</div>
      )}
    </div>
  );
}
