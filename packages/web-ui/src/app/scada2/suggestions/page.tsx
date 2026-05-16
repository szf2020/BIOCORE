'use client';
import React from 'react';
import Link from 'next/link';
import { useScadaSuggestions } from '@/hooks/useScadaSuggestions';
import { SuggestionList } from '@/components/scada/suggestions/SuggestionList';

export default function ScadaSuggestionsPage() {
  const { suggestions, failed, loading, error, refetch, accept, reject, retry } = useScadaSuggestions();

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">SCADA 写意图审核</h1>
        <div className="flex items-center gap-3 text-sm">
          <button type="button" onClick={refetch} className="text-blue-600 hover:underline">刷新</button>
          <Link href="/scada2" className="text-blue-600 hover:underline">← SCADA 列表</Link>
        </div>
      </div>
      <div className="text-sm text-gray-500">
        {loading ? '加载中…' : `待处理: ${suggestions.length} · 下发失败: ${failed.length}`}
      </div>
      {error && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded text-sm">{error}</div>}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">待处理</h2>
        <SuggestionList suggestions={suggestions} onAccept={accept} onReject={reject} />
      </section>

      {failed.length > 0 && (
        <section className="space-y-2 pt-4 border-t">
          <h2 className="text-sm font-semibold text-red-700">下发失败 (需操作员重试)</h2>
          <SuggestionList
            suggestions={failed}
            onAccept={accept}
            onReject={reject}
            onRetry={retry}
            emptyText="暂无失败下发"
          />
        </section>
      )}
    </div>
  );
}
