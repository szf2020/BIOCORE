// LLM 客户端 — Ollama 本地优先, 云端 (Anthropic) 回退

export interface LLMConfig {
  ollamaUrl: string;         // 默认 http://localhost:11434
  ollamaModel: string;       // 默认 gemma4
  cloudApiKey?: string;      // 可选云端API Key
  cloudApiUrl?: string;      // 可选云端API URL
  cloudModel?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class LLMClient {
  private config: LLMConfig;

  constructor(config: Partial<LLMConfig> = {}) {
    this.config = {
      ollamaUrl: config.ollamaUrl || 'http://localhost:11434',
      ollamaModel: config.ollamaModel || 'gemma4',
      cloudApiKey: config.cloudApiKey,
      cloudApiUrl: config.cloudApiUrl || 'https://api.anthropic.com',
      cloudModel: config.cloudModel || 'claude-sonnet-4-20250514',
    };
  }

  async chat(messages: ChatMessage[], options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    // 优先尝试本地 Ollama
    try {
      return await this.callOllama(messages, options);
    } catch (ollamaError) {
      console.warn('[AI Gateway] Ollama不可用, 尝试云端回退:', (ollamaError as Error).message);

      // 回退到云端 (如果配置了Key)
      if (this.config.cloudApiKey) {
        try {
          return await this.callCloudAPI(messages, options);
        } catch (cloudError) {
          throw new Error(`本地AI和云端AI均不可用。Ollama: ${(ollamaError as Error).message}; Cloud: ${(cloudError as Error).message}`);
        }
      }

      throw new Error('本地AI服务未运行(Ollama), 且未配置云端API Key。请启动Ollama或在设置中配置API Key。');
    }
  }

  private async callOllama(messages: ChatMessage[], options: { temperature?: number; maxTokens?: number }): Promise<string> {
    const response = await fetch(`${this.config.ollamaUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.ollamaModel,
        messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 2000,
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000), // 2分钟超时(CPU推理较慢)
    });

    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }

  private async callCloudAPI(messages: ChatMessage[], options: { temperature?: number; maxTokens?: number }): Promise<string> {
    const response = await fetch(`${this.config.cloudApiUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.cloudApiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.cloudModel,
        max_tokens: options.maxTokens ?? 2000,
        messages: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
        system: messages.find(m => m.role === 'system')?.content,
        temperature: options.temperature ?? 0.3,
      }),
    });

    if (!response.ok) throw new Error(`Cloud API HTTP ${response.status}`);
    const data = await response.json() as any;
    return data.content?.[0]?.text || '';
  }

  // 检查 Ollama 可用性
  async checkOllamaStatus(): Promise<{ available: boolean; models: string[] }> {
    try {
      const resp = await fetch(`${this.config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) return { available: false, models: [] };
      const data = await resp.json() as any;
      return { available: true, models: data.models?.map((m: any) => m.name) || [] };
    } catch {
      return { available: false, models: [] };
    }
  }
}
