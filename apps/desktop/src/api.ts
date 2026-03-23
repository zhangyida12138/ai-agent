export type Envelope<T> =
  | { ok: true; code: 'SUCCESS'; data: T }
  | { ok: false; code: string; message: string; retryable: boolean; nextAction?: string };

const SIDECAR_URL = import.meta.env.VITE_SIDECAR_URL || 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(`${SIDECAR_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
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

export async function sendChat(payload: any) {
  return request<any>(`/chat/send`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function ingestText(payload: any) {
  return request<any>(`/knowledge/ingest-text`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function getKnowledgeStats() {
  return request<any>(`/knowledge/stats`, { method: 'GET' });
}

