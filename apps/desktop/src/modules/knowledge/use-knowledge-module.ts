import { useEffect, useRef, useState } from 'react';
import { deleteKnowledgeDocument, getKnowledgeDocument, getKnowledgeStats, ingestText, listKnowledgeDocuments, updateKnowledgeDocument } from '../../api';
import { broadcastKnowledgeSync, subscribeKnowledgeSync } from './knowledge-sync';
import { createUuid } from '../../utils/uuid';

export type KnowledgeDocument = {
  id: string;
  title: string | null;
  sourcePath: string | null;
  createdAt: string;
  updatedAt: string;
  chunkCount: number;
};

export function useKnowledgeModule() {
  const [useLocalKnowledge, setUseLocalKnowledge] = useState(false);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeText, setKnowledgeText] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [knowledgeStats, setKnowledgeStats] = useState<{ documents: number; chunks: number } | null>(null);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [editingDocId, setEditingDocId] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [editingText, setEditingText] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshKnowledge() {
    const resp = await getKnowledgeStats();
    if (!resp.ok) return setError(`${resp.code}: ${resp.message}`);
    setKnowledgeStats(resp.data as any);
  }

  /** silent：后台刷新（定时、广播、保存后同步）不置 loading，避免列表反复出现「加载中...」 */
  async function refreshKnowledgeDocs(silent = false) {
    if (!silent) setKnowledgeLoading(true);
    const resp = await listKnowledgeDocuments();
    if (!resp.ok) {
      if (!silent) setKnowledgeLoading(false);
      setError(`${resp.code}: ${resp.message}`);
      return [];
    }
    const docs = resp.data?.documents || [];
    setKnowledgeDocs(docs);
    setSelectedDocIds((prev) => {
      const allIds = docs.map((d: KnowledgeDocument) => d.id);
      if (allIds.length === 0) return [];
      if (prev.length === 0) return allIds;
      const keep = prev.filter((id) => allIds.includes(id));
      return keep.length > 0 ? keep : allIds;
    });
    if (!silent) setKnowledgeLoading(false);
    return docs as KnowledgeDocument[];
  }

  const refreshKnowledgeRef = useRef(refreshKnowledge);
  const refreshKnowledgeDocsRef = useRef(refreshKnowledgeDocs);
  refreshKnowledgeRef.current = refreshKnowledge;
  refreshKnowledgeDocsRef.current = refreshKnowledgeDocs;

  /** 同浏览器多标签广播 + 定时拉取（多端共用同一 sidecar 时对齐知识库） */
  useEffect(() => {
    const unsub = subscribeKnowledgeSync(() => {
      void refreshKnowledgeRef.current();
      void refreshKnowledgeDocsRef.current(true);
    });
    const poll = window.setInterval(() => {
      void refreshKnowledgeRef.current();
      void refreshKnowledgeDocsRef.current(true);
    }, 12000);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, []);

  async function ingest() {
    const text = knowledgeText.trim();
    const title = knowledgeTitle.trim();
    if (!text || !title || ingesting) return;
    setIngesting(true);
    setError(null);
    const resp = await ingestText({ requestId: createUuid(), title, sourcePath: 'desktop', text });
    if (!resp.ok) setError(`${resp.code}: ${resp.message}`);
    else {
      setKnowledgeTitle('');
      setKnowledgeText('');
      await refreshKnowledge();
      await refreshKnowledgeDocs(true);
      broadcastKnowledgeSync({ type: 'knowledge-changed' });
    }
    setIngesting(false);
  }

  async function openDoc(docId: string) {
    const resp = await getKnowledgeDocument(docId);
    if (!resp.ok) return setError(`${resp.code}: ${resp.message}`);
    setEditingDocId(docId);
    setEditingTitle(resp.data?.document?.title || '');
    setEditingText(resp.data?.document?.text || '');
  }

  async function saveDoc() {
    if (!editingDocId || !editingText.trim()) return;
    setSavingDoc(true);
    const resp = await updateKnowledgeDocument(editingDocId, { title: editingTitle.trim() || null, text: editingText });
    if (!resp.ok) setError(`${resp.code}: ${resp.message}`);
    else {
      await refreshKnowledge();
      await refreshKnowledgeDocs(true);
      broadcastKnowledgeSync({ type: 'knowledge-changed' });
    }
    setSavingDoc(false);
  }

  async function removeDoc() {
    if (!editingDocId) return;
    const deletingId = editingDocId;
    setSavingDoc(true);
    const resp = await deleteKnowledgeDocument(deletingId);
    if (!resp.ok) setError(`${resp.code}: ${resp.message}`);
    else {
      setEditingDocId('');
      setEditingTitle('');
      setEditingText('');
      await refreshKnowledge();
      const docs = await refreshKnowledgeDocs(true);
      broadcastKnowledgeSync({ type: 'knowledge-changed' });
      const next = docs.find((d) => d.id !== deletingId) || docs[0];
      if (next) await openDoc(next.id);
    }
    setSavingDoc(false);
  }

  return {
    useLocalKnowledge,
    setUseLocalKnowledge,
    knowledgeTitle,
    setKnowledgeTitle,
    knowledgeText,
    setKnowledgeText,
    ingesting,
    knowledgeStats,
    knowledgeDocs,
    selectedDocIds,
    setSelectedDocIds,
    knowledgeLoading,
    editingDocId,
    editingTitle,
    setEditingTitle,
    editingText,
    setEditingText,
    savingDoc,
    error,
    setError,
    refreshKnowledge,
    refreshKnowledgeDocs,
    ingest,
    openDoc,
    saveDoc,
    removeDoc
  };
}
