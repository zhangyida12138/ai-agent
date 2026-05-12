import React, { useEffect, useRef } from 'react';
import { BRAND_EN, BRAND_SLOGAN_EN, BRAND_ZH_SPACE } from '../../config/brand';
import type { Conversation } from '../../modules/chat/use-chat-module';
import styles from '../../pages/app-layout.module.css';
import { formatDisplayDateTime } from '../../utils/datetime';

export function ConversationSidebar(props: {
  userName: string;
  displayName?: string | null;
  avatarData?: string | null;
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onProfile: () => void;
  onSettingsMenu: (e: React.MouseEvent<HTMLButtonElement>) => void;
  tab: 'chat' | 'knowledge' | 'settings';
  convMenu: { x: number; y: number; conversationId: string } | null;
  onContextMenu: (e: React.MouseEvent, conversationId: string) => void;
  renamingId: string;
  renamingTitle: string;
  setRenamingTitle: (v: string) => void;
  onRenameBlur: (id: string) => Promise<void>;
  onRenameCancel: () => void;
  onToggleCollapse: () => void;
  conversationsHasMore: boolean;
  loadingMoreConversations: boolean;
  onLoadMoreConversations: () => void | Promise<void>;
}) {
  const {
    userName,
    displayName,
    avatarData,
    conversations,
    activeId,
    onSelect,
    onNew,
    onProfile,
    onSettingsMenu,
    tab,
    onContextMenu,
    renamingId,
    renamingTitle,
    setRenamingTitle,
    onRenameBlur,
    onRenameCancel,
    onToggleCollapse,
    conversationsHasMore,
    loadingMoreConversations,
    onLoadMoreConversations
  } = props;
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!conversationsHasMore || loadingMoreConversations) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 72) {
        void onLoadMoreConversations();
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [conversationsHasMore, loadingMoreConversations, onLoadMoreConversations]);

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarBrand}>
        <div className={styles.sidebarBrandInner}>
          <img className={styles.sidebarBrandMark} src="/icon.svg" alt="" width={44} height={44} />
          <div className={styles.sidebarBrandText}>
            <div className={styles.sidebarBrandNameLine}>
              <span className={styles.sidebarBrandEn}>{BRAND_EN}</span>
              <span className={styles.sidebarBrandZh}>{BRAND_ZH_SPACE}</span>
            </div>
            <p className={styles.sidebarBrandSlogan}>{BRAND_SLOGAN_EN}</p>
          </div>
        </div>
      </div>
      <div className={styles.sidebarHeader}>
        <button className="wx-btn primary" onClick={onNew}>新建会话</button>
        <button className={`wx-btn ghost ${styles.collapseBtn}`} onClick={onToggleCollapse} title="收起侧栏">
          <span aria-hidden>◀</span>
        </button>
        <button className={styles.userBadgeBtn} onClick={onProfile} title="个人信息">
          {avatarData ? (
            <img className={styles.avatarImage} src={avatarData} alt="avatar" />
          ) : (
            <span className={styles.avatarCircle}>{(displayName || userName || 'U').slice(0, 1).toUpperCase()}</span>
          )}
        </button>
      </div>
      <div ref={listRef} className={styles.conversationList}>
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
              <small className={styles.conversationMeta}>{formatDisplayDateTime(c.updatedAt)}</small>
            </button>
          </div>
        ))}
        {loadingMoreConversations ? <div className="stats-tip">加载更多会话…</div> : null}
      </div>
      <button className={`wx-btn ${tab === 'settings' ? `primary ${styles.activeTab}` : 'ghost'}`} onClick={onSettingsMenu}>设置</button>
    </div>
  );
}
