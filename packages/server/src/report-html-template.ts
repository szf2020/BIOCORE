// ============================================================
// report-html-template.ts — 报告 HTML 渲染模板
// 用于浏览器预览和 Puppeteer PDF 生成
// ============================================================

import type { Report } from '../../ai-gateway/src/report-types';

// 简易 Markdown → HTML (支持标题/粗体/列表/段落)
function mdToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hul])(.+)$/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '');
}

export function renderReportHtml(report: Report): string {
  const chaptersHtml = report.chapters.map(ch => `
    <section class="chapter">
      <h2>${ch.title}</h2>
      ${ch.sections.map(s => `
        <div class="section">
          ${ch.sections.length > 1 ? `<h3>${s.title}</h3>` : ''}
          ${s.chart_svg || ''}
          <div class="content">${mdToHtml(s.content)}</div>
        </div>
      `).join('')}
    </section>
  `).join('<div class="page-break"></div>');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${report.title}</title>
  <style>
    @page { size: A4; margin: 25mm 20mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
      font-size: 11pt;
      line-height: 1.8;
      color: #1a1a1a;
      background: #fff;
      padding: 40px;
      max-width: 210mm;
      margin: 0 auto;
    }

    /* 封面 */
    .cover {
      text-align: center;
      padding: 80px 0 60px;
      border-bottom: 3px solid #2563eb;
      margin-bottom: 40px;
    }
    .cover .logo { font-size: 28pt; font-weight: 700; color: #2563eb; letter-spacing: 4px; }
    .cover .title { font-size: 18pt; font-weight: 600; margin-top: 24px; color: #111; }
    .cover .subtitle { font-size: 11pt; color: #666; margin-top: 12px; }
    .cover .meta { font-size: 10pt; color: #999; margin-top: 32px; }

    /* 目录 */
    .toc { margin-bottom: 40px; }
    .toc h2 { font-size: 14pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 16px; }
    .toc ol { padding-left: 24px; }
    .toc li { font-size: 11pt; line-height: 2.2; color: #333; }

    /* 章节 */
    .chapter { margin-bottom: 32px; }
    .chapter h2 {
      font-size: 14pt; font-weight: 600; color: #2563eb;
      border-left: 4px solid #2563eb; padding-left: 12px;
      margin-bottom: 16px;
    }
    .section { margin-bottom: 20px; }
    .section h3 { font-size: 12pt; font-weight: 600; color: #333; margin-bottom: 8px; }
    .content p { margin-bottom: 8px; text-indent: 2em; text-align: justify; }
    .content ul, .content ol { margin: 8px 0 8px 2em; }
    .content li { margin-bottom: 4px; }
    .content strong { color: #b91c1c; }

    /* 页脚 */
    .footer {
      margin-top: 60px; padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 9pt; color: #999; text-align: center;
    }

    .page-break { page-break-after: always; height: 0; }

    @media print {
      body { padding: 0; }
      .cover { page-break-after: always; }
    }
  </style>
</head>
<body>

  <!-- 封面 -->
  <div class="cover">
    <div class="logo">BIOCore</div>
    <div class="title">${report.title}</div>
    <div class="subtitle">实验室R&D发酵控制平台 — AI 自动生成报告</div>
    <div class="meta">
      批次: ${report.batch_id}<br>
      生成时间: ${new Date(report.created_at).toLocaleString('zh-CN')}<br>
      ${report.updated_at !== report.created_at ? `最后更新: ${new Date(report.updated_at).toLocaleString('zh-CN')}` : ''}
    </div>
  </div>

  <!-- 目录 -->
  <div class="toc">
    <h2>目录</h2>
    <ol>
      ${report.chapters.map(ch => `<li>${ch.title}</li>`).join('\n      ')}
    </ol>
  </div>

  <div class="page-break"></div>

  <!-- 正文 -->
  ${chaptersHtml}

  <!-- 页脚 -->
  <div class="footer">
    本报告由 BIOCore AI 自动生成 | ${new Date().toLocaleDateString('zh-CN')}
  </div>

</body>
</html>`;
}
