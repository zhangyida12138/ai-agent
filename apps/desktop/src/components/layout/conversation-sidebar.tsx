import React from 'react';
import type { Conversation } from '../../modules/chat/use-chat-module';

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
    error
  } = props;
  return (
    <div className="wx-sidebar">
      <div className="sidebar-header">
        <button className="wx-btn primary" onClick={onNew}>新建会话</button>
        <div className="user-badge">{userName}</div>
      </div>
      <div className="conversation-list">
        {conversations.map((c) => (
          <div key={c.id} className={`conversation-item-wrap ${activeId === c.id ? 'active' : ''}`}>
            <button
              className={`conversation-item ${activeId === c.id ? 'active' : ''}`}
              onClick={() => (renamingId === c.id ? undefined : onSelect(c.id))}
              onContextMenu={(e) => onContextMenu(e, c.id)}
            >
              {renamingId === c.id ? (
                <input
                  autoFocus
                  className="conversation-rename-input"
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
              <small>{new Date(c.updatedAt).toLocaleString()}</small>
            </button>
          </div>
        ))}
      </div>
      <button className={`wx-btn ghost ${tab === 'chat' ? 'active-tab' : ''}`} onClick={() => onTab('chat')}>聊天</button>
      <button className={`wx-btn ghost ${tab === 'knowledge' ? 'active-tab' : ''}`} onClick={() => onTab('knowledge')}>知识库管理</button>
      <button className="wx-btn ghost" onClick={onLogout}>退出登录</button>
      {error ? <div className="error-tip">{error}</div> : null}
    </div>
  );
}
