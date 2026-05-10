/**
 * Page Agent 使用的 OpenAI 兼容 baseURL（不含末尾斜杠），实际请求为 `${baseURL}/chat/completions`。
 * 经 Sidecar 转发到上游（`PAGE_AGENT_UPSTREAM`：deepseek 或 dashscope），模型密钥仅服务端读取。
 */
export function pageAgentLlmBaseUrl(): string {
  const sidecar = (import.meta.env.VITE_SIDECAR_URL as string | undefined) || '/api';
  const trimmed = sidecar.replace(/\/$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return `${trimmed}/page-agent/llm/v1`;
  }
  const prefix = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${prefix}/page-agent/llm/v1`;
}
