import React, { useEffect, useState } from 'react';
import { ConversationSidebar } from '../components/layout/conversation-sidebar';
import { ChatView } from '../components/chat/chat-view';
import { KnowledgeIngestCard } from '../components/knowledge/knowledge-ingest-card';
import { KnowledgeManager } from '../components/knowledge/knowledge-manager';
import { useChatModule } from '../modules/chat/use-chat-module';
import { useKnowledgeModule } from '../modules/knowledge/use-knowledge-module';
import { useAuth } from '../modules/auth/auth';
import { useRouter } from '../modules/routing/router';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { path, navigate } = useRouter();
  const tab: 'chat' | 'knowledge' = path === '/knowledge' ? 'knowledge' : 'chat';

  const chat = useChatModule();
  const kb = useKnowledgeModule();
  const [convMenu, setConvMenu] = useState<{ x: number; y: number; conversationId: string } | null>(null);
  const [renamingId, setRenamingId] = useState('');
  const [renamingTitle, setRenamingTitle] = useState('');

  useEffect(() => {
    chat.refreshConversations().then(() => undefined);
    kb.refreshKnowledge().then(() => undefined);
    kb.refreshKnowledgeDocs().then(() => undefined);
  }, []);

  useEffect(() => {
    if (chat.activeId) chat.refreshMessages(chat.activeId);
  }, [chat.activeId]);

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

  return (
    <div className="wx-shell">
      <ConversationSidebar
        userName={user?.username || ''}
        conversations={chat.conversations}
        activeId={chat.activeId}
        onSelect={(id) => {
          chat.setActiveId(id);
          navigate('/chat');
        }}
        onNew={chat.newConversation}
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
      />

      <div className="wx-main">
        <KnowledgeIngestCard
          useLocalKnowledge={kb.useLocalKnowledge}
          setUseLocalKnowledge={kb.setUseLocalKnowledge}
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
            onInput={chat.setInput}
            onSend={() => chat.sendMessage(kb.useLocalKnowledge)}
            onCopyToast={(text) => chat.setToast(text)}
          />
        ) : (
          <>
            <div className="chat-title">本地知识库管理</div>
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
              onDelete={() => {
                if (window.confirm('确认删除该文档？')) kb.removeDoc();
              }}
            />
          </>
        )}
      </div>

      {convMenu ? (
        <div className="context-menu" style={{ left: convMenu.x, top: convMenu.y }}>
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
              if (window.confirm('确认删除该会话？')) await chat.removeConversation(convMenu.conversationId);
              navigate('/chat');
              setConvMenu(null);
            }}
          >
            删除会话
          </button>
        </div>
      ) : null}
      {chat.toast ? <div className="copy-toast">{chat.toast}</div> : null}
    </div>
  );
}
