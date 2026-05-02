// 测试报告生成流程
import Database from 'better-sqlite3';
import { resolve } from 'path';
import { LLMClient, ReportGenerator } from '@biocore/ai-gateway';

const DB_PATH = resolve(__dirname, '../data/biocore.db');

async function main() {
  // 1. Test LLM
  console.log('[1] 测试 LLM 连接...');
  const llm = new LLMClient();
  try {
    const r = await llm.chat([{ role: 'user', content: 'Say hello in 5 words' }]);
    console.log('  LLM OK:', r.slice(0, 100));
  } catch (e: any) {
    console.log('  LLM FAIL:', e.message);
    return;
  }

  // 2. Test buildReportContext
  console.log('\n[2] 构建报告上下文...');
  const db = new Database(DB_PATH);
  const batch = db.prepare('SELECT * FROM batches WHERE batch_id = ?').get('BATCH-20260413-001') as any;
  if (!batch) { console.log('  批次不存在!'); return; }

  const context = {
    batch_id: batch.batch_id,
    recipe_name: batch.recipe_id,
    recipe_version: batch.recipe_version || '1.0',
    organism: batch.organism || null,
    operator: batch.operator_id || '未记录',
    started_at: batch.started_at || '',
    ended_at: batch.ended_at || '',
    duration_hours: batch.started_at && batch.ended_at
      ? (new Date(batch.ended_at).getTime() - new Date(batch.started_at).getTime()) / 3600000
      : 0,
    outcome: batch.outcome || '未知',
    stats: {
      temp_mean: 37.0, temp_max_dev: 0.3,
      pH_mean: 7.0, pH_max_dev: 0.05,
      DO_mean: 35.0, DO_min: 20.0,
      rpm_max: 500, total_feed_mL: 300, total_base_mL: 45,
    },
    phases: [] as any[],
    events: [] as any[],
    alarms: [] as any[],
  };
  console.log('  上下文 OK:', context.batch_id, context.duration_hours.toFixed(1), 'h');

  // 3. Test report generation (just 1 chapter)
  console.log('\n[3] 生成报告 (仅第一章)...');
  const generator = new ReportGenerator(llm);
  try {
    const report = await generator.generateReport(context);
    console.log('  报告生成 OK!');
    console.log('  标题:', report.title);
    console.log('  章节数:', report.chapters.length);
    report.chapters.forEach((ch: any) => console.log('    -', ch.title, `(${ch.sections[0]?.content?.length || 0} 字)`));
  } catch (e: any) {
    console.log('  报告生成 FAIL:', e.message);
    console.log('  Stack:', e.stack?.slice(0, 300));
  }

  db.close();
}

main();
