import React from 'react';
import type { KnowledgeDocument } from '../../modules/knowledge/use-knowledge-module';
import styles from '../../pages/app-layout.module.css';
import { formatDisplayDateTime } from '../../utils/datetime';

export function KnowledgeManager(props: {
  docs: KnowledgeDocument[];
  loading: boolean;
  editingDocId: string;
  editingTitle: string;
  setEditingTitle: (v: string) => void;
  editingText: string;
  setEditingText: (v: string) => void;
  saving: boolean;
  onOpenDoc: (id: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const {
    docs,
    loading,
    editingDocId,
    editingTitle,
    setEditingTitle,
    editingText,
    setEditingText,
    saving,
    onOpenDoc,
    onSave,
    onDelete
  } = props;
  return (
    <div className={styles.knowledgeManager}>
      <div className={styles.docList}>
        {loading ? <div className="stats-tip">加载中...</div> : null}
        {!loading && docs.length === 0 ? <div className="stats-tip">暂无文档</div> : null}
        {docs.map((d) => (
          <button
            key={d.id}
            className={`${styles.conversationItem} ${styles.docConversationItem} ${editingDocId === d.id ? `${styles.conversationItemActive} ${styles.docConversationItemActive}` : ''}`}
            onClick={() => onOpenDoc(d.id)}
          >
            <div>{d.title || '未命名文档'}</div>
            <small className={styles.conversationMeta}>{d.chunkCount} 个知识分块 · {formatDisplayDateTime(d.updatedAt)}</small>
          </button>
        ))}
      </div>
      <div className={styles.docEditor}>
        {!editingDocId ? (
          <div className={styles.docEditorEmpty}>请选择左侧文档进行编辑</div>
        ) : (
          <>
            <div className={styles.docEditorHeader}>
              <input
                className={`wx-input ${styles.docEditorTitleInput}`}
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                placeholder="文档标题"
                disabled={saving}
              />
              <div className={styles.docEditorToolbar}>
                <button className="wx-btn primary" disabled={saving || !editingText.trim()} onClick={onSave}>
                  {saving ? '更新中...' : '更新'}
                </button>
                <button className="wx-btn danger" disabled={saving} onClick={onDelete}>
                  删除
                </button>
              </div>
            </div>
            <textarea
              className={`wx-input ${styles.docEditorTextarea}`}
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              placeholder="文档内容"
              disabled={saving}
            />
          </>
        )}
      </div>
    </div>
  );
}
