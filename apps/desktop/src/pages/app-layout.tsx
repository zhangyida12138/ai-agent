import React, { useEffect, useState } from 'react';
import { ConversationSidebar } from '../components/layout/conversation-sidebar';
import { ChatView } from '../components/chat/chat-view';
import { KnowledgeIngestCard } from '../components/knowledge/knowledge-ingest-card';
import { KnowledgeManager } from '../components/knowledge/knowledge-manager';
import { useChatModule } from '../modules/chat/use-chat-module';
import { useKnowledgeModule } from '../modules/knowledge/use-knowledge-module';
import { useAuth } from '../modules/auth/auth';
import { useRouter } from '../modules/routing/router';
import styles from './app-layout.module.css';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { path, navigate } = useRouter();
  const tab: 'chat' | 'knowledge' = path === '/knowledge' ? 'knowledge' : 'chat';

  const chat = useChatModule();
  const kb = useKnowledgeModule();
  const [convMenu, setConvMenu] = useState<{ x: number; y: number; conversationId: string } | null>(null);
  const [renamingId, setRenamingId] = useState('');
  const [renamingTitle, setRenamingTitle] = useState('');
  const [pendingDeleteConversationId, setPendingDeleteConversationId] = useState<string | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ai-agent-theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    chat.refreshConversations().then(() => undefined);
    kb.refreshKnowledge().then(() => undefined);
    kb.refreshKnowledgeDocs().then(() => undefined);
  }, []);

  useEffect(() => {
    if (!chat.activeId) return;
    if (chat.loading) return;
    chat.refreshMessages(chat.activeId);
  }, [chat.activeId, chat.loading]);

  useEffect(() => {
    if (!chat.toast) return;
    const timer = window.setTimeout(() => chat.setToast(''), 1400);
    return () => window.clearTimeout(timer);
  }, [chat.toast]);

  useEffect(() => {
    const close = () => setConvMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ai-agent-theme', theme);
  }, [theme]);

  return (
    <div className={`app-shell ${styles.shell}`}>
      {sidebarCollapsed ? (
        <div className={styles.sidebarCollapsed}>
          <button className={`wx-btn ghost ${styles.expandBtn}`} onClick={() => setSidebarCollapsed(false)} title="展开侧栏">
            <span aria-hidden>▶</span>
          </button>
        </div>
      ) : (
        <ConversationSidebar
          userName={user?.username || ''}
          conversations={chat.conversations}
          activeId={chat.activeId}
          onSelect={(id) => {
            chat.setActiveId(id);
            navigate('/chat');
          }}
        onNew={() => {
          chat.newConversation();
          navigate('/chat');
        }}
          onLogout={() => {
            logout();
            navigate('/auth', true);
          }}
          tab={tab}
          onTab={(t) => navigate(t === 'chat' ? '/chat' : '/knowledge')}
          convMenu={convMenu}
          onContextMenu={(e, id) => {
            e.preventDefault();
            setConvMenu({ x: e.clientX, y: e.clientY, conversationId: id });
          }}
          renamingId={renamingId}
          renamingTitle={renamingTitle}
          setRenamingTitle={setRenamingTitle}
          onRenameBlur={async (id) => {
            await chat.renameConv(id, renamingTitle);
            setRenamingId('');
            setRenamingTitle('');
          }}
          onRenameCancel={() => {
            setRenamingId('');
            setRenamingTitle('');
          }}
          error={chat.error || kb.error}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          onToggleCollapse={() => setSidebarCollapsed(true)}
        />
      )}

      <div className={styles.main}>
        <KnowledgeIngestCard
          useLocalKnowledge={kb.useLocalKnowledge}
          setUseLocalKnowledge={kb.setUseLocalKnowledge}
          compact={tab === 'chat'}
          title={kb.knowledgeTitle}
          setTitle={kb.setKnowledgeTitle}
          text={kb.knowledgeText}
          setText={kb.setKnowledgeText}
          ingesting={kb.ingesting}
          onIngest={kb.ingest}
          statsText={kb.knowledgeStats ? `已入库：${kb.knowledgeStats.documents} 文档，${kb.knowledgeStats.chunks} 块` : '等待加载知识库统计...'}
        />

        {tab === 'chat' ? (
          <ChatView
            title={chat.activeTitle}
            messages={chat.messages}
            input={chat.input}
            loading={chat.loading}
            toast={chat.toast}
            onInput={chat.setInput}
            onSend={() => chat.sendMessage(kb.useLocalKnowledge)}
            onCopyToast={(text) => chat.setToast(text)}
          />
        ) : (
          <>
            <div className={styles.chatTitle}>本地知识库管理</div>
            <KnowledgeManager
              docs={kb.knowledgeDocs}
              loading={kb.knowledgeLoading}
              editingDocId={kb.editingDocId}
              editingTitle={kb.editingTitle}
              setEditingTitle={kb.setEditingTitle}
              editingText={kb.editingText}
              setEditingText={kb.setEditingText}
              saving={kb.savingDoc}
              onOpenDoc={(id) => kb.openDoc(id)}
              onSave={() => kb.saveDoc()}
              onDelete={() => setPendingDeleteDoc(true)}
            />
          </>
        )}
      </div>

      {convMenu ? (
        <div className={styles.contextMenu} style={{ left: convMenu.x, top: convMenu.y }}>
          <button
            onClick={() => {
              const target = chat.conversations.find((c) => c.id === convMenu.conversationId);
              setRenamingId(convMenu.conversationId);
              setRenamingTitle(target?.title || '会话');
              setConvMenu(null);
            }}
          >
            编辑会话名
          </button>
          <button
            onClick={async () => {
              setPendingDeleteConversationId(convMenu.conversationId);
              setConvMenu(null);
            }}
          >
            删除会话
          </button>
        </div>
      ) : null}
      {pendingDeleteConversationId ? (
        <div className={styles.confirmOverlay} onClick={() => setPendingDeleteConversationId(null)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmTitle}>确认删除会话</div>
            <div className={styles.confirmText}>删除后将移除该会话及其消息，无法恢复。</div>
            <div className={styles.confirmActions}>
              <button className="wx-btn ghost" onClick={() => setPendingDeleteConversationId(null)}>取消</button>
              <button
                className="wx-btn danger"
                onClick={async () => {
                  await chat.removeConversation(pendingDeleteConversationId);
                  navigate('/chat');
                  setPendingDeleteConversationId(null);
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingDeleteDoc ? (
        <div className={styles.confirmOverlay} onClick={() => setPendingDeleteDoc(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmTitle}>确认删除文档</div>
            <div className={styles.confirmText}>删除后该文档及其知识分块将被移除，无法恢复。</div>
            <div className={styles.confirmActions}>
              <button className="wx-btn ghost" onClick={() => setPendingDeleteDoc(false)}>取消</button>
              <button
                className="wx-btn danger"
                onClick={async () => {
                  await kb.removeDoc();
                  setPendingDeleteDoc(false);
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
