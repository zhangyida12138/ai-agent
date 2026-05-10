export const KNOWLEDGE_SYNC_CHANNEL = 'liefree-knowledge-sync';

export type KnowledgeSyncPayload = { type: 'knowledge-changed' };

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(KNOWLEDGE_SYNC_CHANNEL);
  } catch {
    return null;
  }
}

export function broadcastKnowledgeSync(payload: KnowledgeSyncPayload): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage(payload);
  } finally {
    ch.close();
  }
}

export function subscribeKnowledgeSync(handler: (payload: KnowledgeSyncPayload) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => undefined;
  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as KnowledgeSyncPayload;
    if (!data || typeof data !== 'object' || data.type !== 'knowledge-changed') return;
    handler(data);
  };
  ch.addEventListener('message', onMessage);
  return () => {
    ch.removeEventListener('message', onMessage);
    ch.close();
  };
}
