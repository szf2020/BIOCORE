// ============================================================
// SampleImportDialog -- 离线取样 CSV 批量导入对话框
//
// 功能: 选择 CSV 文件 → 解析预览 → POST 导入
// 对标 DASware 离线取样数据导入
// ============================================================

'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/auth';

interface SampleImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  apiBase?: string;
  onImported?: (count: number) => void;
}

interface ParsedRow {
  [key: string]: string;
}

/**
 * 简易 CSV 解析 (原生实现, 不依赖第三方库)
 * 按换行拆行, 按逗号拆列, 首行为表头
 */
function parseCSV(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

export function SampleImportDialog({
  open, onOpenChange, batchId, apiBase, onImported,
}: SampleImportDialogProps) {
  const API = apiBase || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // 文件选择处理
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
    };
    reader.readAsText(file);
  }, []);

  // 导入提交
  const handleImport = useCallback(async () => {
    if (rows.length === 0) return;

    setImporting(true);
    setResult(null);

    try {
      // 转为数值类型 (sample_time 保留字符串, 其余尝试转数字)
      const samples = rows.map(row => {
        const obj: Record<string, any> = {};
        for (const [key, val] of Object.entries(row)) {
          if (key === 'sample_time' || key === 'note' || key === 'notes') {
            obj[key] = val;
          } else {
            const num = Number(val);
            obj[key] = val === '' ? null : (isNaN(num) ? val : num);
          }
        }
        return obj;
      });

      const res = await apiFetch(`${API}/api/v1/batches/${encodeURIComponent(batchId)}/samples/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(samples),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.msg || errData?.message || `导入失败 (${res.status})`);
      }

      const data = await res.json();
      const count = data?.count ?? data?.imported ?? rows.length;
      setResult({ ok: true, msg: `成功导入 ${count} 条取样记录` });
      onImported?.(count);
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message });
    } finally {
      setImporting(false);
    }
  }, [rows, API, batchId, onImported]);

  // 关闭时重置
  const handleClose = useCallback((v: boolean) => {
    if (!v) {
      setFileName('');
      setHeaders([]);
      setRows([]);
      setResult(null);
      if (fileRef.current) fileRef.current.value = '';
    }
    onOpenChange(v);
  }, [onOpenChange]);

  // 预览行数 (最多 5 行)
  const previewRows = rows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>导入离线取样 - {batchId}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 文件选择 */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
            >
              <Upload className="w-4 h-4 mr-1.5" />
              选择 CSV 文件
            </Button>
            <span className="text-sm text-muted-foreground truncate">
              {fileName || '未选择文件'}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* CSV 格式提示 */}
          {!fileName && (
            <div className="text-sm text-muted-foreground bg-muted/30 rounded p-3 border border-border">
              CSV 格式要求: 首行为列名, 必须包含 <code className="text-primary">sample_time</code> 列 (ISO 格式)。
              可选列: od600, dcw_g_L, glucose_g_L, acetate_g_L, product_titer, cell_viability_pct, note
            </div>
          )}

          {/* 预览表格 */}
          {headers.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                预览 (共 {rows.length} 行, 显示前 {previewRows.length} 行)
              </div>
              <div className="overflow-x-auto border border-border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      {headers.map(h => (
                        <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-t border-border">
                        {headers.map(h => (
                          <td key={h} className="px-2 py-1 font-mono whitespace-nowrap">
                            {row[h] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 结果提示 */}
          {result && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded ${
              result.ok
                ? 'bg-green-500/10 text-emerald-600'
                : 'bg-red-500/10 text-red-600'
            }`}>
              {result.ok
                ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
                : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {result.msg}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)} disabled={importing}>
            取消
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing || rows.length === 0}
          >
            {importing ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> 导入中...</>
            ) : (
              `导入 (${rows.length} 条)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
