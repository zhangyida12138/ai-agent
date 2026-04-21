import React from 'react';
import styles from '../../pages/app-layout.module.css';

export function KnowledgeIngestCard(props: {
  useLocalKnowledge: boolean;
  setUseLocalKnowledge: (v: boolean) => void;
  compact?: boolean;
  title: string;
  setTitle: (v: string) => void;
  text: string;
  setText: (v: string) => void;
  ingesting: boolean;
  onIngest: () => void;
  statsText: string;
}) {
  const { useLocalKnowledge, setUseLocalKnowledge, compact, title, setTitle, text, setText, ingesting, onIngest, statsText } = props;
  const canIngest = Boolean(title.trim()) && Boolean(text.trim()) && !ingesting;
  return (
    <div className={styles.knowledgeBox}>
      <div className={styles.knowledgeHeader}>
        <div>本地知识库</div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={useLocalKnowledge} onChange={(e) => setUseLocalKnowledge(e.target.checked)} />
          使用本地知识库（RAG）
        </label>
      </div>
      {!compact ? (
        <>
          <div className={styles.row}>
            <input className="wx-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文档标题（必填）" disabled={ingesting} />
            <button className={`wx-btn primary ${styles.ingestBtn}`} onClick={onIngest} disabled={!canIngest}>
              {ingesting ? '导入中...' : '导入到本地知识库'}
            </button>
          </div>
          <textarea className="wx-input" value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="粘贴要入库的文本（用于本地检索/回答）" disabled={ingesting} />
        </>
      ) : null}
      <div className="stats-tip">{statsText}</div>
    </div>
  );
}
