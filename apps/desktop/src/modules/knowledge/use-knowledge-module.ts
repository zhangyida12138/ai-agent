import { useState } from 'react';
import { deleteKnowledgeDocument, getKnowledgeDocument, getKnowledgeStats, ingestText, listKnowledgeDocuments, updateKnowledgeDocument } from '../../api';

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

  async function refreshKnowledgeDocs() {
    setKnowledgeLoading(true);
    const resp = await listKnowledgeDocuments();
    if (!resp.ok) {
      setKnowledgeLoading(false);
      return setError(`${resp.code}: ${resp.message}`);
    }
    setKnowledgeDocs(resp.data?.documents || []);
    setKnowledgeLoading(false);
  }

  async function ingest() {
    const text = knowledgeText.trim();
    const title = knowledgeTitle.trim();
    if (!text || !title || ingesting) return;
    setIngesting(true);
    setError(null);
    const resp = await ingestText({ requestId: crypto.randomUUID(), title, sourcePath: 'desktop', text });
    if (!resp.ok) setError(`${resp.code}: ${resp.message}`);
    else {
      setKnowledgeText('');
      await refreshKnowledge();
      await refreshKnowledgeDocs();
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
      await refreshKnowledgeDocs();
    }
    setSavingDoc(false);
  }

  async function removeDoc() {
    if (!editingDocId) return;
    setSavingDoc(true);
    const resp = await deleteKnowledgeDocument(editingDocId);
    if (!resp.ok) setError(`${resp.code}: ${resp.message}`);
    else {
      setEditingDocId('');
      setEditingTitle('');
      setEditingText('');
      await refreshKnowledge();
      await refreshKnowledgeDocs();
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
