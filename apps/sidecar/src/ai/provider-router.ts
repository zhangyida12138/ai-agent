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

    // For MVP: implement only mock provider now.
    return Promise.reject({
      code: ErrorCodes.PROVIDER_NOT_CONFIGURED,
      message: `Provider kind "${kind}" is not implemented in MVP (use mock).`
    });
  }
}

