import React from 'react';
import type { Conversation } from '../../modules/chat/use-chat-module';
import styles from '../../pages/app-layout.module.css';

export function ConversationSidebar(props: {
  userName: string;
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onLogout: () => void;
  tab: 'chat' | 'knowledge';
  onTab: (tab: 'chat' | 'knowledge') => void;
  convMenu: { x: number; y: number; conversationId: string } | null;
  onContextMenu: (e: React.MouseEvent, conversationId: string) => void;
  renamingId: string;
  renamingTitle: string;
  setRenamingTitle: (v: string) => void;
  onRenameBlur: (id: string) => Promise<void>;
  onRenameCancel: () => void;
  error?: string | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onToggleCollapse: () => void;
}) {
  const {
    userName,
    conversations,
    activeId,
    onSelect,
    onNew,
    onLogout,
    tab,
    onTab,
    onContextMenu,
    renamingId,
    renamingTitle,
    setRenamingTitle,
    onRenameBlur,
    onRenameCancel,
    error,
    theme,
    onToggleTheme,
    onToggleCollapse
  } = props;
  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <button className="wx-btn primary" onClick={onNew}>新建会话</button>
        <button className={`wx-btn ghost ${styles.collapseBtn}`} onClick={onToggleCollapse} title="收起侧栏">
          <span aria-hidden>◀</span>
        </button>
        <button className={`wx-btn ghost ${styles.themeToggle}`} onClick={onToggleTheme}>
          {theme === 'dark' ? '浅色' : '深色'}
        </button>
        <div className={styles.userBadge}>{userName}</div>
      </div>
      <div className={styles.conversationList}>
        {conversations.map((c) => (
          <div key={c.id} className={styles.conversationItemWrap}>
            <button
              className={`${styles.conversationItem} ${activeId === c.id ? styles.conversationItemActive : ''}`}
              onClick={() => (renamingId === c.id ? undefined : onSelect(c.id))}
              onContextMenu={(e) => onContextMenu(e, c.id)}
            >
              {renamingId === c.id ? (
                <input
                  autoFocus
                  className={styles.conversationRenameInput}
                  value={renamingTitle}
                  onChange={(e) => setRenamingTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => onRenameBlur(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRenameBlur(c.id);
                    if (e.key === 'Escape') onRenameCancel();
                  }}
                />
              ) : (
                <div>{c.title || '会话'}</div>
              )}
              <small className={styles.conversationMeta}>{new Date(c.updatedAt).toLocaleString()}</small>
            </button>
          </div>
        ))}
      </div>
      <button className={`wx-btn ${tab === 'chat' ? `primary ${styles.activeTab}` : 'ghost'}`} onClick={() => onTab('chat')}>聊天</button>
      <button className={`wx-btn ${tab === 'knowledge' ? `primary ${styles.activeTab}` : 'ghost'}`} onClick={() => onTab('knowledge')}>知识库管理</button>
      <button className="wx-btn ghost" onClick={onLogout}>退出登录</button>
      {error ? <div className="error-tip">{error}</div> : null}
    </div>
  );
}
