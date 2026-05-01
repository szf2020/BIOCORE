// Ollama 本地 LLM 客户端

export class OllamaClient {
  private baseUrl: string;
  private defaultModel: string;

  constructor(baseUrl = 'http://localhost:11434', defaultModel = 'gemma4') {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  async checkStatus(): Promise<{ available: boolean; models: string[] }> {
    try {
      const resp = await fetch(`${this.baseUrl}/api/tags`);
      if (!resp.ok) return { available: false, models: [] };
      const data = await resp.json() as any;
      return { available: true, models: (data.models || []).map((m: any) => m.name) };
    } catch {
      return { available: false, models: [] };
    }
  }

  async chat(messages: { role: string; content: string }[], model?: string): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || this.defaultModel, messages, stream: false }),
    });
    if (!resp.ok) throw new Error(`Ollama chat failed: ${resp.status}`);
    const data = await resp.json() as any;
    return data.message?.content || '';
  }

  async generate(prompt: string, model?: string): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || this.defaultModel, prompt, stream: false }),
    });
    if (!resp.ok) throw new Error(`Ollama generate failed: ${resp.status}`);
    const data = await resp.json() as any;
    return data.response || '';
  }
}
