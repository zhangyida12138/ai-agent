export type Envelope<T> =
  | { ok: true; code: 'SUCCESS'; data: T }
  | { ok: false; code: string; message: string; retryable: boolean; nextAction?: string };

const SIDECAR_URL = import.meta.env.VITE_SIDECAR_URL || 'http://localhost:3001';
const AUTH_TOKEN_KEY = 'ai-agent-auth-token';

async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${SIDECAR_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader, ...(init?.headers || {}) },
    ...init
  });
  return (await res.json()) as Envelope<T>;
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

export async function sendChat(payload: any) {
  return request<any>(`/chat/send`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function streamChat(
  payload: any,
  handlers: {
    onDelta: (delta: string) => void;
    onDone: (data: any) => void;
    onError: (err: { code?: string; message?: string }) => void;
  }
) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${SIDECAR_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader },
    body: JSON.stringify(payload)
  });
  if (!res.ok || !res.body) {
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

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

