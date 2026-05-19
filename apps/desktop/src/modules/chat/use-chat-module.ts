import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteConversation,
  exportConversations,
  importConversations,
  listConversations,
  listMessages,
  renameConversation,
  streamChat
} from '../../api';
import { broadcastChatSync, subscribeChatSync } from './chat-sync';
import { createUuid } from '../../utils/uuid';

export type Conversation = { id: string; title?: string | null; updatedAt: string };
export type ChatMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Array<{ refId: string; label: string; snippet: string }>;
  ragDebug?: {
    useLocalKnowledge: boolean;
    selectedDocCount: number;
    candidateCount: number;
    filteredCount: number;
    evidenceCount: number;
  };
  createdAt: string;
};

export type ImportConversationBundleResult =
  | { ok: true; importedConversations: number; importedMessages: number }
  | { ok: false; message: string };

function normalizeConversationImportPayload(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (p.version === 1 && Array.isArray(p.conversations)) return parsed;
  const pl = p.payload;
  if (pl && typeof pl === 'object') {
    const plObj = pl as Record<string, unknown>;
    if (plObj.version === 1 && Array.isArray(plObj.conversations)) return pl;
  }
  if (p.ok === true && p.data && typeof p.data === 'object') {
    const d = p.data as Record<string, unknown>;
    if (d.version === 1 && Array.isArray(d.conversations)) return p.data;
  }
  return null;
}

function mergePollConversations(top: Conversation[], prev: Conversation[]) {
  const topIds = new Set(top.map((c) => c.id));
  return [...top, ...prev.filter((c) => !topIds.has(c.id))];
}

function isMsgStrictlyOlder(a: ChatMessage, b: ChatMessage) {
  if (a.createdAt < b.createdAt) return true;
  if (a.createdAt > b.createdAt) return false;
  return a.id < b.id;
}

function mergePollMessages(recent: ChatMessage[], prev: ChatMessage[]) {
  if (recent.length === 0) return prev;
  const recentIds = new Set(recent.map((m) => m.id));
  const oldestRecent = recent[0];
  const prefix = prev.filter((m) => isMsgStrictlyOlder(m, oldestRecent));
  // 保留尚未写入服务端的本地助手气泡（例如用户中断后服务端还未落库）
  const pendingLocal = prev.filter((m) => !recentIds.has(m.id) && !isMsgStrictlyOlder(m, oldestRecent));
  return [...prefix, ...recent, ...pendingLocal];
}

