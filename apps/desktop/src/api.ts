import { GENERIC_SERVER_ERROR_MESSAGE, logClientError, messageFromEnvelope } from './utils/user-facing-error';

export type Envelope<T> =
  | { ok: true; code: 'SUCCESS'; data: T }
  | { ok: false; code: string; message: string; retryable: boolean; nextAction?: string };

const SIDECAR_URL = import.meta.env.VITE_SIDECAR_URL || '/api';
/** localStorage 中会话 token 的 key（供 Page Agent 等与 api 共用） */
export const AUTH_TOKEN_KEY = 'ai-agent-auth-token';

function transportError(code: string, detail: unknown, retryable = true): Envelope<never> {
  logClientError(code, detail);
  return {
    ok: false,
    code,
    message: GENERIC_SERVER_ERROR_MESSAGE,
    retryable
  };
}

function sanitizeEnvelope<T>(parsed: Envelope<T>): Envelope<T> {
  if (parsed.ok) return parsed;
  return {
    ok: false,
    code: parsed.code,
    message: messageFromEnvelope(parsed),
    retryable: parsed.retryable
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  let res: Response;
  try {
    res = await fetch(`${SIDECAR_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...authHeader, ...(init?.headers || {}) },
      ...init
    });
  } catch (e) {
    return transportError('NETWORK_ERROR', { path, error: e });
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.toLowerCase().includes('application/json');
  const raw = await res.text();

  if (res.status === 413) {
    return {
      ok: false,
      code: 'REQUEST_ENTITY_TOO_LARGE',
      message: messageFromEnvelope({
        ok: false,
        code: 'REQUEST_ENTITY_TOO_LARGE',
        message: '',
        retryable: false
      }),
      retryable: false
    };
  }

  if (!raw) {
    return transportError('EMPTY_RESPONSE', { path, status: res.status });
  }

  if (!isJson) {
    return transportError('INVALID_RESPONSE_FORMAT', {
      path,
      status: res.status,
      bodyPreview: raw.trim().slice(0, 200)
    });
  }

  try {
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (!parsed.ok) return sanitizeEnvelope(parsed);
    return parsed;
  } catch (e) {
    return transportError('INVALID_JSON', { path, status: res.status, parseError: e });
  }
}

export async function listConversations(limit = 20, offset = 0) {
  return request<Array<any>>(
    `/conversations?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`
  );
}

export async function listMessages(
  conversationId: string,
  limit = 50,
  before?: { createdAt: string; id: string } | null
) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (before?.createdAt && before?.id) {
    qs.set('beforeCreatedAt', before.createdAt);
    qs.set('beforeId', before.id);
  }
  const q = qs.toString();
  return request<any>(`/conversations/${encodeURIComponent(conversationId)}/messages?${q}`);
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
    onDelta: (delta: string, meta?: { requestId?: string; assistantMessageId?: string }) => void;
    onDone: (data: any) => void;
    onError: (err: { code?: string; message?: string }) => void;
  },
  options?: { signal?: AbortSignal }
) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  let res: Response;
  try {
    res = await fetch(`${SIDECAR_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(payload),
      signal: options?.signal
    });
  } catch (e) {
    logClientError('chat/stream', e);
    handlers.onError({ code: 'NETWORK_ERROR', message: GENERIC_SERVER_ERROR_MESSAGE });
    return;
  }

  if (!res.ok || !res.body) {
    logClientError('chat/stream', { status: res.status, statusText: res.statusText });
    handlers.onError({ code: 'STREAM_START_FAILED', message: GENERIC_SERVER_ERROR_MESSAGE });
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let eventName = 'message';
  while (true) {
    if (options?.signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    if (options?.signal?.aborted) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const block of chunks) {
      if (options?.signal?.aborted) break;
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
      if (eventName === 'delta') handlers.onDelta(String(data?.delta ?? ''), data);
      else if (eventName === 'done') handlers.onDone(data);
      else if (eventName === 'error') {
        logClientError('chat/stream-sse', data);
        handlers.onError({ code: data?.code, message: GENERIC_SERVER_ERROR_MESSAGE });
      }
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
