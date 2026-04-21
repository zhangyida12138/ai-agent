import { ErrorCodes } from '@ai-agent/shared';

export type ProviderTaskType = 'chat' | 'summarize' | 'embeddings' | 'vision';

export type ProviderRequest = {
  requestId: string;
  taskType: ProviderTaskType;
  providerKind: string;
  modelId?: string | null;
  input: {
    prompt?: string | null;
    messages?: Array<{ role: string; content: string }>;
    texts?: string[];
  };
  generation?: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
};

export type ProviderTextResponse = {
  text: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
};

export class AIProviderRouter {
  private async callDeepSeek(
    req: ProviderRequest,
    stream: boolean,
    onDelta?: (delta: string) => void,
    options?: { signal?: AbortSignal; shouldStop?: () => boolean }
  ): Promise<ProviderTextResponse> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw {
        code: ErrorCodes.AUTH_FAILED,
        message: 'DEEPSEEK_API_KEY is required (see root .env)',
        retryable: false
      };
    }

    const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
    const model = String(req.modelId || process.env.DEEPSEEK_MODEL || 'deepseek-chat');
    const messages = req.input.messages ?? [];
    const temperature = req.generation?.temperature;
    const topP = req.generation?.topP;
    const maxTokens = req.generation?.maxTokens;
    const payload: any = { model, messages, stream };
    if (typeof temperature === 'number') payload.temperature = temperature;
    if (typeof topP === 'number') payload.top_p = topP;
    if (typeof maxTokens === 'number') payload.max_tokens = maxTokens;

    const url = `${baseUrl}/chat/completions`;
    const shouldStop = options?.shouldStop;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: options?.signal
    });

    if (!resp.ok) {
      const raw = await resp.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
      const errMsg = data?.error?.message ?? data?.message ?? raw ?? `DeepSeek request failed with HTTP ${resp.status}`;
      let code: string = ErrorCodes.INTERNAL_PROVIDER_ERROR;
      if (resp.status === 401 || resp.status === 403) code = ErrorCodes.AUTH_FAILED;
      else if (resp.status === 429) code = ErrorCodes.RATE_LIMITED;
      else if (resp.status === 413) code = ErrorCodes.REQUEST_TOO_LARGE;
      else if (resp.status >= 500) code = ErrorCodes.PROVIDER_UNAVAILABLE;
      throw { code, message: errMsg, retryable: resp.status >= 500 || resp.status === 429 };
    }

    if (!stream) {
      const data = (await resp.json()) as any;
      const content = String(data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '');
      const usage = data?.usage;
      return {
        text: content,
        usage: usage
          ? {
              promptTokens: Number(usage.prompt_tokens ?? 0),
              completionTokens: Number(usage.completion_tokens ?? 0),
              totalTokens: Number(usage.total_tokens ?? 0)
            }
          : undefined
      };
    }

    if (!resp.body) {
      throw {
        code: ErrorCodes.PROVIDER_UNAVAILABLE,
        message: 'DeepSeek stream body is empty',
        retryable: true
      };
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    while (true) {
      if (shouldStop?.()) {
        throw {
          code: 'ABORTED',
          message: 'Stream aborted by caller',
          retryable: false,
          partialText: text
        };
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payloadText = trimmed.slice(5).trim();
        if (!payloadText || payloadText === '[DONE]') continue;
        let parsed: any = null;
        try {
          parsed = JSON.parse(payloadText);
        } catch {
          continue;
        }
        const delta = String(parsed?.choices?.[0]?.delta?.content ?? '');
        if (!delta) continue;
        text += delta;
        onDelta?.(delta);
      }
    }
    return { text };
  }

  async generateText(req: ProviderRequest): Promise<ProviderTextResponse> {
    const kind = (req.providerKind || process.env.AI_PROVIDER_KIND || 'deepseek').toLowerCase();

    if (kind === 'deepseek' || kind.startsWith('deepseek-')) {
      try {
        return await this.callDeepSeek(req, false);
      } catch (e: any) {
        if (e?.code) throw e;
        throw {
          code: ErrorCodes.PROVIDER_UNAVAILABLE,
          message: `DeepSeek provider call failed: ${e?.message ? String(e.message) : String(e)}`,
          retryable: true
        };
      }
    }

    return Promise.reject({
      code: ErrorCodes.PROVIDER_NOT_CONFIGURED,
      message: `Provider kind "${kind}" is not implemented (supported: deepseek).`
    });
  }

  async generateTextStream(
    req: ProviderRequest,
    onDelta: (delta: string) => void,
    options?: { signal?: AbortSignal; shouldStop?: () => boolean }
  ): Promise<ProviderTextResponse> {
    const kind = (req.providerKind || process.env.AI_PROVIDER_KIND || 'deepseek').toLowerCase();
    if (!(kind === 'deepseek' || kind.startsWith('deepseek-'))) {
      throw {
        code: ErrorCodes.PROVIDER_NOT_CONFIGURED,
        message: `Provider kind "${kind}" is not implemented (supported: deepseek).`,
        retryable: false
      };
    }
    try {
      return await this.callDeepSeek(req, true, onDelta, options);
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ABORTED') {
        throw {
          code: 'ABORTED',
          message: 'generation aborted',
          retryable: false,
          partialText: String(e?.partialText ?? '')
        };
      }
      if (e?.code) throw e;
      throw {
        code: ErrorCodes.PROVIDER_UNAVAILABLE,
        message: `DeepSeek provider stream failed: ${e?.message ? String(e.message) : String(e)}`,
        retryable: true
      };
    }
  }

  async generateEmbeddings(req: ProviderRequest): Promise<number[][]> {
    const kind = (req.providerKind || process.env.AI_PROVIDER_KIND || 'deepseek').toLowerCase();
    if (!(kind === 'deepseek' || kind.startsWith('deepseek-'))) {
      throw {
        code: ErrorCodes.PROVIDER_NOT_CONFIGURED,
        message: `Provider kind "${kind}" is not implemented (supported: deepseek).`,
        retryable: false
      };
    }
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw {
        code: ErrorCodes.AUTH_FAILED,
        message: 'DEEPSEEK_API_KEY is required (see root .env)',
        retryable: false
      };
    }
    const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
    const model = String(process.env.DEEPSEEK_EMBEDDING_MODEL || 'text-embedding-3-small');
    const texts = req.input.texts ?? [];
    if (texts.length === 0) return [];
    const resp = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, input: texts })
    });
    const raw = await resp.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!resp.ok) {
      throw {
        code: resp.status === 429 ? ErrorCodes.RATE_LIMITED : ErrorCodes.PROVIDER_UNAVAILABLE,
        message: data?.error?.message ?? data?.message ?? raw ?? `Embedding failed with HTTP ${resp.status}`,
        retryable: resp.status >= 500 || resp.status === 429
      };
    }
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows.map((r: any) => (Array.isArray(r?.embedding) ? r.embedding.map((x: any) => Number(x)) : []));
  }
}

