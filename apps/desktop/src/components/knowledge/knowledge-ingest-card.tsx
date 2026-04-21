import React from 'react';
import styles from '../../pages/app-layout.module.css';
import type { KnowledgeDocument } from '../../modules/knowledge/use-knowledge-module';

export function KnowledgeIngestCard(props: {
  useLocalKnowledge: boolean;
  setUseLocalKnowledge: (v: boolean) => void;
  docs?: KnowledgeDocument[];
  selectedDocIds?: string[];
  onToggleDoc?: (docId: string, selected: boolean) => void;
  compact?: boolean;
  title: string;
  setTitle: (v: string) => void;
  text: string;
  setText: (v: string) => void;
  ingesting: boolean;
  onIngest: () => void;
  statsText: string;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const {
    useLocalKnowledge,
    setUseLocalKnowledge,
    docs = [],
    selectedDocIds = [],
    onToggleDoc,
    compact,
    title,
    setTitle,
    text,
    setText,
    ingesting,
    onIngest,
    statsText,
    collapsible,
    collapsed,
    onToggleCollapse
  } = props;
  const canIngest = Boolean(title.trim()) && Boolean(text.trim()) && !ingesting;
  return (
    <div className={styles.knowledgeBox}>
      <div className={styles.knowledgeHeader}>
        <div className={styles.knowledgeTitleWrap}>
          <span>本地知识库</span>
          {collapsible ? (
            <button className={`wx-btn ghost ${styles.knowledgeCollapseBtn}`} onClick={onToggleCollapse} title={collapsed ? '展开' : '收起'}>
              <span aria-hidden>{collapsed ? '▼' : '▲'}</span>
            </button>
          ) : null}
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={useLocalKnowledge} onChange={(e) => setUseLocalKnowledge(e.target.checked)} />
          使用本地知识库（RAG）
        </label>
      </div>
      {collapsed ? null : !compact ? (
        <>
          <div className={styles.row}>
            <input className="wx-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文档标题（必填）" disabled={ingesting} />
            <button className={`wx-btn primary ${styles.ingestBtn}`} onClick={onIngest} disabled={!canIngest}>
              {ingesting ? '导入中...' : '导入到本地知识库'}
            </button>
          </div>
          <textarea className="wx-input" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="粘贴要入库的文本（用于本地检索/回答）" disabled={ingesting} />
        </>
      ) : (
        <div className={styles.docPickerBox}>
          <div className={styles.docPickerTitle}>聊天检索范围（可多选）</div>
          {docs.length === 0 ? (
            <div className="stats-tip">暂无可选知识库文档</div>
          ) : (
            <div className={styles.docPickerList}>
              {docs.map((d) => (
                <label key={d.id} className={styles.docPickerItem}>
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(d.id)}
                    disabled={!useLocalKnowledge}
                    onChange={(e) => onToggleDoc?.(d.id, e.target.checked)}
                  />
                  <span className={styles.docPickerLabel}>{d.title || '未命名文档'}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {collapsed ? null : <div className="stats-tip">{statsText}</div>}
    </div>
  );
}
