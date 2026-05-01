// ============================================================
// ai-gateway — 本地优先AI网关
// 职责: Ollama LLM对话、NL→Flux查询、批次摘要生成
// ============================================================

export { OllamaClient } from './ollama-client';
export { LLMClient } from './llm-client';
export type { LLMConfig, ChatMessage } from './llm-client';
export { NLToFlux } from './nl-to-flux';
export { BatchSummaryGenerator } from './batch-summary';
export { ContextBuilder } from './context-builder';
export type { BatchSummaryContext } from './types';
export { ReportGenerator } from './report-generator';
export type { Report, ReportChapter, ReportSection, ReportContext } from './report-types';
export { DEFAULT_CHAPTERS } from './report-types';
