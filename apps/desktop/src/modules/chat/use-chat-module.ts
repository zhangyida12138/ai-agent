import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteConversation, exportConversations, importConversations, listConversations, listMessages, renameConversation, streamChat } from '../../api';
import { broadcastChatSync, subscribeChatSync } from './chat-sync';

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

export function useChatModule() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const typingQueueRef = useRef<string[]>([]);
  const typingTimerRef = useRef<number | null>(null);
  const typingAssistantIdRef = useRef<string | null>(null);
  const typingDonePayloadRef = useRef<any>(null);
  const typingStreamFinishedRef = useRef(false);
  const streamAbortRef = useRef<AbortController | null>(null);
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

  function stopGenerating() {
    if (!loading) return;
    userInterruptRef.current = true;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
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

  useEffect(() => () => resetTypingState(), []);

  const activeIdRef = useRef(activeId);
  const loadingRef = useRef(loading);
  activeIdRef.current = activeId;
  loadingRef.current = loading;

  async function refreshConversations() {
    const resp = await listConversations(20);
    if (!resp.ok) {
      setError(`${resp.code}: ${resp.message}`);
      return [];
    }
    const list = (resp.data as Conversation[]) || [];
    setConversations((prev) => {
      const prevTitleById = new Map(prev.map((c) => [c.id, c.title || '']));
      return list.map((c) => {
        const serverTitle = (c.title || '').trim();
        if (serverTitle) return c;
        const optimisticTitle = (prevTitleById.get(c.id) || '').trim();
        return optimisticTitle ? { ...c, title: optimisticTitle } : c;
      });
    });
    return list;
  }

  async function refreshMessages(conversationId: string) {
    const resp = await listMessages(conversationId, 50);
    if (!resp.ok) return setError(`${resp.code}: ${resp.message}`);
    setMessages((resp.data as any).messages || []);
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
        void refreshMessagesRef.current(msg.conversationId);
      }
    });
    const pollMessages = window.setInterval(() => {
      const id = activeIdRef.current;
      if (!id || loadingRef.current) return;
      void refreshMessagesRef.current(id);
    }, 4500);
    const pollConversations = window.setInterval(() => {
      void refreshConversationsRef.current();
    }, 15000);
    return () => {
      unsub();
      window.clearInterval(pollMessages);
      window.clearInterval(pollConversations);
    };
  }, []);

  async function sendMessage(useLocalKnowledge: boolean, selectedDocIds?: string[]) {
    const userMessage = input.trim();
    if (!userMessage || loading) return;
    const nowIso = new Date().toISOString();
    const isNewConversation = !activeId;
    const conversationId = activeId || crypto.randomUUID();
    if (isNewConversation) {
      const optimisticTitle = userMessage.length > 18 ? `${userMessage.slice(0, 18)}...` : userMessage;
      setConversations((prev) => [{ id: conversationId, title: optimisticTitle, updatedAt: nowIso }, ...prev.filter((c) => c.id !== conversationId)]);
    } else {
      setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, updatedAt: nowIso } : c)));
    }
    const optimistic = [
      ...messages,
      {
        id: crypto.randomUUID(),
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
    const req = {
      requestId: crypto.randomUUID(),
      conversationId,
      userMessage,
      options: {
        useLocalKnowledge,
        selectedDocIds: (selectedDocIds || []).filter(Boolean),
        debugRag: true,
        includeCitations: true,
        retrievalTopK: 3,
        maxEvidenceChars: 2000
      }
    };
    const assistantId = crypto.randomUUID();
    setMessages([...optimistic, { id: assistantId, conversationId, role: 'assistant', content: '', createdAt: nowIso }]);
    resetTypingState();
    typingAssistantIdRef.current = assistantId;
    const controller = new AbortController();
    streamAbortRef.current = controller;
    let done = false;
    await streamChat(req, {
      onDelta: (delta) => {
        if (!delta) return;
        typingQueueRef.current.push(...delta.split(''));
        startTypingLoop();
      },
      onDone: (data) => {
        done = true;
        typingDonePayloadRef.current = data;
        typingStreamFinishedRef.current = true;
        tryFinalizeAssistantMessage();
      },
      onError: (e) => {
        if (e.code === 'ABORTED') return;
        resetTypingState();
        userInterruptRef.current = false;
        setLoading(false);
        setError(`${e.code || 'STREAM_ERROR'}: ${e.message || '流式响应失败'}`);
      }
    }, { signal: controller.signal }).catch((e: any) => {
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

  async function importConversationBundle(raw: string): Promise<{ importedConversations: number; importedMessages: number } | null> {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setError('导入文件不是有效 JSON');
      return null;
    }
    const resp = await importConversations(parsed);
    if (!resp.ok) {
      setError(`${resp.code}: ${resp.message}`);
      return null;
    }
    await refreshConversations();
    broadcastChatSync({ type: 'conversations-changed' });
    return resp.data as { importedConversations: number; importedMessages: number };
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
    newConversation: () => {
      setActiveId('');
      setMessages([]);
    }
  };
}
