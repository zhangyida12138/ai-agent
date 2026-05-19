/** 同一会话仅保留最新一条流式生成，新请求会 abort 上一轮（避免中断后旧回答仍落库/刷入 UI） */
const activeByConversation = new Map<string, AbortController>();

export function takeConversationStreamControl(conversationId: string): AbortSignal {
  const prev = activeByConversation.get(conversationId);
  if (prev && !prev.signal.aborted) {
    prev.abort(new Error('superseded by newer stream'));
  }
  const controller = new AbortController();
  activeByConversation.set(conversationId, controller);
  return controller.signal;
}

export function releaseConversationStreamControl(conversationId: string, signal: AbortSignal) {
  const cur = activeByConversation.get(conversationId);
  if (cur?.signal === signal) {
    activeByConversation.delete(conversationId);
  }
}

export function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  const valid = signals.filter(Boolean);
  if (valid.length === 0) return new AbortController().signal;
  if (valid.length === 1) return valid[0]!;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(valid);
  }
  const merged = new AbortController();
  const onAbort = () => {
    if (!merged.signal.aborted) merged.abort();
  };
  for (const s of valid) {
    if (s.aborted) {
      onAbort();
      return merged.signal;
    }
    s.addEventListener('abort', onAbort, { once: true });
  }
  return merged.signal;
}