export function useChatModule() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [conversationsHasMore, setConversationsHasMore] = useState(false);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [convNextOffset, setConvNextOffset] = useState(0);
  const [messagesHasOlder, setMessagesHasOlder] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const typingQueueRef = useRef<string[]>([]);
  const typingTimerRef = useRef<number | null>(null);
  const typingAssistantIdRef = useRef<string | null>(null);
  const typingDonePayloadRef = useRef<any>(null);
  const typingStreamFinishedRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  /** 每轮 sendMessage 递增；过期流的 onDelta/onDone 不得写入 UI */
  const activeGenerationRef = useRef(0);
  /** 用户点击「中断」时为 true；部分浏览器中止 fetch 抛 TypeError 而非 AbortError，不能仅靠 signal / name 判断 */
  const userInterruptRef = useRef(false);
  const TYPING_INTERVAL_MS = 18;
  const CHARS_PER_TICK = 2;

  const activeTitle = useMemo(() => {
    const c = conversations.find((x) => x.id === activeId);
    return c?.title || (c ? '会话' : '未选择会话');
  }, [activeId, conversations]);

  function clearTypingTimer() {
    if (typingTimerRef.current !== null) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }

  function resetTypingState() {
    clearTypingTimer();
    typingQueueRef.current = [];
    typingAssistantIdRef.current = null;
    typingDonePayloadRef.current = null;
    typingStreamFinishedRef.current = false;
  }

  /** 停止当前流式请求；可选保留已打出内容并标记为已停止 */
  function cancelActiveStream(options?: { finalizeAsStopped?: boolean }) {
    userInterruptRef.current = true;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    activeGenerationRef.current += 1;

    if (options?.finalizeAsStopped && typingAssistantIdRef.current) {
      flushPendingQueueIntoAssistant();
      const assistantId = typingAssistantIdRef.current;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantId) return m;
          const text = (m.content || '').trim();
          return { ...m, content: text || '（生成已中断）' };
        })
      );
    }
    resetTypingState();
    userInterruptRef.current = false;
    setLoading(false);
  }

  function stopGenerating() {
    if (!loading) return;
    cancelActiveStream({ finalizeAsStopped: true });
  }

  function flushPendingQueueIntoAssistant() {
    const assistantId = typingAssistantIdRef.current;
    if (!assistantId) return;
    if (typingQueueRef.current.length === 0) return;
    const remaining = typingQueueRef.current.join('');
    if (!remaining) return;
    setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}${remaining}` } : m)));
    typingQueueRef.current = [];
  }

  function finalizeAbortedAssistantMessage() {
    flushPendingQueueIntoAssistant();
    const assistantId = typingAssistantIdRef.current;
    if (assistantId) {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantId) return m;
          const text = (m.content || '').trim();
          return { ...m, content: text || '（生成已中断）' };
        })
      );
    }
    resetTypingState();
    userInterruptRef.current = false;
    setLoading(false);
  }

  function tryFinalizeAssistantMessage() {
    if (!typingStreamFinishedRef.current) return false;
    if (typingQueueRef.current.length > 0) return false;
    const assistantId = typingAssistantIdRef.current;
    if (!assistantId) return false;
    const donePayload = typingDonePayloadRef.current;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? {
              ...m,
              id: donePayload?.persisted?.assistantMessageId ?? assistantId,
              citations: donePayload?.reply?.citations || [],
              ragDebug: donePayload?.debug
            }
          : m
      )
    );
    resetTypingState();
    setLoading(false);
    return true;
  }

  function startTypingLoop() {
    if (typingTimerRef.current !== null) return;
    typingTimerRef.current = window.setInterval(() => {
      const assistantId = typingAssistantIdRef.current;
      if (!assistantId) return;
      if (typingQueueRef.current.length === 0) {
        tryFinalizeAssistantMessage();
        return;
      }
      const chunk = typingQueueRef.current.splice(0, CHARS_PER_TICK).join('');
      if (!chunk) return;
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}${chunk}` } : m)));
      tryFinalizeAssistantMessage();
    }, TYPING_INTERVAL_MS);
  }

  /** 流结束后须等打字队列播完再拉消息，否则 refresh 会用服务端全文覆盖，首条/新会话会像「一次性出现」 */
  async function waitUntilAssistantTypingFinishes(maxWaitMs = 120_000) {
    const t0 = Date.now();
    while (typingAssistantIdRef.current !== null) {
      if (Date.now() - t0 > maxWaitMs) return;
      await new Promise((r) => setTimeout(r, 16));
    }
  }

  useEffect(() => () => resetTypingState(), []);

  const activeIdRef = useRef(activeId);
  const loadingRef = useRef(loading);
  const messagesRef = useRef<ChatMessage[]>([]);
  const messagesHasOlderRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const convNextOffsetRef = useRef(0);
  activeIdRef.current = activeId;
  loadingRef.current = loading;
  messagesRef.current = messages;
  messagesHasOlderRef.current = messagesHasOlder;
  loadingOlderRef.current = loadingOlderMessages;
  convNextOffsetRef.current = convNextOffset;

  function hydrateConversationTitles(list: Conversation[], prev: Conversation[]): Conversation[] {
    const prevTitleById = new Map(prev.map((c) => [c.id, c.title || '']));
    return list.map((c) => {
      const serverTitle = (c.title || '').trim();
      if (serverTitle) return c;
      const optimisticTitle = (prevTitleById.get(c.id) || '').trim();
      return optimisticTitle ? { ...c, title: optimisticTitle } : c;
    });
  }

  async function refreshConversations(options?: { poll?: boolean }) {
    const poll = Boolean(options?.poll);
    const resp = await listConversations(20, 0);
    if (!resp.ok) {
      setError(`${resp.code}: ${resp.message}`);
      return [];
    }
    const raw = (resp.data as Conversation[]) || [];
    if (poll) {
      setConversations((prev) => {
        const hydrated = hydrateConversationTitles(raw, prev);
        return mergePollConversations(hydrated, prev);
      });
      return raw;
    }
    setConversations((prev) => hydrateConversationTitles(raw, prev));
    setConvNextOffset(raw.length);
    setConversationsHasMore(raw.length === 20);
    return raw;
  }

  async function loadMoreConversations() {
    if (loadingMoreConversations || !conversationsHasMore) return;
    setLoadingMoreConversations(true);
    try {
      const resp = await listConversations(20, convNextOffsetRef.current);
      if (!resp.ok) {
        setError(`${resp.code}: ${resp.message}`);
        return;
      }
      const batch = (resp.data as Conversation[]) || [];
      setConversations((prev) => {
        const hydrated = hydrateConversationTitles(batch, prev);
        const seen = new Set(prev.map((c) => c.id));
        const appended = hydrated.filter((c) => !seen.has(c.id));
        return [...prev, ...appended];
      });
      setConvNextOffset((o) => o + batch.length);
      setConversationsHasMore(batch.length === 20);
    } finally {
      setLoadingMoreConversations(false);
    }
  }

  async function refreshMessages(conversationId: string, options?: { poll?: boolean }) {
    const resp = await listMessages(conversationId, 50);
    if (!resp.ok) return setError(`${resp.code}: ${resp.message}`);
    const data = resp.data as { messages: ChatMessage[]; total: number; hasOlder: boolean };
    const next = data.messages || [];
    if (options?.poll) {
      setMessages((prev) => mergePollMessages(next, prev));
      setMessagesHasOlder(Boolean(data.hasOlder));
      return;
    }
    setMessages(next);
    setMessagesHasOlder(Boolean(data.hasOlder));
  }

  async function loadOlderMessages() {
    const id = activeIdRef.current;
    const prev = messagesRef.current;
    if (!id || prev.length === 0 || !messagesHasOlderRef.current || loadingOlderRef.current) return;
    const oldest = prev[0];
    loadingOlderRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const resp = await listMessages(id, 50, { createdAt: oldest.createdAt, id: oldest.id });
      if (!resp.ok) {
        setError(`${resp.code}: ${resp.message}`);
        return;
      }
      const data = resp.data as { messages: ChatMessage[]; total: number; hasOlder: boolean };
      const batch = data.messages || [];
      setMessages((cur) => [...batch, ...cur]);
      setMessagesHasOlder(Boolean(data.hasOlder));
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderMessages(false);
    }
  }

  const refreshMessagesRef = useRef(refreshMessages);
  const refreshConversationsRef = useRef(refreshConversations);
  refreshMessagesRef.current = refreshMessages;
  refreshConversationsRef.current = refreshConversations;

  /** 同浏览器多标签即时同步 + 定时轮询（多端/多窗口共用同一 sidecar 数据） */
  useEffect(() => {
    const unsub = subscribeChatSync((msg) => {
      if (msg.type === 'conversations-changed') {
        void refreshConversationsRef.current();
        return;
      }
      if (msg.type === 'messages-changed' && msg.conversationId === activeIdRef.current && !loadingRef.current) {
        void refreshMessagesRef.current(msg.conversationId, { poll: true });
      }
    });
    const pollMessages = window.setInterval(() => {
      const id = activeIdRef.current;
      if (!id || loadingRef.current) return;
      void refreshMessagesRef.current(id, { poll: true });
    }, 4500);
    const pollConversations = window.setInterval(() => {
      void refreshConversationsRef.current({ poll: true });
    }, 15000);
    return () => {
      unsub();
      window.clearInterval(pollMessages);
      window.clearInterval(pollConversations);
    };
  }, []);

  async function sendMessage(useLocalKnowledge: boolean, selectedDocIds?: string[]) {
    const userMessage = input.trim();
    if (!userMessage) return;

    if (loading) {
      cancelActiveStream({ finalizeAsStopped: true });
    }
    const nowIso = new Date().toISOString();
    const isNewConversation = !activeId;
    const conversationId = activeId || createUuid();
    if (isNewConversation) {
      const optimisticTitle = userMessage.length > 18 ? `${userMessage.slice(0, 18)}...` : userMessage;
      setConversations((prev) => [
        { id: conversationId, title: optimisticTitle, updatedAt: nowIso },
        ...prev.filter((c) => c.id !== conversationId)
      ]);
    } else {
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, updatedAt: nowIso } : c)));
    }
    const optimistic = [
      ...messages,
      {
        id: createUuid(),
        conversationId,
        role: 'user',
        content: userMessage,
        createdAt: nowIso
      } as ChatMessage
    ];
    setMessages(optimistic);
    setInput('');
    setLoading(true);
    setError(null);
    userInterruptRef.current = false;
    setActiveId(conversationId);
    const assistantId = createUuid();
    const requestId = createUuid();
    const generation = ++activeGenerationRef.current;
    const isActiveGeneration = () => generation === activeGenerationRef.current;

    const req = {
      requestId,
      conversationId,
      userMessage,
      assistantMessageId: assistantId,
      options: {
        useLocalKnowledge,
        selectedDocIds: (selectedDocIds || []).filter(Boolean),
        debugRag: true,
        includeCitations: true,
        retrievalTopK: 3,
        maxEvidenceChars: 2000
      }
    };
    setMessages([
      ...optimistic,
      { id: assistantId, conversationId, role: 'assistant', content: '', createdAt: nowIso }
    ]);
    resetTypingState();
    typingAssistantIdRef.current = assistantId;
    const controller = new AbortController();
    streamAbortRef.current = controller;
    let done = false;
    await streamChat(
      req,
      {
        onDelta: (delta, meta) => {
          if (!isActiveGeneration()) return;
          if (meta?.requestId && meta.requestId !== requestId) return;
          if (meta?.assistantMessageId && meta.assistantMessageId !== assistantId) return;
          if (!delta) return;
          typingQueueRef.current.push(...delta.split(''));
          startTypingLoop();
        },
        onDone: (data) => {
          if (!isActiveGeneration()) return;
          if (data?.requestId && data.requestId !== requestId) return;
          if (data?.persisted?.assistantMessageId && data.persisted.assistantMessageId !== assistantId) {
            return;
          }
          done = true;
          typingDonePayloadRef.current = data;
          typingStreamFinishedRef.current = true;
          tryFinalizeAssistantMessage();
        },
        onError: (e) => {
          if (!isActiveGeneration()) return;
          if (e.code === 'ABORTED') return;
          resetTypingState();
          userInterruptRef.current = false;
          setLoading(false);
          setError(`${e.code || 'STREAM_ERROR'}: ${e.message || '流式响应失败'}`);
        }
      },
      { signal: controller.signal }
    ).catch((e: any) => {
      const msg = typeof e?.message === 'string' ? e.message : '';
      const aborted =
        userInterruptRef.current ||
        controller.signal.aborted ||
        e?.name === 'AbortError' ||
        /User aborted|AbortError|signal is aborted|aborted a request/i.test(msg);
      if (aborted) return;
      throw e;
    });
    streamAbortRef.current = null;
    if (!isActiveGeneration()) {
      return;
    }
    if (!done) {
      if (controller.signal.aborted || userInterruptRef.current) {
        finalizeAbortedAssistantMessage();
        await refreshConversations();
        broadcastChatSync({ type: 'messages-changed', conversationId });
        broadcastChatSync({ type: 'conversations-changed' });
        return;
      }
      resetTypingState();
      userInterruptRef.current = false;
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setLoading(false);
    } else if (!typingTimerRef.current && typingQueueRef.current.length === 0) {
      tryFinalizeAssistantMessage();
    }
    await refreshConversations();
    if (done) {
      await waitUntilAssistantTypingFinishes();
      await refreshMessages(conversationId);
    }
    broadcastChatSync({ type: 'messages-changed', conversationId });
    broadcastChatSync({ type: 'conversations-changed' });
  }

  async function removeConversation(conversationId: string) {
    const resp = await deleteConversation(conversationId);
    if (!resp.ok) return setError(`${resp.code}: ${resp.message}`);
    const list = await refreshConversations();
    if (list.length > 0) {
      setActiveId(list[0].id);
      await refreshMessages(list[0].id);
    } else {
      setActiveId('');
      setMessages([]);
    }
    broadcastChatSync({ type: 'conversations-changed' });
    broadcastChatSync({ type: 'messages-changed', conversationId });
  }

  async function renameConv(conversationId: string, title: string) {
    const resp = await renameConversation(conversationId, title);
    if (!resp.ok) return setError(`${resp.code}: ${resp.message}`);
    await refreshConversations();
    broadcastChatSync({ type: 'conversations-changed' });
    broadcastChatSync({ type: 'messages-changed', conversationId });
  }

  async function exportConversationById(conversationId: string): Promise<string | null> {
    const targetId = String(conversationId || '').trim();
    if (!targetId) {
      setError('会话ID无效');
      return null;
    }
    const resp = await exportConversations([targetId]);
    if (!resp.ok) {
      setError(`${resp.code}: ${resp.message}`);
      return null;
    }
    return JSON.stringify(resp.data, null, 2);
  }

  async function exportAllConversationBundles(): Promise<string | null> {
    const resp = await exportConversations();
    if (!resp.ok) {
      setError(`${resp.code}: ${resp.message}`);
      return null;
    }
    return JSON.stringify(resp.data, null, 2);
  }

  async function importConversationBundle(raw: string): Promise<ImportConversationBundleResult> {
    const rawTrimmed = raw.replace(/^\uFEFF/, '');
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawTrimmed);
    } catch {
      return { ok: false, message: '文件不是有效的 JSON' };
    }
    const bundle = normalizeConversationImportPayload(parsed);
    if (!bundle) {
      return {
        ok: false,
        message: '不是有效的会话导出文件（需为 version 1 且包含 conversations，或为本应用接口返回的 data 结构）'
      };
    }
    const resp = await importConversations(bundle);
    if (!resp.ok) {
      return { ok: false, message: resp.message || '导入失败' };
    }
    await refreshConversations();
    broadcastChatSync({ type: 'conversations-changed' });
    const data = resp.data as { importedConversations: number; importedMessages: number };
    return { ok: true, importedConversations: data.importedConversations, importedMessages: data.importedMessages };
  }

  return {
    conversations,
    activeId,
    setActiveId,
    messages,
    input,
    setInput,
    loading,
    error,
    setError,
    activeTitle,
    toast,
    setToast,
    refreshConversations,
    refreshMessages,
    sendMessage,
    stopGenerating,
    removeConversation,
    renameConv,
    exportConversationById,
    exportAllConversationBundles,
    importConversationBundle,
    conversationsHasMore,
    loadingMoreConversations,
    loadMoreConversations,
    messagesHasOlder,
    loadingOlderMessages,
    loadOlderMessages,
    newConversation: () => {
      setActiveId('');
      setMessages([]);
      setMessagesHasOlder(false);
    }
  };
}
