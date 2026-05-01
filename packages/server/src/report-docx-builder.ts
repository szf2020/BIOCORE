// ============================================================
// report-docx-builder.ts — 报告 Word (.docx) 导出
// 使用 docx 库生成结构化 Word 文档
// ============================================================

import type { Report } from '../../ai-gateway/src/report-types';

// docx 可能未安装, 运行时动态加载
let docxLib: any = null;

async function loadDocx() {
  if (docxLib) return docxLib;
  try {
    // @ts-ignore — docx 为可选依赖
    docxLib = await import(/* webpackIgnore: true */ 'docx');
    return docxLib;
  } catch {
    throw new Error('docx 库未安装, 请运行: pnpm --filter @biocore/server add docx');
  }
}

// 简单将 markdown 文本拆分为段落
function splitParagraphs(md: string): string[] {
  return md
    .replace(/^#{1,4}\s+(.+)$/gm, '$1')  // 去掉 markdown 标题标记
    .replace(/\*\*(.+?)\*\*/g, '$1')       // 去掉粗体标记
    .replace(/\*(.+?)\*/g, '$1')           // 去掉斜体标记
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean);
}

export async function buildReportDocx(report: Report): Promise<Buffer> {
  const docx = await loadDocx();
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Footer, PageNumber } = docx;

  const children: any[] = [];

  // 封面标题
  children.push(
    new Paragraph({ spacing: { before: 4000 }, alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: 'BIOCore', size: 56, bold: true, color: '2563eb', font: 'Microsoft YaHei' }),
    ]}),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600 }, children: [
      new TextRun({ text: report.title, size: 36, bold: true, font: 'Microsoft YaHei' }),
    ]}),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [
      new TextRun({ text: '实验室R&D发酵控制平台 — AI 自动生成报告', size: 22, color: '666666', font: 'Microsoft YaHei' }),
    ]}),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800 }, children: [
      new TextRun({ text: `批次: ${report.batch_id}  |  生成时间: ${new Date(report.created_at).toLocaleString('zh-CN')}`, size: 20, color: '999999', font: 'Microsoft YaHei' }),
    ]}),
    new Paragraph({ pageBreakBefore: true, text: '' }), // 分页
  );

  // 目录标题
  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 }, children: [
      new TextRun({ text: '目录', size: 28, bold: true, font: 'Microsoft YaHei' }),
    ]}),
  );
  report.chapters.forEach((ch, i) => {
    children.push(new Paragraph({ spacing: { before: 100 }, children: [
      new TextRun({ text: `${i + 1}. ${ch.title}`, size: 22, font: 'Microsoft YaHei' }),
    ]}));
  });
  children.push(new Paragraph({ pageBreakBefore: true, text: '' }));

  // 各章节
  for (const chapter of report.chapters) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 }, children: [
        new TextRun({ text: chapter.title, size: 28, bold: true, color: '2563eb', font: 'Microsoft YaHei' }),
      ]}),
    );

    for (const section of chapter.sections) {
      if (chapter.sections.length > 1) {
        children.push(
          new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }, children: [
            new TextRun({ text: section.title, size: 24, bold: true, font: 'Microsoft YaHei' }),
          ]}),
        );
      }

      for (const para of splitParagraphs(section.content)) {
        if (para.startsWith('- ') || para.startsWith('• ')) {
          // 列表项
          const items = para.split('\n').filter(l => l.startsWith('- ') || l.startsWith('• '));
          for (const item of items) {
            children.push(new Paragraph({ bullet: { level: 0 }, spacing: { before: 40 }, children: [
              new TextRun({ text: item.replace(/^[-•]\s*/, ''), size: 22, font: 'Microsoft YaHei' }),
            ]}));
          }
        } else {
          children.push(new Paragraph({ spacing: { before: 80, after: 80 }, indent: { firstLine: 480 }, children: [
            new TextRun({ text: para, size: 22, font: 'Microsoft YaHei' }),
          ]}));
        }
      }
    }
  }

  // 页脚
  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1200, right: 1200 } },
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: 'BIOCore AI 自动生成报告  |  第 ', size: 16, color: '999999' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999' }),
            new TextRun({ text: ' 页', size: 16, color: '999999' }),
          ]})],
        }),
      },
      children,
    }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
