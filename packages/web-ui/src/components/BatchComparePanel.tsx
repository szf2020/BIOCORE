// ============================================================
// BatchComparePanel -- 批次对比面板
//
// 功能: 选择批次 + 选择参数 → 加载统计 → 箱线图对比
// 对标 DASware 批次比较功能
// ============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EChartsWrapper } from '@/components/charts/EChartsWrapperDynamic';
import { buildBoxplotOption, getBoxplotChartHeight, type BatchStats } from '@/lib/boxplot-helpers';
import { PARAM_LABELS, PARAM_UNITS } from '@/lib/echarts-helpers';
import { apiFetch } from '@/lib/auth';
import { BarChart3, Search, Loader2 } from 'lucide-react';
import type { EChartsOption } from 'echarts';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** 可选参数字段列表 */
const AVAILABLE_FIELDS = [
  'temperature', 'pH', 'DO', 'rpm', 'airflow',
  'pressure', 'jacket_temp', 'weight', 'vfd_current',
] as const;

/** 最多可选批次数 */
const MAX_BATCHES = 10;

interface BatchSummary {
  id?: string;
  batch_id: string;
  recipe_name?: string;
  state?: string;
  started_at?: string;
}

export function BatchComparePanel() {
  // ── 批次列表 ──
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [batchLoading, setBatchLoading] = useState(true);
  const [batchError, setBatchError] = useState('');
  const [search, setSearch] = useState('');

  // ── 选中状态 ──
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(['temperature', 'pH', 'DO']));

  // ── 统计数据 + 图表 ──
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');
  const [chartOption, setChartOption] = useState<EChartsOption | null>(null);
  const [chartHeight, setChartHeight] = useState(400);

  // 加载批次列表
  useEffect(() => {
    setBatchLoading(true);
    apiFetch(`${API}/api/v1/batches`)
      .then(r => { if (!r.ok) throw new Error('批次列表加载失败'); return r.json(); })
      .then(data => {
        const list: BatchSummary[] = Array.isArray(data) ? data : (data?.data ?? []);
        setBatches(list);
      })
      .catch(e => setBatchError(e.message))
      .finally(() => setBatchLoading(false));
  }, []);

  // 批次多选切换
  const toggleBatch = useCallback((batchId: string) => {
    setSelectedBatchIds(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else if (next.size < MAX_BATCHES) {
        next.add(batchId);
      }
      return next;
    });
  }, []);

  // 参数多选切换
  const toggleField = useCallback((field: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }, []);

  // 加载统计数据并生成图表
  const loadStats = useCallback(async () => {
    if (selectedBatchIds.size === 0 || selectedFields.size === 0) return;

    setStatsLoading(true);
    setStatsError('');
    setChartOption(null);

    try {
      const batchIdsParam = Array.from(selectedBatchIds).join(',');
      const fieldsParam = Array.from(selectedFields).join(',');
      const url = `${API}/api/v1/batches/compare?batch_ids=${encodeURIComponent(batchIdsParam)}&fields=${encodeURIComponent(fieldsParam)}`;

      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`统计加载失败 (${res.status})`);

      const data = await res.json();
      const batchesData: BatchStats[] = data.batches || data;
      const fields = Array.from(selectedFields);

      const option = buildBoxplotOption(batchesData, fields);
      setChartOption(option);
      setChartHeight(getBoxplotChartHeight(fields.length));
    } catch (e) {
      setStatsError((e as Error).message);
    } finally {
      setStatsLoading(false);
    }
  }, [selectedBatchIds, selectedFields]);

  // 过滤搜索
  const filteredBatches = search.trim()
    ? batches.filter(b => {
        const q = search.toLowerCase();
        return b.batch_id.toLowerCase().includes(q) ||
               (b.recipe_name || '').toLowerCase().includes(q);
      })
    : batches;

  return (
    <div className="space-y-4">
      {/* 批次选择 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            批次对比
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索批次ID或配方名..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          {/* 批次列表 (复选框) */}
          <div className="max-h-[200px] overflow-y-auto mes-scroll border border-border rounded-md p-2 space-y-1">
            {batchLoading && (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载批次列表...
              </div>
            )}
            {batchError && (
              <div className="text-sm text-red-600 bg-red-500/10 p-2 rounded">{batchError}</div>
            )}
            {!batchLoading && filteredBatches.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4">无批次数据</div>
            )}
            {filteredBatches.map(b => {
              const bid = b.batch_id;
              const checked = selectedBatchIds.has(bid);
              const disabled = !checked && selectedBatchIds.size >= MAX_BATCHES;
              return (
                <label
                  key={bid}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer transition-colors
                    ${checked ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/50 text-muted-foreground'}
                    ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleBatch(bid)}
                    className="accent-primary"
                  />
                  <span className="font-mono text-xs">{bid}</span>
                  {b.recipe_name && (
                    <span className="text-xs text-muted-foreground truncate">{b.recipe_name}</span>
                  )}
                  {b.state && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted/50 ml-auto">{b.state}</span>
                  )}
                </label>
              );
            })}
          </div>
          <div className="text-xs text-muted-foreground">
            已选 {selectedBatchIds.size}/{MAX_BATCHES} 个批次
          </div>

          {/* 参数选择 */}
          <div>
            <div className="text-sm font-medium mb-2">选择参数</div>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_FIELDS.map(field => {
                const checked = selectedFields.has(field);
                const label = PARAM_LABELS[field] || field;
                const unit = PARAM_UNITS[field] || '';
                return (
                  <label
                    key={field}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer border transition-colors
                      ${checked
                        ? 'bg-primary/15 text-primary border-primary/40'
                        : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleField(field)}
                      className="accent-primary w-3 h-3"
                    />
                    {label}{unit ? ` (${unit})` : ''}
                  </label>
                );
              })}
            </div>
          </div>

          {/* 加载按钮 */}
          <Button
            onClick={loadStats}
            disabled={selectedBatchIds.size === 0 || selectedFields.size === 0 || statsLoading}
            className="w-full"
          >
            {statsLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载中...</>
            ) : (
              '加载统计'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 统计图表 */}
      {statsError && (
        <Card>
          <CardContent className="py-4">
            <div className="text-sm text-red-600 bg-red-500/10 p-3 rounded">{statsError}</div>
          </CardContent>
        </Card>
      )}

      {chartOption && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">箱线图对比</CardTitle>
          </CardHeader>
          <CardContent>
            <EChartsWrapper
              option={chartOption}
              style={{ height: chartHeight }}
            />
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#1677ff]" />
                箱线图 (Q1-Q3, 须线: min-max)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rotate-45 bg-[#f59e0b]" />
                均值
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-6 h-3 rounded-sm bg-[rgba(245,158,11,0.15)]" />
                标准差范围
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
