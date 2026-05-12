import React, { useCallback, useRef, useState } from 'react';
import styles from '../../pages/app-layout.module.css';
import type { KnowledgeDocument } from '../../modules/knowledge/use-knowledge-module';
import { KNOWLEDGE_UPLOAD_MAX_BYTES, parseKnowledgeUploadFile } from '../../utils/parse-knowledge-file';

const ACCEPT =
  '.txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const UPLOAD_MAX_MB = Math.floor(KNOWLEDGE_UPLOAD_MAX_BYTES / (1024 * 1024));

export function KnowledgeIngestCard(props: {
  useLocalKnowledge: boolean;
  setUseLocalKnowledge: (v: boolean) => void;
  /** 为 true 时在标题栏显示「使用本地知识库」开关（仅聊天页应开启） */
  showUseLocalKnowledgeToggle?: boolean;
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
  onUploadError?: (message: string) => void;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** 点击「本地知识库」标题时跳转知识库管理页 */
  onNavigateToKnowledgeManage?: () => void;
}) {
  const {
    useLocalKnowledge,
    setUseLocalKnowledge,
    showUseLocalKnowledgeToggle = false,
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
    onUploadError,
    collapsible,
    collapsed,
    onToggleCollapse,
    onNavigateToKnowledgeManage
  } = props;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsingFile, setParsingFile] = useState(false);
  const [textDragActive, setTextDragActive] = useState(false);
  const textDragDepthRef = useRef(0);
  const canIngest = Boolean(title.trim()) && Boolean(text.trim()) && !ingesting;
  const busy = ingesting || parsingFile;

  const handleUploadFile = useCallback(
    async (file: File) => {
      try {
        setParsingFile(true);
        const { title: fileTitle, text: parsed } = await parseKnowledgeUploadFile(file);
        if (!title.trim()) setTitle(fileTitle);
        setText(parsed);
      } catch (err: any) {
        onUploadError?.(err?.message || '文件解析失败');
      } finally {
        setParsingFile(false);
      }
    },
    [onUploadError, setText, setTitle, title]
  );

  const onInputFiles = useCallback(
    async (list: FileList | null) => {
      const file = list?.[0];
      if (!file) return;
      await handleUploadFile(file);
    },
    [handleUploadFile]
  );

  const onTextDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      textDragDepthRef.current += 1;
      setTextDragActive(true);
    },
    [busy]
  );

  const onTextDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy) return;
      textDragDepthRef.current -= 1;
      if (textDragDepthRef.current <= 0) {
        textDragDepthRef.current = 0;
        setTextDragActive(false);
      }
    },
    [busy]
  );

  const onTextDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onTextDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      textDragDepthRef.current = 0;
      setTextDragActive(false);
      if (busy) return;
      const file = e.dataTransfer.files?.[0];
      if (file) void handleUploadFile(file);
    },
    [busy, handleUploadFile]
  );

  return (
    <div className={styles.knowledgeBox}>
      <div className={styles.knowledgeHeader}>
        <div className={styles.knowledgeTitleWrap}>
          {onNavigateToKnowledgeManage ? (
            <button
              type="button"
              className={styles.knowledgeTitleButton}
              onClick={onNavigateToKnowledgeManage}
              title="打开知识库管理"
            >
              本地知识库
            </button>
          ) : (
            <span>本地知识库</span>
          )}
          {collapsible ? (
            <button className={`wx-btn ghost ${styles.knowledgeCollapseBtn}`} onClick={onToggleCollapse} title={collapsed ? '展开' : '收起'}>
              <span aria-hidden>{collapsed ? '▼' : '▲'}</span>
            </button>
          ) : null}
        </div>
        {showUseLocalKnowledgeToggle ? (
          <label className={styles.toggle}>
            <input type="checkbox" checked={useLocalKnowledge} onChange={(e) => setUseLocalKnowledge(e.target.checked)} />
            使用本地知识库（RAG）
          </label>
        ) : null}
      </div>
      {collapsed ? null : !compact ? (
        <>
          <div className={`${styles.row} ${styles.knowledgeTitleRow}`}>
            <div className={styles.knowledgeTitleClearWrap}>
              <input
                className={`wx-input ${styles.knowledgeTitleInput}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="文档标题（必填）"
                disabled={busy}
              />
              {!busy && title ? (
                <button
                  type="button"
                  tabIndex={-1}
                  className={styles.knowledgeInputClearBtn}
                  aria-label="清空标题"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setTitle('');
                  }}
                >
                  <span aria-hidden className={styles.knowledgeInputClearGlyph}>
                    ×
                  </span>
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              className={styles.hiddenFileInput}
              accept={ACCEPT}
              onChange={async (e) => {
                await onInputFiles(e.target.files);
                e.currentTarget.value = '';
              }}
            />
            <button className={`wx-btn primary ${styles.ingestBtn}`} onClick={onIngest} disabled={!canIngest || busy}>
              {ingesting ? '导入中...' : '导入到本地知识库'}
            </button>
          </div>
          <div className={styles.knowledgeTextRow}>
            <div className={styles.knowledgeTextareaClearWrap}>
              <textarea
                className={`wx-input ${styles.knowledgeIngestTextarea} ${textDragActive ? styles.knowledgeIngestTextareaDrop : ''}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="粘贴要入库的文本（用于本地检索/回答），或将文件拖入此处上传"
                disabled={busy}
                onDragEnter={onTextDragEnter}
                onDragLeave={onTextDragLeave}
                onDragOver={onTextDragOver}
                onDrop={onTextDrop}
              />
              {!busy && text ? (
                <button
                  type="button"
                  tabIndex={-1}
                  className={`${styles.knowledgeInputClearBtn} ${styles.knowledgeInputClearBtnTextarea}`}
                  aria-label="清空正文"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setText('');
                  }}
                >
                  <span aria-hidden className={styles.knowledgeInputClearGlyph}>
                    ×
                  </span>
                </button>
              ) : null}
            </div>
            <div className={styles.knowledgeUploadAside}>
              <button
                type="button"
                className={`wx-btn ghost ${styles.knowledgeUploadClickBtn}`}
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {parsingFile ? '解析中…' : '点击上传'}
              </button>
              <div className={styles.knowledgeHelpWrap}>
                <button type="button" className={styles.knowledgeHelpLink}>
                  上传说明
                </button>
                <div className={styles.knowledgeHelpPopover} role="tooltip">
                  <p className={styles.knowledgeHelpPopoverTitle}>详细说明</p>
                  <ul className={styles.knowledgeHelpPopoverList}>
                    <li>
                      单文件大小不超过 <strong>{UPLOAD_MAX_MB} MB</strong>。
                    </li>
                    <li>支持格式：.txt、.docx、.pdf。</li>
                    <li>扫描版 PDF 使用 OCR 提取文字，速度较慢，首次需联网下载语言模型。</li>
                    <li>可将文件拖入左侧文本框，或使用「点击上传」选择文件，解析结果会填入文本框。</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
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
