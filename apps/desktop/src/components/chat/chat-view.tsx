import React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../modules/chat/use-chat-module';
import styles from '../../pages/app-layout.module.css';
import { formatDisplayDateTime } from '../../utils/datetime';
import { copyTextToClipboard } from '../../utils/copy-to-clipboard';

const COMPOSER_H_MIN = 72;
const COMPOSER_H_MAX = 240;
const COMPOSER_H_DEFAULT = 100;
const COMPOSER_STORAGE_KEY = 'chat-composer-height-px';

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
  messagesHasOlder?: boolean;
  loadingOlderMessages?: boolean;
  onLoadOlderMessages?: () => void | Promise<void>;
}) {
  const {
    title,
    messages,
    input,
    loading,
    toast,
    onInput,
    onSend,
    onStop,
    onCopyToast,
    messagesHasOlder = false,
    loadingOlderMessages = false,
    onLoadOlderMessages
  } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const skipScrollToBottomRef = useRef(false);
  const scrollRestoreRef = useRef<{ height: number; top: number } | null>(null);

  const [composerPx, setComposerPx] = useState(() => {
    try {
      const raw = sessionStorage.getItem(COMPOSER_STORAGE_KEY);
      const n = raw ? Number(raw) : NaN;
      if (!Number.isFinite(n)) return COMPOSER_H_DEFAULT;
      return Math.min(COMPOSER_H_MAX, Math.max(COMPOSER_H_MIN, Math.round(n)));
    } catch {
      return COMPOSER_H_DEFAULT;
    }
  });
  const onComposerGripDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = composerPx;
    const onMove = (ev: PointerEvent) => {
      // 分隔条下移 → 输入区变矮；上移 → 输入区变高（与常见分割条习惯一致）
      const next = Math.min(COMPOSER_H_MAX, Math.max(COMPOSER_H_MIN, Math.round(startH - (ev.clientY - startY))));
      setComposerPx(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setComposerPx((h) => {
        try {
          sessionStorage.setItem(COMPOSER_STORAGE_KEY, String(h));
        } catch {
          /* ignore */
        }
        return h;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  useLayoutEffect(() => {
    const el = panelRef.current;
    const saved = scrollRestoreRef.current;
    if (!el || !saved) return;
    if (loadingOlderMessages) return;
    scrollRestoreRef.current = null;
    const newH = el.scrollHeight;
    el.scrollTop = newH - saved.height + saved.top;
    skipScrollToBottomRef.current = true;
  }, [messages, loadingOlderMessages]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || !onLoadOlderMessages) return;
    const onScroll = () => {
      if (!messagesHasOlder || loadingOlderMessages) return;
      if (el.scrollTop <= 64) {
        scrollRestoreRef.current = { height: el.scrollHeight, top: el.scrollTop };
        void Promise.resolve(onLoadOlderMessages());
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [messagesHasOlder, loadingOlderMessages, onLoadOlderMessages]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = gap < 120;
    if (skipScrollToBottomRef.current) {
      skipScrollToBottomRef.current = false;
      return;
    }
    if (loading || nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, loading]);

  return (
    <div className={styles.chatViewShell}>
      {toast ? (
        <div className={styles.copyToastOverlay} aria-live="polite">
          <div className={styles.copyToast}>{toast}</div>
        </div>
      ) : null}
      <div className={`${styles.chatTitle} ${styles.chatTitleWithKb}`}>{title}</div>
      <div className={styles.chatMainColumn}>
        <div ref={panelRef} className={styles.messagePanel}>
          {loadingOlderMessages ? <div className="stats-tip">加载更早的消息…</div> : null}
          {messages.length === 0 ? <div className="stats-tip">暂无消息，发送一条试试。</div> : null}
          {messages.map((m) => (
          <div key={m.id} className={`${styles.msg} ${m.role === 'user' ? styles.msgUser : ''}`}>
            <div className={styles.role}>{roleLabel(m.role)} · {formatDisplayDateTime(m.createdAt)}</div>
            <div className={`${styles.bubble} ${m.role === 'assistant' ? styles.assistantBubble : styles.userBubble}`}>
              <button
                type="button"
                className={styles.copyMsgBtn}
                onClick={async () => {
                  const ok = await copyTextToClipboard(m.content || '');
                  onCopyToast(ok ? '复制成功' : '复制失败，请使用 HTTPS 或允许剪贴板权限');
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
        <div
          className={styles.composerGrip}
          onPointerDown={onComposerGripDown}
          title="拖动分隔条调整输入框高度（向上拉高、向下压低）"
          role="separator"
          aria-orientation="horizontal"
        />
        <div className={styles.composer}>
        <textarea
          className={`wx-input ${styles.composerTextarea}`}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !loading && input.trim()) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          style={{ height: composerPx }}
          placeholder="输入消息...（Enter发送，Shift+Enter换行）"
          disabled={loading}
        />
        <button className={`wx-btn primary ${styles.sendBtn}`} onClick={loading ? onStop : onSend} disabled={!loading && !input.trim()}>
          {loading ? '中断生成' : '发送'}
        </button>
        </div>
      </div>
    </div>
  );
}
