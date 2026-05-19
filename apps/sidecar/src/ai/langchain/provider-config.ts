export type LlmProviderId = 'zhipu' | 'deepseek' | 'gemini';

export type ProviderProfile = {
  id: LlmProviderId;
  apiKey: string;
  baseUrl?: string;
  chatModel: string;
  embeddingModel: string;
};

/** 故障转移时，在 primary/fallback 之后按此顺序尝试其余已配置的提供商 */
const FAILOVER_CHAIN: LlmProviderId[] = ['zhipu', 'gemini', 'deepseek'];

function normalizeProviderId(raw: string): LlmProviderId | null {
  const v = raw.toLowerCase().trim();
  if (v === 'zhipu' || v === 'zhipuai' || v === 'glm' || v.startsWith('zhipu-') || v === 'bigmodel') return 'zhipu';
  if (v === 'deepseek' || v.startsWith('deepseek-')) return 'deepseek';
  if (v === 'gemini' || v === 'google' || v.startsWith('gemini')) return 'gemini';
  return null;
}

export function getProviderProfile(id: LlmProviderId): ProviderProfile | null {
  if (id === 'zhipu') {
    const apiKey = (process.env.ZHIPU_API_KEY || process.env.ZHIPUAI_API_KEY)?.trim();
    if (!apiKey) return null;
    return {
      id: 'zhipu',
      apiKey,
      baseUrl: (process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, ''),
      chatModel: process.env.ZHIPU_MODEL || 'glm-4-flash',
      embeddingModel: process.env.ZHIPU_EMBEDDING_MODEL || 'embedding-3'
    };
  }

  if (id === 'deepseek') {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      id: 'deepseek',
      apiKey,
      baseUrl: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
      chatModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      embeddingModel: process.env.DEEPSEEK_EMBEDDING_MODEL || 'text-embedding-3-small'
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  if (!apiKey) return null;
  const baseUrl = process.env.GEMINI_BASE_URL?.trim().replace(/\/$/, '');
  return {
    id: 'gemini',
    apiKey,
    baseUrl: baseUrl || undefined,
    chatModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004'
  };
}

/**
 * 默认智谱优先；失败时按 AI_FALLBACK_PROVIDER（默认 deepseek）及链上其余已配置提供商切换。
 */
export function resolveFailoverOrder(preferredKind?: string | null): LlmProviderId[] {
  const primary =
    normalizeProviderId(process.env.AI_PRIMARY_PROVIDER || process.env.AI_PROVIDER_KIND || 'zhipu') ?? 'zhipu';
  const fallback = normalizeProviderId(process.env.AI_FALLBACK_PROVIDER || 'deepseek') ?? 'deepseek';
  const preferred = preferredKind ? normalizeProviderId(preferredKind) : null;

  const ordered: LlmProviderId[] = [];
  const push = (id: LlmProviderId | null) => {
    if (!id) return;
    if (!ordered.includes(id)) ordered.push(id);
  };

  push(preferred);
  push(primary);
  push(fallback);
  for (const id of FAILOVER_CHAIN) push(id);

  return ordered.filter((id) => getProviderProfile(id) !== null);
}
