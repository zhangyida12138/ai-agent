export type LlmProviderId = 'zhipu' | 'qwen' | 'deepseek' | 'gemini';

export type ProviderProfile = {
  id: LlmProviderId;
  apiKey: string;
  baseUrl?: string;
  chatModel: string;
  embeddingModel: string;
};

/** 默认故障转移：智谱 → 千问 → DeepSeek → Gemini */
export const DEFAULT_AI_FAILOVER_ORDER: LlmProviderId[] = ['zhipu', 'qwen', 'deepseek', 'gemini'];

function normalizeProviderId(raw: string): LlmProviderId | null {
  const v = raw.toLowerCase().trim();
  if (v === 'zhipu' || v === 'zhipuai' || v === 'glm' || v.startsWith('zhipu-') || v === 'bigmodel') return 'zhipu';
  if (v === 'qwen' || v === 'dashscope' || v === 'tongyi' || v === 'aliyun' || v.startsWith('qwen-')) return 'qwen';
  if (v === 'deepseek' || v.startsWith('deepseek-')) return 'deepseek';
  if (v === 'gemini' || v === 'google' || v.startsWith('gemini')) return 'gemini';
  return null;
}

function parseFailoverOrder(raw: string): LlmProviderId[] {
  return raw
    .split(',')
    .map((s) => normalizeProviderId(s.trim()))
    .filter((id): id is LlmProviderId => id !== null);
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

  if (id === 'qwen') {
    const apiKey = (process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY)?.trim();
    if (!apiKey) return null;
    return {
      id: 'qwen',
      apiKey,
      baseUrl: (process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(
        /\/$/,
        ''
      ),
      chatModel: process.env.DASHSCOPE_MODEL || process.env.QWEN_MODEL || 'qwen-plus',
      embeddingModel: process.env.DASHSCOPE_EMBEDDING_MODEL || process.env.QWEN_EMBEDDING_MODEL || 'text-embedding-v3'
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
 * 解析主聊天/RAG 故障转移顺序。默认智谱 → 千问 → DeepSeek → Gemini。
 * 可用 `AI_FAILOVER_ORDER` 覆盖（逗号分隔，如 `zhipu,qwen,deepseek,gemini`）。
 */
export function resolveFailoverOrder(preferredKind?: string | null): LlmProviderId[] {
  const raw = process.env.AI_FAILOVER_ORDER?.trim();
  const base = raw ? parseFailoverOrder(raw) : [...DEFAULT_AI_FAILOVER_ORDER];

  const preferred = preferredKind ? normalizeProviderId(preferredKind) : null;
  const ordered: LlmProviderId[] = [];
  const push = (id: LlmProviderId | null) => {
    if (!id) return;
    if (!ordered.includes(id)) ordered.push(id);
  };

  push(preferred);
  for (const id of base) push(id);

  return ordered.filter((id) => getProviderProfile(id) !== null);
}
