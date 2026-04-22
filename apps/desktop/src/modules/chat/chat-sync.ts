export const CHAT_SYNC_CHANNEL = 'ai-agent-chat-sync';

export type ChatSyncPayload =
  | { type: 'conversations-changed' }
  | { type: 'messages-changed'; conversationId: string };

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(CHAT_SYNC_CHANNEL);
  } catch {
    return null;
  }
}

export function broadcastChatSync(payload: ChatSyncPayload): void {
  const ch = getChannel();
  if (!ch) return;
  try {
    ch.postMessage(payload);
  } finally {
    ch.close();
  }
}

export function subscribeChatSync(handler: (payload: ChatSyncPayload) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => undefined;
  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as ChatSyncPayload;
    if (!data || typeof data !== 'object' || !('type' in data)) return;
    handler(data);
  };
  ch.addEventListener('message', onMessage);
  return () => {
    ch.removeEventListener('message', onMessage);
    ch.close();
  };
}
