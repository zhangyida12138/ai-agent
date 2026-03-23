import React, { useEffect, useMemo, useState } from 'react';
import { getKnowledgeStats, ingestText, listConversations, listMessages, sendChat } from './api';

type Conversation = { id: string; title?: string | null; updatedAt: string };
type ChatMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: Array<{
    refId: string;
    label: string;
    snippet: string;
  }>;
  createdAt: string;
};

function roleLabel(role: ChatMessage['role']) {
  if (role === 'user') return '用户';
  if (role === 'assistant') return '助手';
  return '系统';
}

export function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [useLocalKnowledge, setUseLocalKnowledge] = useState(false);
  const [knowledgeTitle, setKnowledgeTitle] = useState('local-text');
  const [knowledgeText, setKnowledgeText] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [knowledgeStats, setKnowledgeStats] = useState<{ documents: number; chunks: number } | null>(null);

  const activeTitle = useMemo(() => {
    const c = conversations.find((x) => x.id === activeId);
    return c?.title || (c ? '会话' : '未选择会话');
  }, [activeId, conversations]);

  async function refreshConversations() {
    setError(null);
    const resp = await listConversations(20);
    if (!resp.ok) {
      setError(`${resp.code}: ${resp.message}`);
      return;
    }
    // sidecar listConversations returns {conversations?} in our MVP? Actually we return ok(data) directly (array).
    setConversations(resp.data as any);
  }

  async function refreshMessages(conversationId: string) {
    setError(null);
    const resp = await listMessages(conversationId, 50);
    if (!resp.ok) {
      setError(`${resp.code}: ${resp.message}`);
      return;
    }
    const data = resp.data as any;
    setMessages(data.messages || []);
  }

  async function refreshKnowledge() {
    setError(null);
    const resp = await getKnowledgeStats();
    if (!resp.ok) {
      setError(`${resp.code}: ${resp.message}`);
      return;
    }
    setKnowledgeStats(resp.data as any);
  }

  useEffect(() => {
    refreshConversations().then(() => {
      if (conversations.length > 0 && !activeId) {
        setActiveId(conversations[0].id);
      }
    });
    refreshKnowledge().then(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId) refreshMessages(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  async function newConversation() {
    const id = crypto.randomUUID();
    setActiveId(id);
    setMessages([]);
    await refreshConversations();
  }

  async function onSend() {
    const userMessage = input.trim();
    if (!userMessage) return;
    if (!activeId) {
      await newConversation();
    }

    const conversationId = activeId || crypto.randomUUID();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'user',
      content: userMessage,
      createdAt: new Date().toISOString()
    };
    const optimisticMessages = [...messages, userMsg];
    setMessages(optimisticMessages);
    setInput('');
    setLoading(true);
    setError(null);

    const req = {
      requestId: crypto.randomUUID(),
      conversationId,
      userMessage,
      options: {
        useLocalKnowledge,
        includeCitations: true,
        retrievalTopK: 3,
        maxEvidenceChars: 2000
      }
    };

    const resp = await sendChat(req);
    if (!resp.ok) {
      setLoading(false);
      setError(`${resp.code}: ${resp.message}`);
      return;
    }

    const assistantText = resp.data?.reply?.text ?? '';
    const assistantMsg: ChatMessage = {
      id: resp.data?.persisted?.assistantMessageId ?? crypto.randomUUID(),
      conversationId,
      role: 'assistant',
      content: assistantText,
      citations: resp.data?.reply?.citations || [],
      createdAt: new Date().toISOString()
    };

    setMessages([...optimisticMessages, assistantMsg]);
    setLoading(false);
    setActiveId(conversationId);
    await refreshConversations();
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' }}>
      <div style={{ width: 320, borderRight: '1px solid #e5e7eb', padding: 16, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button onClick={newConversation} disabled={loading} style={{ padding: '8px 10px' }}>
            新建会话
          </button>
          <div style={{ fontWeight: 600 }}>会话</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              style={{
                textAlign: 'left',
                padding: 10,
                borderRadius: 8,
                border: activeId === c.id ? '1px solid #111827' : '1px solid transparent',
                background: 'transparent',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title || '会话'}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{new Date(c.updatedAt).toLocaleString()}</div>
            </button>
          ))}
        </div>
        {error ? (
          <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 13, whiteSpace: 'pre-wrap' }}>{error}</div>
        ) : null}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, boxSizing: 'border-box' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{activeTitle}</div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontWeight: 700 }}>本地知识库</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, opacity: 0.9 }}>
              <input
                type="checkbox"
                checked={useLocalKnowledge}
                onChange={(e) => setUseLocalKnowledge(e.target.checked)}
              />
              使用本地知识库（RAG）
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              value={knowledgeTitle}
              onChange={(e) => setKnowledgeTitle(e.target.value)}
              style={{ flex: 0.35, padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
              placeholder="文档标题"
              disabled={ingesting}
            />
            <button
              onClick={async () => {
                const text = knowledgeText.trim();
                if (!text || ingesting) return;
                setIngesting(true);
                setError(null);
                const resp = await ingestText({
                  requestId: crypto.randomUUID(),
                  title: knowledgeTitle || null,
                  sourcePath: 'desktop',
                  text
                });
                if (!resp.ok) {
                  setError(`${resp.code}: ${resp.message}`);
                } else {
                  setKnowledgeText('');
                  await refreshKnowledge();
                }
                setIngesting(false);
              }}
              disabled={ingesting || !knowledgeText.trim()}
              style={{
                flex: 0.25,
                padding: 10,
                borderRadius: 10,
                border: '1px solid #111827',
                background: '#111827',
                color: 'white'
              }}
            >
              {ingesting ? '导入中...' : '导入到本地知识库'}
            </button>
          </div>

          <textarea
            value={knowledgeText}
            onChange={(e) => setKnowledgeText(e.target.value)}
            rows={3}
            style={{ width: '100%', marginTop: 10, resize: 'none', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            placeholder="粘贴要入库的文本（用于本地检索/回答）"
            disabled={ingesting}
          />

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            {knowledgeStats ? `已入库：${knowledgeStats.documents} 文档，${knowledgeStats.chunks} 块` : '等待加载知识库统计...'}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 12,
            boxSizing: 'border-box'
          }}
        >
          {messages.length === 0 ? <div style={{ opacity: 0.7 }}>暂无消息，发送一条试试。</div> : null}
          {messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{roleLabel(m.role)}</div>
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  padding: 10,
                  borderRadius: 10,
                  background: m.role === 'user' ? '#eef2ff' : m.role === 'assistant' ? '#f3f4f6' : '#fff'
                }}
              >
                {m.content}
              </div>
              {m.role === 'assistant' && m.citations && m.citations.length > 0 ? (
                <div
                  style={{
                    marginTop: 8,
                    borderLeft: '3px solid #d1d5db',
                    paddingLeft: 10,
                    fontSize: 12,
                    color: '#374151'
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>引用</div>
                  {m.citations.map((c) => (
                    <div key={c.refId} style={{ marginBottom: 6 }}>
                      <div style={{ fontWeight: 600 }}>{c.label}</div>
                      <div style={{ opacity: 0.9, whiteSpace: 'pre-wrap' }}>{c.snippet}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            style={{ flex: 1, resize: 'none', padding: 10, borderRadius: 10, border: '1px solid #e5e7eb' }}
            placeholder="输入消息..."
            disabled={loading}
          />
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            style={{ width: 120, borderRadius: 10, border: '1px solid #111827', background: '#111827', color: 'white' }}
          >
            {loading ? '生成中...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}

