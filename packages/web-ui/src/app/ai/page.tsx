'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bot, Send, User, Cpu, Activity, FileText } from 'lucide-react';
import { ReportPreview } from '@/components/report/ReportPreview';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface AiStatus {
  available: boolean;
  model?: string;
  status?: string;
}

// 报告意图检测 (与服务端同步)
const REPORT_KEYWORDS = ['报告', '报表', 'report', '生成报告', '批次报告', '分析报告'];
const BATCH_ID_PATTERN = /BATCH-\d{8}-\d{3}/i;

function detectReportIntent(msg: string): { isReport: boolean; batchId?: string; focus?: string } {
  const has = REPORT_KEYWORDS.some(k => msg.includes(k));
  if (!has) return { isReport: false };
  const m = msg.match(BATCH_ID_PATTERN);
  const focusPatterns = [/重点分析(.+)/, /关注(.+)/, /分析(.+?)的/, /特别是(.+)/];
  let focus: string | undefined;
  for (const p of focusPatterns) { const r = msg.match(p); if (r) { focus = r[1].trim(); break; } }
  return { isReport: true, batchId: m?.[0], focus };
}

const QUICK_QUESTIONS = [
  '当前DO趋势分析',
  '本批次与历史对比',
  '最近异常原因',
  '补料速率建议',
];

