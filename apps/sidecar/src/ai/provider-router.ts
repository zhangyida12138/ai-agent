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
  async generateText(req: ProviderRequest): Promise<ProviderTextResponse> {
    const kind = (req.providerKind || process.env.AI_PROVIDER_KIND || 'mock').toLowerCase();

    if (kind === 'mock') {
      const messages = req.input.messages ?? [];
      const lastUser = messages.slice().reverse().find((m) => m.role === 'user')?.content ?? '';

      // Detect injected local-knowledge evidence.
      const evidenceMsg = messages.find((m) => typeof m.content === 'string' && m.content.includes('<<EVIDENCE>>'));
      const evidenceRaw = evidenceMsg?.content ?? '';
      const evidenceStart = evidenceRaw.indexOf('<<EVIDENCE>>');
      const evidenceEnd = evidenceRaw.indexOf('<</EVIDENCE>>');

      if (evidenceStart >= 0 && evidenceEnd > evidenceStart) {
        const jsonText = evidenceRaw.slice(evidenceStart + '<<EVIDENCE>>'.length, evidenceEnd).trim();
        try {
          const parsed = JSON.parse(jsonText) as Array<{
            id: string;
            source: { docId: string; path: string };
            score: number;
            text: string;
          }>;

          const sorted = parsed.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          const best = sorted[0];

          if (best) {
            const score = typeof best.score === 'number' ? best.score : 0;
            const excerpt = (best.text ?? '').slice(0, 240);
            const sourcePath = best.source?.path ?? best.source?.docId ?? 'unknown';

            return {
              text:
                `【RAG模拟回复】我从本地知识库检索到证据并用于回答。\n` +
                `- 证据来源：${sourcePath}\n` +
                `- 证据 score：${score}\n` +
                `- 证据片段：${excerpt}\n\n` +
                `基于上述证据，我对你的问题“${lastUser}”的回答是：` +
                `\n${excerpt || '（证据片段为空）'}`,
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
            };
          }
        } catch {
          // Ignore evidence parsing errors and fall back to default mock reply.
        }
      }

      return {
        text: `【模拟回复】收到你的消息：${lastUser}`,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
      };
    }

    if (kind === 'deepseek' || kind.startsWith('deepseek-')) {
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

      const payload: any = {
        model,
        messages,
        stream: false
      };
      if (typeof temperature === 'number') payload.temperature = temperature;
      if (typeof topP === 'number') payload.top_p = topP;
      if (typeof maxTokens === 'number') payload.max_tokens = maxTokens;

      const url = `${baseUrl}/chat/completions`;
      let raw: string;
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        });

        raw = await resp.text();
        let data: any = null;
        try {
          data = JSON.parse(raw);
        } catch {
          // Keep data null; we'll use raw for message fallback.
        }

        if (!resp.ok) {
          const errMsg =
            data?.error?.message ??
            data?.message ??
            raw ??
            `DeepSeek request failed with HTTP ${resp.status}`;

          // Keep as a non-narrowed type; we assign different ErrorCodes based on HTTP status.
          let code: string = ErrorCodes.INTERNAL_PROVIDER_ERROR;
          if (resp.status === 401 || resp.status === 403) code = ErrorCodes.AUTH_FAILED;
          else if (resp.status === 429) code = ErrorCodes.RATE_LIMITED;
          else if (resp.status === 413) code = ErrorCodes.REQUEST_TOO_LARGE;
          else if (resp.status >= 500) code = ErrorCodes.PROVIDER_UNAVAILABLE;

          throw {
            code,
            message: errMsg,
            retryable: resp.status >= 500 || resp.status === 429
          };
        }

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
      } catch (e: any) {
        if (e?.code) throw e; // preserve our structured errors

        throw {
          code: ErrorCodes.PROVIDER_UNAVAILABLE,
          message: `DeepSeek provider call failed: ${e?.message ? String(e.message) : String(e)}`,
          retryable: true
        };
      }
    }

    return Promise.reject({
      code: ErrorCodes.PROVIDER_NOT_CONFIGURED,
      message: `Provider kind "${kind}" is not implemented (supported: mock, deepseek).`
    });
  }
}

