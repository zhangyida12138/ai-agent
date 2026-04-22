import React from 'react';
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../../modules/chat/use-chat-module';
import styles from '../../pages/app-layout.module.css';
import { formatDisplayDateTime } from '../../utils/datetime';

function roleLabel(role: ChatMessage['role']) {
  if (role === 'user') return '用户';
  if (role === 'assistant') return '助手';
  return '系统';
}

function escapeHtml(input: string) {
  return input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function markdownToHtml(md: string) {
  const src = escapeHtml(md || '');
  const codeBlocks: string[] = [];
  let text = src.replace(/```([\s\S]*?)```/g, (_, code) => `@@CODEBLOCK_${codeBlocks.push(`<pre><code>${code}</code></pre>`) - 1}@@`);
  text = text.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  text = text.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  text = text.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/`([^`]+?)`/g, '<code>$1</code>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  text = text.replace(/^- (.*)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  text = text.replace(/<\/ul>\s*<ul>/g, '');
  text = text.replace(/\n/g, '<br/>');
  return text.replace(/@@CODEBLOCK_(\d+)@@/g, (_, i) => codeBlocks[Number(i)] ?? '');
}

export function ChatView(props: {
  title: string;
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  toast?: string;
  onInput: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  onCopyToast: (text: string) => void;
}) {
  const { title, messages, input, loading, toast, onInput, onSend, onStop, onCopyToast } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = gap < 120;
    if (loading || nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading]);
  return (
    <>
      <div className={`${styles.chatTitle} ${styles.chatTitleWithKb}`}>{title}</div>
      <div ref={panelRef} className={styles.messagePanel}>
        {toast ? <div className={styles.copyToast}>{toast}</div> : null}
        {messages.length === 0 ? <div className="stats-tip">暂无消息，发送一条试试。</div> : null}
        {messages.map((m) => (
          <div key={m.id} className={`${styles.msg} ${m.role === 'user' ? styles.msgUser : ''}`}>
            <div className={styles.role}>{roleLabel(m.role)} · {formatDisplayDateTime(m.createdAt)}</div>
            <div className={`${styles.bubble} ${m.role === 'assistant' ? styles.assistantBubble : styles.userBubble}`}>
              <button
                type="button"
                className={styles.copyMsgBtn}
                onClick={async () => {
                  await navigator.clipboard.writeText(m.content || '');
                  onCopyToast('复制成功');
                }}
              >
                复制
              </button>
              {m.role === 'assistant' ? <div dangerouslySetInnerHTML={{ __html: markdownToHtml(m.content || '...') }} /> : m.content}
            </div>
            {m.role === 'assistant' && m.citations && m.citations.length > 0 ? (
              <div className={styles.citationBox}>
                <div className={styles.citationTitle}>引用</div>
                {m.citations.map((c) => (
                  <div key={c.refId}>
                    <div className={styles.citationLabel}>{c.label}</div>
                    <div className={styles.citationSnippet}>{c.snippet}</div>
                  </div>
                ))}
              </div>
            ) : null}
            {m.role === 'assistant' && m.ragDebug ? (
              <div className={styles.debugBox}>
                调试：RAG={m.ragDebug.useLocalKnowledge ? 'on' : 'off'}，选中文档={m.ragDebug.selectedDocCount}，候选={m.ragDebug.candidateCount}，过滤后={m.ragDebug.filteredCount}，最终证据={m.ragDebug.evidenceCount}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className={styles.composer}>
        <textarea
          className="wx-input"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !loading && input.trim()) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={3}
          placeholder="输入消息...（Enter发送，Shift+Enter换行）"
          disabled={loading}
        />
        <button className={`wx-btn primary ${styles.sendBtn}`} onClick={loading ? onStop : onSend} disabled={!loading && !input.trim()}>
          {loading ? '中断生成' : '发送'}
        </button>
      </div>
    </>
  );
}
