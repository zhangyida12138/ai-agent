import type { LlmProviderId } from '../ai/langchain/provider-config';
import { getProviderProfile } from '../ai/langchain/provider-config';

export type PageAgentUpstreamId = LlmProviderId;

export type PageAgentUpstream = {
  id: PageAgentUpstreamId;
  chatUrl: string;
  apiKey: string;
  defaultModel: string;
  pageAgentModel: string;
};

/** Page Agent 默认优先千问；故障转移：千问 → 智谱 → DeepSeek → Gemini */
export const PAGE_AGENT_FAILOVER_DEFAULT: LlmProviderId[] = ['qwen', 'zhipu', 'deepseek', 'gemini'];

const PAGE_AGENT_DEFAULT_MODEL: Record<LlmProviderId, string> = {
  zhipu: 'glm-4-plus',
  qwen: 'qwen-plus',
  gemini: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat'
};

function normalizePageAgentProviderId(raw: string): LlmProviderId | null {
  const v = raw.toLowerCase().trim();
  if (v === 'zhipu' || v === 'zhipuai' || v === 'glm' || v.startsWith('zhipu-') || v === 'bigmodel') return 'zhipu';
  if (v === 'qwen' || v === 'dashscope' || v === 'tongyi' || v === 'aliyun' || v.startsWith('qwen-')) return 'qwen';
  if (v === 'deepseek' || v.startsWith('deepseek-')) return 'deepseek';
  if (v === 'gemini' || v === 'google' || v.startsWith('gemini')) return 'gemini';
  return null;
}

/**
 * 各上游使用各自模型名。勿将 PAGE_AGENT_MODEL（千问）套用到智谱/Gemini，否则会 400「模型不存在」。
 */
function resolvePageAgentModel(id: LlmProviderId, chatModel: string): string {
  if (id === 'qwen') {
    return (
      process.env.PAGE_AGENT_QWEN_MODEL?.trim() ||
      process.env.PAGE_AGENT_DASHSCOPE_MODEL?.trim() ||
      process.env.PAGE_AGENT_MODEL?.trim() ||
      process.env.DASHSCOPE_MODEL?.trim() ||
      PAGE_AGENT_DEFAULT_MODEL.qwen
    );
  }
  if (id === 'zhipu') {
    return process.env.PAGE_AGENT_ZHIPU_MODEL?.trim() || PAGE_AGENT_DEFAULT_MODEL.zhipu;
  }
  if (id === 'gemini') {
    return process.env.PAGE_AGENT_GEMINI_MODEL?.trim() || PAGE_AGENT_DEFAULT_MODEL.gemini;
  }
  if (id === 'deepseek') {
    return process.env.PAGE_AGENT_DEEPSEEK_MODEL?.trim() || PAGE_AGENT_DEFAULT_MODEL.deepseek;
  }
  return PAGE_AGENT_DEFAULT_MODEL[id] ?? chatModel;
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
 * Page Agent 上游：默认千问优先（须支持 tools）。
 * `PAGE_AGENT_FAILOVER_ORDER` 可覆盖，如 `qwen,zhipu,deepseek,gemini`。
 * 兼容 `PAGE_AGENT_UPSTREAM=dashscope|qwen`：仅启用千问单上游。
 */
export function resolvePageAgentUpstreams(): PageAgentUpstream[] {
  const legacy = process.env.PAGE_AGENT_UPSTREAM?.toLowerCase().trim();
  if (legacy === 'dashscope' || legacy === 'qwen') {
    const profile = getProviderProfile('qwen');
    if (!profile) return [];
    return [
      {
        id: 'qwen',
        chatUrl: toOpenAiChatUrl(profile),
        apiKey: profile.apiKey,
        defaultModel: profile.chatModel,
        pageAgentModel: resolvePageAgentModel('qwen', profile.chatModel)
      }
    ];
  }

  const rawOrder = process.env.PAGE_AGENT_FAILOVER_ORDER?.trim();
  const order: LlmProviderId[] = rawOrder
    ? rawOrder
        .split(',')
        .map((s) => normalizePageAgentProviderId(s.trim()))
        .filter((id): id is LlmProviderId => id !== null)
    : [...PAGE_AGENT_FAILOVER_DEFAULT];

  const upstreams: PageAgentUpstream[] = [];
  for (const id of order) {
    const profile = getProviderProfile(id);
    if (!profile) continue;
    upstreams.push({
      id,
      chatUrl: toOpenAiChatUrl(profile),
      apiKey: profile.apiKey,
      defaultModel: profile.chatModel,
      pageAgentModel: resolvePageAgentModel(id, profile.chatModel)
    });
  }
  return upstreams;
}

export function buildUpstreamRequestBody(body: unknown, upstream: PageAgentUpstream): string {
  const model = upstream.pageAgentModel;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return JSON.stringify({ ...(body as Record<string, unknown>), model });
  }
  return JSON.stringify({ model });
}

export function shouldFailoverPageAgentHttp(status: number): boolean {
  if (status === 400 || status === 404) return true;
  if (status === 402 || status === 429) return true;
  if (status === 401 || status === 403) return true;
  if (status >= 500) return true;
  if (status === 408) return true;
  return false;
}

/** 上游 body 提示模型 ID 无效时切换下一提供商 */
export function shouldFailoverPageAgentBody(status: number, bodyText: string): boolean {
  if (shouldFailoverPageAgentHttp(status)) return true;
  if (status !== 400 && status !== 404) return false;
  return /模型不存在|model.*not\s*found|invalid.*model|does not exist/i.test(bodyText);
}
