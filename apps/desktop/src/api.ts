export type Envelope<T> =
  | { ok: true; code: 'SUCCESS'; data: T }
  | { ok: false; code: string; message: string; retryable: boolean; nextAction?: string };

const SIDECAR_URL = import.meta.env.VITE_SIDECAR_URL || '/api';
<<<<<<< HEAD
/** localStorage 中会话 token 的 key（供 Page Agent 等与 api 共用） */
export const AUTH_TOKEN_KEY = 'ai-agent-auth-token';
=======
const AUTH_TOKEN_KEY = 'liefree-auth-token';
>>>>>>> 1cee2820d9e304b50bfcfcf3e00734633a5b27f7

async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${SIDECAR_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader, ...(init?.headers || {}) },
    ...init
  });
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.toLowerCase().includes('application/json');
  const raw = await res.text();

  if (res.status === 413) {
    return {
      ok: false,
      code: 'REQUEST_ENTITY_TOO_LARGE',
      message:
        '上传内容体积过大',
      retryable: false,
      nextAction: '缩小上传文件，或请管理员调大反代与 Sidecar 请求体限制'
    };
  }

  if (!raw) {
    return {
      ok: false,
      code: 'EMPTY_RESPONSE',
      message: `接口返回空响应: ${path}`,
      retryable: true,
      nextAction: '请确认 sidecar 服务已启动并可访问'
    };
  }

  if (!isJson) {
    const trimmed = raw.trim();
    const shortPreview = trimmed.slice(0, 120);
    return {
      ok: false,
      code: 'INVALID_RESPONSE_FORMAT',
      message: `接口未返回 JSON（HTTP ${res.status}）: ${shortPreview}`,
      retryable: true,
      nextAction: '请检查前端 /api 代理或 VITE_SIDECAR_URL 配置'
    };
  }

  try {
    return JSON.parse(raw) as Envelope<T>;
  } catch {
    return {
      ok: false,
      code: 'INVALID_JSON',
      message: `接口 JSON 解析失败（HTTP ${res.status}）`,
      retryable: true,
      nextAction: '请检查 sidecar 返回内容是否为合法 JSON'
    };
  }
}

export async function listConversations(limit = 20) {
  return request<Array<any>>(`/conversations?limit=${encodeURIComponent(String(limit))}`);
}

export async function listMessages(conversationId: string, limit = 50) {
  return request<any>(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=${encodeURIComponent(String(limit))}`);
}

export async function deleteConversation(conversationId: string) {
  return request<any>(`/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' });
}

export async function renameConversation(conversationId: string, title: string) {
  return request<any>(`/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title })
  });
}

export async function exportConversations(conversationIds?: string[]) {
  return request<any>('/conversations/export', {
    method: 'POST',
    body: JSON.stringify({ conversationIds: (conversationIds || []).filter(Boolean) })
  });
}

export async function importConversations(payload: any) {
  return request<any>('/conversations/import', {
    method: 'POST',
    body: JSON.stringify({ payload })
  });
}

export async function sendChat(payload: any) {
  return request<any>(`/chat/send`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function streamChat(
  payload: any,
  handlers: {
    onDelta: (delta: string) => void;
    onDone: (data: any) => void;
    onError: (err: { code?: string; message?: string }) => void;
  },
  options?: { signal?: AbortSignal }
) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${SIDECAR_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(payload),
    signal: options?.signal
  });
  if (!res.ok || !res.body) {
    if (res.status === 413) {
      handlers.onError({
        code: 'REQUEST_ENTITY_TOO_LARGE',
        message:
          '请求体过大（HTTP 413）。请调大反代 client_max_body_size（建议 ≥32m）或缩小对话上下文后再试。'
      });
      return;
    }
    handlers.onError({ code: 'STREAM_START_FAILED', message: `流式请求失败: HTTP ${res.status}` });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const block of chunks) {
      const lines = block.split('\n');
      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        if (line.startsWith('data:')) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      let data: any = null;
      try {
        data = JSON.parse(dataLine);
      } catch {
        continue;
      }
      if (eventName === 'delta') handlers.onDelta(String(data?.delta ?? ''));
      else if (eventName === 'done') handlers.onDone(data);
      else if (eventName === 'error') handlers.onError(data || {});
    }
  }
}

export async function ingestText(payload: any) {
  return request<any>(`/knowledge/ingest-text`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getKnowledgeStats() {
  return request<any>(`/knowledge/stats`, { method: 'GET' });
}

export async function listKnowledgeDocuments() {
  return request<any>('/knowledge/documents', { method: 'GET' });
}

export async function getKnowledgeDocument(docId: string) {
  return request<any>(`/knowledge/documents/${encodeURIComponent(docId)}`, { method: 'GET' });
}

export async function updateKnowledgeDocument(docId: string, payload: { title: string | null; text: string }) {
  return request<any>(`/knowledge/documents/${encodeURIComponent(docId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function deleteKnowledgeDocument(docId: string) {
  return request<any>(`/knowledge/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' });
}

export async function register(payload: { username: string; password: string }) {
  return request<any>('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
}

export async function login(payload: { username: string; password: string }) {
  return request<any>('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
}

export async function me() {
  return request<any>('/auth/me', { method: 'GET' });
}

export async function updateTheme(theme: 'dark' | 'light') {
  return request<any>('/auth/theme', { method: 'PATCH', body: JSON.stringify({ theme }) });
}

export async function updateProfile(payload: {
  displayName?: string | null;
  age?: number | null;
  gender?: string | null;
  occupation?: string | null;
  needs?: string | null;
  avatarData?: string | null;
  customFields?: Array<{ key: string; value: string }>;
}) {
  return request<any>('/auth/profile', { method: 'PATCH', body: JSON.stringify(payload) });
}

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

