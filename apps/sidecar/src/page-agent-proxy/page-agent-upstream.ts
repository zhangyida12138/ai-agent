import type { LlmProviderId } from '../ai/langchain/provider-config';
import { getProviderProfile } from '../ai/langchain/provider-config';

export type PageAgentUpstreamId = LlmProviderId | 'dashscope';

export type PageAgentUpstream = {
  id: PageAgentUpstreamId;
  chatUrl: string;
  apiKey: string;
  defaultModel: string;
};

/** Page Agent OpenAI 兼容代理默认顺序 */
export const PAGE_AGENT_PROVIDER_ORDER: LlmProviderId[] = ['zhipu', 'gemini', 'deepseek'];

function normalizeProviderId(raw: string): LlmProviderId | null {
  const v = raw.toLowerCase().trim();
  if (v === 'zhipu' || v === 'zhipuai' || v === 'glm' || v.startsWith('zhipu-') || v === 'bigmodel') return 'zhipu';
  if (v === 'deepseek' || v.startsWith('deepseek-')) return 'deepseek';
  if (v === 'gemini' || v === 'google' || v.startsWith('gemini')) return 'gemini';
  return null;
}

function geminiOpenAiBaseUrl(): string {
  return (process.env.GEMINI_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(
    /\/$/,
    ''
  );
}

function toOpenAiChatUrl(profile: { baseUrl?: string; id: LlmProviderId }): string {
  if (profile.id === 'gemini') {
    return `${geminiOpenAiBaseUrl()}/chat/completions`;
  }
  const base = (profile.baseUrl || '').replace(/\/$/, '');
  return `${base}/chat/completions`;
}

/**
 * 解析 Page Agent 上游列表。默认智谱 → Gemini（OpenAI 兼容）→ DeepSeek。
 * `PAGE_AGENT_UPSTREAM=dashscope` 时仍走通义单上游（兼容旧配置）。
 */
export function resolvePageAgentUpstreams(): PageAgentUpstream[] {
  const legacy = process.env.PAGE_AGENT_UPSTREAM?.toLowerCase().trim();
  if (legacy === 'dashscope' || legacy === 'qwen') {
    const apiKey = process.env.DASHSCOPE_API_KEY?.trim();
    if (!apiKey) return [];
    const baseUrl = (process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(
      /\/$/,
      ''
    );
    return [
      {
        id: 'dashscope',
        chatUrl: `${baseUrl}/chat/completions`,
        apiKey,
        defaultModel: process.env.DASHSCOPE_MODEL || 'qwen-plus'
      }
    ];
  }

  const rawOrder = process.env.PAGE_AGENT_FAILOVER_ORDER?.trim();
  const order: LlmProviderId[] = rawOrder
    ? rawOrder
        .split(',')
        .map((s) => normalizeProviderId(s.trim()))
        .filter((id): id is LlmProviderId => id !== null)
    : [...PAGE_AGENT_PROVIDER_ORDER];

  const upstreams: PageAgentUpstream[] = [];
  for (const id of order) {
    const profile = getProviderProfile(id);
    if (!profile) continue;
    upstreams.push({
      id,
      chatUrl: toOpenAiChatUrl(profile),
      apiKey: profile.apiKey,
      defaultModel: profile.chatModel
    });
  }
  return upstreams;
}

export function buildUpstreamRequestBody(body: unknown, defaultModel: string): string {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return JSON.stringify({ ...(body as Record<string, unknown>), model: defaultModel });
  }
  return JSON.stringify({ model: defaultModel });
}

export function shouldFailoverPageAgentHttp(status: number): boolean {
  if (status === 402 || status === 429) return true;
  if (status === 401 || status === 403) return true;
  if (status >= 500) return true;
  if (status === 408) return true;
  return false;
}
