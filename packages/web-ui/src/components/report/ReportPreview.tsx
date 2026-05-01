'use client';

import React, { useState } from 'react';
import { FileText, Download, RefreshCw, ChevronRight } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ReportSection {
  id: string;
  title: string;
  content: string;
}

interface ReportChapter {
  id: string;
  title: string;
  sections: ReportSection[];
}

interface Report {
  id: string;
  batch_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  chapters: ReportChapter[];
}

interface ReportPreviewProps {
  sessionId: string;
  report: Report;
  onRefine: (instruction: string) => void;
  refining: boolean;
}

// 简易 Markdown 渲染
function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h4 class="text-sm font-semibold text-foreground mt-3 mb-1">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="text-base font-semibold text-foreground mt-4 mb-2">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-red-600">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-foreground/90">$1</li>')
    .replace(/\n\n/g, '</p><p class="text-foreground/90 text-sm leading-relaxed mb-2 indent-8">')
    .replace(/^(?!<[hlu])(.+)$/gm, '<p class="text-foreground/90 text-sm leading-relaxed mb-2">$1</p>');
}

export function ReportPreview({ sessionId, report, onRefine, refining }: ReportPreviewProps) {
  const [activeChapter, setActiveChapter] = useState(0);
  const [refineInput, setRefineInput] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);

  async function handleExport(format: 'pdf' | 'docx') {
    setExporting(format);
    try {
      const res = await fetch(`${API}/api/ai/report/${sessionId}/export/${format}`);
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.batch_id}_报告.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExporting(null);
  }

  function handleRefineSubmit() {
    if (!refineInput.trim()) return;
    onRefine(refineInput.trim());
    setRefineInput('');
  }

  const chapter = report.chapters[activeChapter];

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col h-full">
      {/* 头部 */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-foreground">{report.title}</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleExport('pdf')}
              disabled={exporting === 'pdf'}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
            >
              <Download size={12} /> {exporting === 'pdf' ? '生成中...' : 'PDF'}
            </button>
            <button
              onClick={() => handleExport('docx')}
              disabled={exporting === 'docx'}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded transition-colors disabled:opacity-50"
            >
              <Download size={12} /> {exporting === 'docx' ? '生成中...' : 'Word'}
            </button>
            <a
              href={`${API}/api/ai/report/${sessionId}/html`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-accent hover:bg-zinc-600 text-foreground rounded transition-colors"
            >
              HTML预览
            </a>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          生成于 {new Date(report.created_at).toLocaleString('zh-CN')}
          {report.updated_at !== report.created_at && ` | 更新于 ${new Date(report.updated_at).toLocaleString('zh-CN')}`}
        </p>
      </div>

      {/* 章节标签 */}
      <div className="flex border-b border-border overflow-x-auto">
        {report.chapters.map((ch, i) => (
          <button
            key={ch.id}
            onClick={() => setActiveChapter(i)}
            className={`px-4 py-2.5 text-xs whitespace-nowrap transition-colors ${
              i === activeChapter
                ? 'text-blue-600 border-b-2 border-blue-400 bg-muted/50'
                : 'text-muted-foreground hover:text-foreground/90'
            }`}
          >
            {ch.title}
          </button>
        ))}
      </div>

      {/* 章节内容 */}
      <div className="flex-1 overflow-y-auto p-5">
        {chapter && (
          <div>
            <h2 className="text-lg font-bold text-blue-600 mb-4 pl-3 border-l-4 border-blue-500">
              {chapter.title}
            </h2>
            {chapter.sections.map(section => (
              <div key={section.id} className="mb-4">
                {chapter.sections.length > 1 && (
                  <h3 className="text-sm font-semibold text-foreground mb-2">{section.title}</h3>
                )}
                <div
                  className="prose-sm"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 迭代修改输入 */}
      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <input
            value={refineInput}
            onChange={e => setRefineInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRefineSubmit()}
            placeholder="修改报告, 如: 加一段pH波动分析..."
            disabled={refining}
            className="flex-1 bg-muted border border-border rounded px-3 py-2 text-sm text-foreground placeholder-zinc-600 disabled:opacity-50"
          />
          <button
            onClick={handleRefineSubmit}
            disabled={refining || !refineInput.trim()}
            className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
          >
            {refining ? <RefreshCw size={14} className="animate-spin" /> : <ChevronRight size={14} />}
            {refining ? '更新中' : '修改'}
          </button>
        </div>
      </div>
    </div>
  );
}
