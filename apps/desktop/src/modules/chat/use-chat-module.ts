import { useMemo, useState } from 'react';
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

  const activeTitle = useMemo(() => {
    const c = conversations.find((x) => x.id === activeId);
    return c?.title || (c ? '会话' : '未选择会话');
  }, [activeId, conversations]);

  async function refreshConversations() {
    const resp = await listConversations(20);
    if (!resp.ok) {
      setError(`${resp.code}: ${resp.message}`);
      return [];
    }
    const list = (resp.data as Conversation[]) || [];
    setConversations(list);
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
    const conversationId = activeId || crypto.randomUUID();
    const optimistic = [
      ...messages,
      {
        id: crypto.randomUUID(),
        conversationId,
        role: 'user',
        content: userMessage,
        createdAt: new Date().toISOString()
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
    setMessages([...optimistic, { id: assistantId, conversationId, role: 'assistant', content: '', createdAt: new Date().toISOString() }]);
    let done = false;
    await streamChat(req, {
      onDelta: (delta) => setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}${delta}` } : m))),
      onDone: (data) => {
        done = true;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, id: data?.persisted?.assistantMessageId ?? assistantId, citations: data?.reply?.citations || [] } : m))
        );
      },
      onError: (e) => setError(`${e.code || 'STREAM_ERROR'}: ${e.message || '流式响应失败'}`)
    });
    if (!done) setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    setLoading(false);
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