export default function AiPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: '你好，我是BIOCore AI助手。可以帮助你分析发酵数据、诊断异常、优化工艺参数，也可以为你生成批次分析报告。\n\n试试说: "帮我生成 BATCH-20260413-001 的批次报告"', timestamp: new Date().toISOString() },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus>({ available: false });
  const [statusLoading, setStatusLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  // 报告状态
  const [activeReport, setActiveReport] = useState<any>(null);
  const [reportSessionId, setReportSessionId] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/ai/status`)
      .then(r => r.ok ? r.json() : { available: false })
      .then(setAiStatus)
      .catch(() => setAiStatus({ available: false }))
      .finally(() => setStatusLoading(false));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const userMsg: Message = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const intent = detectReportIntent(trimmed);

      // 如果有活跃报告且不是新报告请求, 作为修改指令
      if (reportSessionId && !intent.isReport) {
        setRefining(true);
        const res = await fetch(`${API}/api/ai/report/${reportSessionId}/refine`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: trimmed }),
        });
        if (res.ok) {
          const data = await res.json();
          setActiveReport(data.report);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `已更新报告。修改内容: ${trimmed.slice(0, 40)}${trimmed.length > 40 ? '...' : ''}`,
            timestamp: new Date().toISOString(),
          }]);
        }
        setRefining(false);
        setSending(false);
        return;
      }

      // 报告生成意图
      if (intent.isReport && intent.batchId) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `正在为 ${intent.batchId} 生成批次分析报告${intent.focus ? `，重点: ${intent.focus}` : ''}...\n这可能需要1-2分钟，请稍候。`,
          timestamp: new Date().toISOString(),
        }]);

        const res = await fetch(`${API}/api/ai/report/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch_id: intent.batchId, focus: intent.focus }),
        });

        const data = await res.json().catch(() => null);
        if (res.ok && data?.report) {
          setActiveReport(data.report);
          setReportSessionId(data.session_id);
          const chapterList = data.report.chapters.map((ch: any, i: number) => `${i + 1}. ${ch.title}`).join('\n');
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `报告已生成! 包含以下章节:\n${chapterList}\n\n右侧面板可预览和下载报告。你也可以继续对话修改报告内容。`,
            timestamp: new Date().toISOString(),
          }]);
        } else {
          const errMsg = data?.error || `HTTP ${res.status}`;
          console.error('[AI Report] 前端错误:', res.status, errMsg);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `报告生成失败: ${errMsg}`,
            timestamp: new Date().toISOString(),
          }]);
        }
        setSending(false);
        return;
      }

      // 报告意图但缺少批次号
      if (intent.isReport && !intent.batchId) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '请提供批次号，例如: "帮我生成 BATCH-20260413-001 的批次报告"',
          timestamp: new Date().toISOString(),
        }]);
        setSending(false);
        return;
      }

      // 普通对话
      const res = await fetch(`${API}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })) }),
      });
      if (!res.ok) throw new Error('请求失败');
      const data = await res.json();
      const reply = data.reply ?? data.content ?? data.message ?? '抱歉，暂时无法回答。';
      setMessages(prev => [...prev, { role: 'assistant', content: reply, timestamp: new Date().toISOString() }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'AI服务暂时不可用，请稍后再试。', timestamp: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  }, [sending, messages, reportSessionId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const handleRefine = (instruction: string) => {
    sendMessage(instruction);
  };

  return (
    <div className="h-full flex p-4 gap-4">
      {/* Left: Chat */}
      <div className={`flex flex-col min-w-0 ${activeReport ? 'w-[400px] flex-shrink-0' : 'flex-1'}`}>
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="pb-2 flex-shrink-0">
            <CardTitle className="text-base flex items-center gap-2"><Bot className="w-4 h-4" />AI 助手</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
            {/* Messages */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role !== 'user' && (
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      {msg.role === 'system' ? <Cpu className="w-3.5 h-3.5 text-primary" /> : <Bot className="w-3.5 h-3.5 text-primary" />}
                    </div>
                  )}
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <span className="text-sm opacity-50 mt-1 block">{new Date(msg.timestamp).toLocaleTimeString('zh-CN')}</span>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div className="flex gap-2 items-center text-muted-foreground text-sm">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-3.5 h-3.5 text-primary animate-pulse" />
                  </div>
                  {refining ? '正在更新报告...' : '思考中...'}
                </div>
              )}
            </div>
            {/* Quick actions */}
            {!activeReport && (
              <div className="px-4 pb-2 flex gap-2 flex-wrap">
                {QUICK_QUESTIONS.map(q => (
                  <button key={q} onClick={() => sendMessage(q)} disabled={sending}
                    className="text-sm px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground transition-colors disabled:opacity-50">
                    {q}
                  </button>
                ))}
              </div>
            )}
            {/* Input */}
            <div className="border-t p-3 flex gap-2 flex-shrink-0">
              <Input
                placeholder={activeReport ? '输入修改指令, 如: 加一段pH波动分析...' : '输入问题...'}
                value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                disabled={sending} className="flex-1"
              />
              <Button size="icon" onClick={() => sendMessage(input)} disabled={sending || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right: Report Preview or Sidebar */}
      {activeReport && reportSessionId ? (
        <div className="flex-1 min-w-0">
          <ReportPreview
            sessionId={reportSessionId}
            report={activeReport}
            onRefine={handleRefine}
            refining={refining}
          />
        </div>
      ) : (
        <div className="w-72 flex-shrink-0 space-y-4">
          {/* AI Status */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" />模型状态</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {statusLoading ? <p className="text-muted-foreground">检测中...</p> : (
                <>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${aiStatus.available ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span>{aiStatus.available ? '在线' : '离线'}</span>
                  </div>
                  {aiStatus.model && <div className="text-muted-foreground">模型: {aiStatus.model}</div>}
                </>
              )}
            </CardContent>
          </Card>

          {/* Report quick start */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" />生成报告</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>在对话中描述需求即可生成报告:</p>
              <button
                onClick={() => sendMessage('帮我生成 BATCH-20260413-001 的批次报告')}
                disabled={sending}
                className="w-full text-left text-sm px-3 py-2 rounded bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50"
              >
                "帮我生成 BATCH-xxx 的批次报告"
              </button>
              <button
                onClick={() => sendMessage('帮我生成 BATCH-20260413-001 的批次报告, 重点分析DO偏低原因')}
                disabled={sending}
                className="w-full text-left text-sm px-3 py-2 rounded bg-muted hover:bg-muted/80 transition-colors disabled:opacity-50"
              >
                "...重点分析DO偏低原因"
              </button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
