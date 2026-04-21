import React from 'react';
import type { KnowledgeDocument } from '../../modules/knowledge/use-knowledge-module';

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
    <div className="knowledge-manager">
      <div className="doc-list">
        {loading ? <div className="stats-tip">加载中...</div> : null}
        {!loading && docs.length === 0 ? <div className="stats-tip">暂无文档</div> : null}
        {docs.map((d) => (
          <button key={d.id} className={`conversation-item ${editingDocId === d.id ? 'active' : ''}`} onClick={() => onOpenDoc(d.id)}>
            <div>{d.title || '未命名文档'}</div>
            <small>{d.chunkCount} 块 · {new Date(d.updatedAt).toLocaleString()}</small>
          </button>
        ))}
      </div>
      <div className="doc-editor">
        {!editingDocId ? (
          <div className="stats-tip">请选择左侧文档进行编辑</div>
        ) : (
          <>
            <input className="wx-input" value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} placeholder="文档标题" disabled={saving} />
            <textarea className="wx-input" rows={14} value={editingText} onChange={(e) => setEditingText(e.target.value)} placeholder="文档内容" disabled={saving} />
            <div className="row">
              <button className="wx-btn primary" disabled={saving || !editingText.trim()} onClick={onSave}>{saving ? '保存中...' : '保存修改'}</button>
              <button className="wx-btn danger" disabled={saving} onClick={onDelete}>删除文档</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
