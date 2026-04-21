import { useEffect, useMemo, useRef, useState } from 'react';
import { deleteConversation, listConversations, listMessages, renameConversation, streamChat } from '../../api';

export type Conversation = { id: string; title?: string | null; updatedAt: string };
export type ChatMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Array<{ refId: string; label: string; snippet: string }>;
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

  function tryFinalizeAssistantMessage() {
    if (!typingStreamFinishedRef.current) return false;
    if (typingQueueRef.current.length > 0) return false;
    const assistantId = typingAssistantIdRef.current;
    if (!assistantId) return false;
    const donePayload = typingDonePayloadRef.current;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantId
          ? { ...m, id: donePayload?.persisted?.assistantMessageId ?? assistantId, citations: donePayload?.reply?.citations || [] }
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

  async function sendMessage(useLocalKnowledge: boolean) {
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
    setActiveId(conversationId);
    const req = {
      requestId: crypto.randomUUID(),
      conversationId,
      userMessage,
      options: { useLocalKnowledge, includeCitations: true, retrievalTopK: 3, maxEvidenceChars: 2000 }
    };
    const assistantId = crypto.randomUUID();
    setMessages([...optimistic, { id: assistantId, conversationId, role: 'assistant', content: '', createdAt: nowIso }]);
    resetTypingState();
    typingAssistantIdRef.current = assistantId;
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
        resetTypingState();
        setLoading(false);
        setError(`${e.code || 'STREAM_ERROR'}: ${e.message || '流式响应失败'}`);
      }
    });
    if (!done) {
      resetTypingState();
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      setLoading(false);
    } else if (!typingTimerRef.current && typingQueueRef.current.length === 0) {
      tryFinalizeAssistantMessage();
    }
    await refreshConversations();
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
  }

  async function renameConv(conversationId: string, title: string) {
    const resp = await renameConversation(conversationId, title);
    if (!resp.ok) return setError(`${resp.code}: ${resp.message}`);
    await refreshConversations();
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
    removeConversation,
    renameConv,
    newConversation: () => {
      setActiveId('');
      setMessages([]);
    }
  };
}
