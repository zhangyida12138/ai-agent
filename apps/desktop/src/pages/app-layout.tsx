import React, { useEffect, useRef, useState } from 'react';
import { ConversationSidebar } from '../components/layout/conversation-sidebar';
import { ChatView } from '../components/chat/chat-view';
import { KnowledgeIngestCard } from '../components/knowledge/knowledge-ingest-card';
import { KnowledgeManager } from '../components/knowledge/knowledge-manager';
import { useChatModule } from '../modules/chat/use-chat-module';
import { useKnowledgeModule } from '../modules/knowledge/use-knowledge-module';
import { useAuth } from '../modules/auth/auth';
import { useRouter } from '../modules/routing/router';
import styles from './app-layout.module.css';
import { updateTheme } from '../api';

export function AppLayout() {
  const MAX_AVATAR_BYTES = 1024 * 1024; // 1MB
  const { user, logout, updateUserProfile } = useAuth();
  const { path, navigate } = useRouter();
  const tab: 'chat' | 'knowledge' | 'settings' = path === '/knowledge' ? 'knowledge' : path === '/settings' ? 'settings' : 'chat';

  const chat = useChatModule();
  const kb = useKnowledgeModule();
  const [convMenu, setConvMenu] = useState<{ x: number; y: number; conversationId: string } | null>(null);
  const [settingsMenu, setSettingsMenu] = useState<{ x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState('');
  const [renamingTitle, setRenamingTitle] = useState('');
  const [pendingDeleteConversationId, setPendingDeleteConversationId] = useState<string | null>(null);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState(false);
  const [pendingLogoutConfirm, setPendingLogoutConfirm] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [knowledgeCardCollapsed, setKnowledgeCardCollapsed] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAge, setProfileAge] = useState('');
  const [profileGender, setProfileGender] = useState('');
  const [profileOccupation, setProfileOccupation] = useState('');
  const [profileNeeds, setProfileNeeds] = useState('');
  const [profileCustomFields, setProfileCustomFields] = useState<Array<{ key: string; value: string }>>([]);
  const [draftCustomField, setDraftCustomField] = useState<{ key: string; value: string }>({ key: '', value: '' });
  const [showDraftCustomField, setShowDraftCustomField] = useState(false);
  const [profileAvatarData, setProfileAvatarData] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ai-agent-theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  const importChatInputRef = useRef<HTMLInputElement | null>(null);

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
    const errText = chat.error || kb.error;
    if (!errText) return;
    setErrorModal(errText);
    if (chat.error) chat.setError(null);
    if (kb.error) kb.setError(null);
  }, [chat.error, kb.error]);

  useEffect(() => {
    if (!successModal) return;
    const timer = window.setTimeout(() => setSuccessModal(null), 1400);
    return () => window.clearTimeout(timer);
  }, [successModal]);

  useEffect(() => {
    const close = () => {
      setConvMenu(null);
      setSettingsMenu(null);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ai-agent-theme', theme);
  }, [theme]);

  useEffect(() => {
    const userTheme = user?.theme;
    if (userTheme === 'dark' || userTheme === 'light') setTheme(userTheme);
  }, [user?.theme]);

  useEffect(() => {
    setProfileName(user?.displayName || '');
    setProfileAge(user?.age == null ? '' : String(user.age));
    setProfileGender(user?.gender || '');
    setProfileOccupation(user?.occupation || '');
    setProfileNeeds(user?.needs || '');
    setProfileCustomFields(Array.isArray(user?.customFields) ? user.customFields : []);
    setDraftCustomField({ key: '', value: '' });
    setShowDraftCustomField(false);
    setProfileAvatarData(user?.avatarData || null);
    setIsProfileEditing(false);
  }, [user?.id, user?.displayName, user?.age, user?.gender, user?.occupation, user?.needs, user?.customFields, user?.avatarData]);

  return (
    <div className={`app-shell ${styles.shell}`}>
      {sidebarCollapsed ? (
        <div className={styles.sidebarCollapsed}>
          <button className={`wx-btn ghost ${styles.expandBtn}`} onClick={() => setSidebarCollapsed(false)} title="展开侧栏">
            <span aria-hidden>▶</span>
          </button>
          <div className={styles.collapsedConversationList}>
            {chat.conversations.slice(0, 12).map((c) => (
              <button
                key={c.id}
                className={`${styles.collapsedConversationBtn} ${chat.activeId === c.id ? styles.collapsedConversationBtnActive : ''}`}
                title={c.title || '会话'}
                onClick={() => {
                  chat.setActiveId(c.id);
                  navigate('/chat');
                }}
              >
                {(c.title || '会话').slice(0, 1).toUpperCase()}
              </button>
            ))}
          </div>
          <button
            className={`wx-btn ghost ${styles.expandBtn}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSettingsMenu({ x: e.clientX, y: e.clientY });
            }}
            title="设置"
          >
            <span aria-hidden>⚙</span>
          </button>
        </div>
      ) : (
        <ConversationSidebar
          userName={user?.username || ''}
          displayName={user?.displayName || ''}
          avatarData={user?.avatarData || null}
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
          onProfile={() => navigate('/settings')}
          onSettingsMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSettingsMenu({ x: e.clientX, y: e.clientY });
          }}
          tab={tab}
          onTab={() => navigate('/chat')}
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
          onToggleCollapse={() => setSidebarCollapsed(true)}
        />
      )}

      <div className={styles.main}>
        {tab !== 'settings' ? (
          <KnowledgeIngestCard
            useLocalKnowledge={kb.useLocalKnowledge}
            setUseLocalKnowledge={(v) => {
              kb.setUseLocalKnowledge(v);
              if (!v) {
                kb.setSelectedDocIds([]);
                return;
              }
              kb.setSelectedDocIds((prev) => {
                if (prev.length > 0) return prev;
                return kb.knowledgeDocs.map((d) => d.id);
              });
            }}
            docs={kb.knowledgeDocs}
            selectedDocIds={kb.selectedDocIds}
            onToggleDoc={(docId, selected) => {
              kb.setSelectedDocIds((prev) => {
                const next = selected ? Array.from(new Set([...prev, docId])) : prev.filter((id) => id !== docId);
                kb.setUseLocalKnowledge(next.length > 0);
                return next;
              });
            }}
            compact={tab === 'chat'}
            title={kb.knowledgeTitle}
            setTitle={kb.setKnowledgeTitle}
            text={kb.knowledgeText}
            setText={kb.setKnowledgeText}
            ingesting={kb.ingesting}
            onIngest={kb.ingest}
            statsText={kb.knowledgeStats ? `已入库：${kb.knowledgeStats.documents} 文档，${kb.knowledgeStats.chunks} 块` : '等待加载知识库统计...'}
            collapsible
            collapsed={knowledgeCardCollapsed}
            onToggleCollapse={() => setKnowledgeCardCollapsed((prev) => !prev)}
          />
        ) : null}

        {tab === 'chat' ? (
          <ChatView
            title={chat.activeTitle}
            messages={chat.messages}
            input={chat.input}
            loading={chat.loading}
            toast={chat.toast}
            onInput={chat.setInput}
            onSend={() => chat.sendMessage(kb.useLocalKnowledge, kb.selectedDocIds)}
            onStop={chat.stopGenerating}
            onCopyToast={(text) => chat.setToast(text)}
          />
        ) : tab === 'knowledge' ? (
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
        ) : (
          <>
            <div className={styles.profileHeader}>
              <div className={styles.chatTitle}>个人信息</div>
              <button
                className="wx-btn primary"
                disabled={profileSaving}
                onClick={async () => {
                  if (!isProfileEditing) {
                    setIsProfileEditing(true);
                    return;
                  }
                  try {
                    setProfileSaving(true);
                    await updateUserProfile({
                      displayName: profileName.trim() || null,
                      age: profileAge.trim() ? Number(profileAge.trim()) : null,
                      gender: profileGender.trim() || null,
                      occupation: profileOccupation.trim() || null,
                      needs: profileNeeds.trim() || null,
                      avatarData: profileAvatarData,
                      customFields: profileCustomFields.map((x) => ({ key: x.key.trim(), value: x.value.trim() })).filter((x) => x.key)
                    });
                    setIsProfileEditing(false);
                    setSuccessModal('个人信息保存成功');
                  } catch (e: any) {
                    setErrorModal(e?.message || '保存失败，请稍后重试');
                  } finally {
                    setProfileSaving(false);
                  }
                }}
              >
                {isProfileEditing ? (profileSaving ? '保存中...' : '保存') : '编辑'}
              </button>
            </div>
            <div className={styles.profileCard}>
              <input
                ref={importChatInputRef}
                className={styles.hiddenFileInput}
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const raw = await file.text();
                    const result = await chat.importConversationBundle(raw);
                    if (result) {
                      chat.setToast(`导入成功：${result.importedConversations} 个会话，${result.importedMessages} 条消息`);
                    }
                  } finally {
                    e.currentTarget.value = '';
                  }
                }}
              />
              <input
                id="profile-avatar-upload"
                className={styles.hiddenFileInput}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (!isProfileEditing) return;
                  const file = e.target.files?.[0];
                  if (!file) return;
                    if (file.size > MAX_AVATAR_BYTES) {
                      setErrorModal('图片过大（最大 1MB）');
                      e.currentTarget.value = '';
                      return;
                    }
                  const reader = new FileReader();
                  reader.onload = () => setProfileAvatarData(typeof reader.result === 'string' ? reader.result : null);
                  reader.readAsDataURL(file);
                }}
              />
              <div className={styles.profileAvatarRow}>
                {profileAvatarData ? (
                  <>
                    <img className={styles.profileAvatarImage} src={profileAvatarData} alt="avatar" />
                    <label className={styles.replaceAvatarText} htmlFor={isProfileEditing ? 'profile-avatar-upload' : undefined}>
                      替换头像
                    </label>
                  </>
                ) : (
                  <label className={styles.profileAvatarUploadLabel} htmlFor="profile-avatar-upload">
                    <span className={styles.profileAvatarFallback}>{(profileName || user?.username || 'U').slice(0, 1).toUpperCase()}</span>
                  </label>
                )}
              </div>
              <div className={styles.profileGrid}>
                <div className={styles.profileField}>
                  <div className={styles.profileFieldLabel}>姓名</div>
                  {isProfileEditing ? (
                    <input className="wx-input" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="请输入姓名（可选）" />
                  ) : (
                    <div>{profileName || '-'}</div>
                  )}
                </div>
                <div className={styles.profileField}>
                  <div className={styles.profileFieldLabel}>年龄</div>
                  {isProfileEditing ? (
                    <input className="wx-input" value={profileAge} onChange={(e) => setProfileAge(e.target.value)} placeholder="请输入年龄（可选）" />
                  ) : (
                    <div>{profileAge || '-'}</div>
                  )}
                </div>
                <div className={styles.profileField}>
                  <div className={styles.profileFieldLabel}>性别</div>
                  {isProfileEditing ? (
                    <input className="wx-input" value={profileGender} onChange={(e) => setProfileGender(e.target.value)} placeholder="请输入性别（可选）" />
                  ) : (
                    <div>{profileGender || '-'}</div>
                  )}
                </div>
                <div className={styles.profileField}>
                  <div className={styles.profileFieldLabel}>职业</div>
                  {isProfileEditing ? (
                    <input className="wx-input" value={profileOccupation} onChange={(e) => setProfileOccupation(e.target.value)} placeholder="请输入职业（可选）" />
                  ) : (
                    <div>{profileOccupation || '-'}</div>
                  )}
                </div>
              </div>
              <div className={styles.profileField}>
                <div className={styles.profileFieldLabel}>需求/偏好</div>
                {isProfileEditing ? (
                  <textarea className="wx-input" rows={5} value={profileNeeds} onChange={(e) => setProfileNeeds(e.target.value)} placeholder="例如：偏向简洁回答，给可执行步骤" />
                ) : (
                  <div>{profileNeeds || '-'}</div>
                )}
              </div>
              <div className={styles.profileField}>
                <div className={`${styles.profileFieldLabel} ${styles.customFieldsTitle}`}>自定义字段</div>
                {profileCustomFields.map((field, idx) => (
                  <div key={`cf-${idx}`} className={styles.profileField}>
                    <div className={styles.profileFieldLabel}>{field.key || `字段 ${idx + 1}`}</div>
                    {isProfileEditing ? (
                      <div className={styles.row}>
                        <input
                          className="wx-input"
                          value={field.value}
                          onChange={(e) =>
                            setProfileCustomFields((prev) => prev.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)))
                          }
                          placeholder="字段值"
                        />
                        <button className={`wx-btn ghost ${styles.iconBtn}`} title="删除字段" onClick={() => setProfileCustomFields((prev) => prev.filter((_, i) => i !== idx))}>
                          <span aria-hidden>🗑</span>
                        </button>
                      </div>
                    ) : (
                      <div>{field.value || '-'}</div>
                    )}
                  </div>
                ))}
                {isProfileEditing ? (
                  <>
                    <button className="wx-btn ghost" onClick={() => setShowDraftCustomField(true)}>新增自定义字段</button>
                    {showDraftCustomField ? (
                      <div className={styles.row}>
                        <input
                          className="wx-input"
                          value={draftCustomField.key}
                          onChange={(e) => setDraftCustomField((prev) => ({ ...prev, key: e.target.value }))}
                          placeholder="新增字段名"
                        />
                        <input
                          className="wx-input"
                          value={draftCustomField.value}
                          onChange={(e) => setDraftCustomField((prev) => ({ ...prev, value: e.target.value }))}
                          placeholder="新增字段值"
                        />
                        <button
                          className={`wx-btn ghost ${styles.iconBtn}`}
                          title="确认新增"
                          onClick={() => {
                            const key = draftCustomField.key.trim();
                            if (!key) return;
                            setProfileCustomFields((prev) => [...prev, { key, value: draftCustomField.value.trim() }]);
                            setDraftCustomField({ key: '', value: '' });
                            setShowDraftCustomField(false);
                          }}
                        >
                          <span aria-hidden>✔</span>
                        </button>
                        <button
                          className={`wx-btn ghost ${styles.iconBtn}`}
                          title="删除草稿"
                          onClick={() => {
                            setDraftCustomField({ key: '', value: '' });
                            setShowDraftCustomField(false);
                          }}
                        >
                          <span aria-hidden>🗑</span>
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>

      {convMenu ? (
        <div className={styles.contextMenu} style={{ left: convMenu.x, top: convMenu.y }}>
          <button
            onClick={async () => {
              const raw = await chat.exportConversationById(convMenu.conversationId);
              if (!raw) return;
              const target = chat.conversations.find((c) => c.id === convMenu.conversationId);
              const safeTitle = (target?.title || 'conversation').replace(/[\\/:*?"<>|]/g, '_');
              const blob = new Blob([raw], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `chat-export-${safeTitle}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              chat.setToast('会话导出成功');
              setConvMenu(null);
            }}
          >
            导出会话
          </button>
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
      {settingsMenu ? (
        <div className={styles.contextMenu} style={{ left: settingsMenu.x, top: settingsMenu.y, transform: 'translateY(calc(-100% - 8px))' }}>
          <button
            onClick={() => {
              setTheme((prev) => {
                const next = prev === 'dark' ? 'light' : 'dark';
                updateTheme(next).catch(() => undefined);
                return next;
              });
              setSettingsMenu(null);
            }}
          >
            {theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
          </button>
          <button
            onClick={() => {
              navigate('/knowledge');
              setSettingsMenu(null);
            }}
          >
            知识库管理
          </button>
          <button
            onClick={() => {
              importChatInputRef.current?.click();
              setSettingsMenu(null);
            }}
          >
            导入会话
          </button>
          <button
            onClick={async () => {
              const raw = await chat.exportAllConversationBundles();
              if (!raw) return;
              const blob = new Blob([raw], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `chat-export-all-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              chat.setToast('批量导出成功');
              setSettingsMenu(null);
            }}
          >
            批量导出会话
          </button>
          <button
            onClick={() => {
              setPendingLogoutConfirm(true);
              setSettingsMenu(null);
            }}
          >
            退出登录
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
      {pendingLogoutConfirm ? (
        <div className={styles.confirmOverlay} onClick={() => setPendingLogoutConfirm(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmTitle}>确认退出登录</div>
            <div className={styles.confirmText}>退出后需要重新登录才能继续使用。</div>
            <div className={styles.confirmActions}>
              <button className="wx-btn ghost" onClick={() => setPendingLogoutConfirm(false)}>取消</button>
              <button
                className="wx-btn danger"
                onClick={() => {
                  logout();
                  navigate('/auth', true);
                  setPendingLogoutConfirm(false);
                }}
              >
                确认退出
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {errorModal ? (
        <div className={styles.confirmOverlay} onClick={() => setErrorModal(null)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmTitle}>错误</div>
            <div className={styles.confirmText}>{errorModal}</div>
            <div className={styles.confirmActions}>
              <button className="wx-btn primary" onClick={() => setErrorModal(null)}>我知道了</button>
            </div>
          </div>
        </div>
      ) : null}
      {successModal ? (
        <div className={styles.successToast}>
          {successModal}
        </div>
      ) : null}
    </div>
  );
}
