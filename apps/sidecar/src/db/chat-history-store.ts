import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';
import { randomUUID } from 'crypto';
import crypto from 'node:crypto';
import type { ChatMessage, Conversation, Evidence, IngestTextRequest, IngestTextResponse } from '@ai-agent/shared';

const DEFAULT_SQLITE_PATH = './data/ai-agent.sqlite';
const nodeRequire = createRequire(__filename);

function resolveSqlJsDistDir(): string {
  try {
    // `sql.js` main entry points to `dist/sql-wasm.js`; derive dist dir from it.
    // This avoids package "exports" restrictions on deep subpaths in some setups.
    const sqlJsEntry = nodeRequire.resolve('sql.js');
    return path.dirname(sqlJsEntry);
  } catch {
    try {
      const pkgJson = nodeRequire.resolve('sql.js/package.json');
      return path.join(path.dirname(pkgJson), 'dist');
    } catch {
      // Fallback for unusual runtimes; keeps previous behavior as last resort.
      return path.join(process.cwd(), 'node_modules', 'sql.js', 'dist');
    }
  }
}

type CreateConversationRow = Conversation;
type ConversationExportBundle = {
  version: 1;
  exportedAt: string;
  conversations: Array<{
    id: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
    messages: ChatMessage[];
  }>;
};

function nowIso() {
  return new Date().toISOString();
}

export class ChatHistoryStore {
  private static singleton: { absPath: string; promise: Promise<ChatHistoryStore> } | null = null;
  private SQL: any;
  private db: any;
  private sqlitePath: string;

  private constructor(SQL: any, db: any, sqlitePath: string) {
    this.SQL = SQL;
    this.db = db;
    this.sqlitePath = sqlitePath;
  }

  static async create(sqlitePath?: string) {
    const resolved = sqlitePath ?? process.env.SQLITE_PATH ?? DEFAULT_SQLITE_PATH;
    const absPath = path.isAbsolute(resolved) ? resolved : path.join(process.cwd(), resolved);

    if (ChatHistoryStore.singleton?.absPath === absPath) return ChatHistoryStore.singleton.promise;

    const promise = (async () => {
      const dir = path.dirname(absPath);
      fs.mkdirSync(dir, { recursive: true });

      const sqlJsDistDir = resolveSqlJsDistDir();
      const SQL = await initSqlJs({
        locateFile: (file: string) => path.join(sqlJsDistDir, file)
      });

      const exists = fs.existsSync(absPath);
      const bytes = exists ? fs.readFileSync(absPath) : null;
      const db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();

      const store = new ChatHistoryStore(SQL, db, absPath);
      store.ensureSchema();
      if (!exists) store.saveToFile();
      return store;
    })();

    ChatHistoryStore.singleton = { absPath, promise };
    return promise;
  }

  private ensureSchema() {
    // sql.js shares SQLite-compatible DDL.
    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        citations_json TEXT,
        tags_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conv_created
        ON messages(conversation_id, created_at);
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        theme TEXT,
        display_name TEXT,
        age INTEGER,
        gender TEXT,
        occupation TEXT,
        needs TEXT,
        avatar_data TEXT,
        custom_fields_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_user_sessions_user
        ON user_sessions(user_id);
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        source_path TEXT,
        title TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text_content TEXT NOT NULL,
        token_count INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      );

      CREATE INDEX IF NOT EXISTS idx_chunks_document
        ON document_chunks(document_id, chunk_index);
    `);

    this.ensureColumn('conversations', 'user_id', 'ALTER TABLE conversations ADD COLUMN user_id TEXT');
    this.ensureColumn('documents', 'user_id', 'ALTER TABLE documents ADD COLUMN user_id TEXT');
    this.ensureColumn('users', 'theme', 'ALTER TABLE users ADD COLUMN theme TEXT');
    this.ensureColumn('users', 'display_name', 'ALTER TABLE users ADD COLUMN display_name TEXT');
    this.ensureColumn('users', 'age', 'ALTER TABLE users ADD COLUMN age INTEGER');
    this.ensureColumn('users', 'gender', 'ALTER TABLE users ADD COLUMN gender TEXT');
    this.ensureColumn('users', 'occupation', 'ALTER TABLE users ADD COLUMN occupation TEXT');
    this.ensureColumn('users', 'needs', 'ALTER TABLE users ADD COLUMN needs TEXT');
    this.ensureColumn('users', 'avatar_data', 'ALTER TABLE users ADD COLUMN avatar_data TEXT');
    this.ensureColumn('users', 'custom_fields_json', 'ALTER TABLE users ADD COLUMN custom_fields_json TEXT');
  }

  private ensureColumn(tableName: string, columnName: string, alterSql: string) {
    const cols = this.queryAll<any>(`PRAGMA table_info(${tableName})`, []);
    const exists = cols.some((c) => String(c.name) === columnName);
    if (!exists) {
      this.db.run(alterSql);
    }
  }

  private hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const actualSalt = salt ?? crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, actualSalt, 64).toString('hex');
    return { hash, salt: actualSalt };
  }

  private saveToFile() {
    const data = this.db.export();
    fs.writeFileSync(this.sqlitePath, Buffer.from(data));
  }

  private tokenize(text: string): string[] {
    // Tokenization for MVP retrieval:
    // - Latin/digits tokens: `[a-z0-9_]+`
    // - CJK tokens: generate overlapping bigrams from contiguous CJK ranges.
    // Note: We intentionally avoid `\p{L}` style unicode property escapes because
    // in some Node builds it may not match Han characters as expected.
    const normalized = text.toLowerCase();
    const tokens: string[] = [];

    // Latin-ish tokens
    for (const t of normalized.match(/[a-z0-9_]+/g) ?? []) {
      if (t.length > 1) tokens.push(t);
    }

    // CJK bigrams
    const cjkBlocks = normalized.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]+/g) ?? [];
    for (const block of cjkBlocks) {
      if (block.length < 2) continue;
      for (let i = 0; i < block.length - 1; i++) {
        const token = block.slice(i, i + 2);
        if (token.trim().length > 0) tokens.push(token);
      }
    }

    return tokens;
  }

  private chunkText(text: string, options?: IngestTextRequest['options']) {
    const chunkSize = options?.chunkSize && options.chunkSize > 0 ? Math.floor(options.chunkSize) : 800;
    const overlap = options?.overlap && options.overlap >= 0 ? Math.floor(options.overlap) : 100;
    const step = Math.max(1, chunkSize - overlap);
    const maxChunks = options?.maxChunks && options.maxChunks > 0 ? Math.floor(options.maxChunks) : undefined;

    const chunks: Array<{ chunkIndex: number; text: string }> = [];
    let i = 0;
    let chunkIndex = 0;
    while (i < text.length) {
      if (maxChunks !== undefined && chunkIndex >= maxChunks) break;
      const end = Math.min(text.length, i + chunkSize);
      const part = text.slice(i, end);
      if (part.trim().length > 0) {
        chunks.push({ chunkIndex, text: part });
        chunkIndex += 1;
      }
      i += step;
      if (step === 0) break;
    }

    return { chunkSize, overlap, chunks };
  }

  async upsertConversation(id: string, title?: string | null, userId?: string | null): Promise<CreateConversationRow> {
    const createdAt = nowIso();
    const updatedAt = nowIso();

    // sql.js doesn't support transaction wrappers like better-sqlite3 by default; we can still use manual control.
    const existing = this.queryOne<{ id: string }>('SELECT id FROM conversations WHERE id = ?', [id]);
    if (existing) {
      this.db.run('UPDATE conversations SET title = COALESCE(?, title), user_id = COALESCE(?, user_id), updated_at = ? WHERE id = ?', [
        title ?? null,
        userId ?? null,
        updatedAt,
        id
      ]);
    } else {
      this.db.run(
        'INSERT INTO conversations (id, user_id, title, created_at, updated_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)',
        [id, userId ?? null, title ?? null, createdAt, updatedAt, null]
      );
    }

    this.saveToFile();

    const row = this.queryOne<any>(
      'SELECT id, title, created_at, updated_at, metadata_json FROM conversations WHERE id = ?',
      [id]
    );
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async listConversations(limit: number, userId: string): Promise<Conversation[]> {
    const rows = this.queryAll<any>(
      'SELECT id, title, created_at, updated_at, metadata_json FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?',
      [userId, limit]
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  async appendMessage(message: ChatMessage): Promise<void> {
    const citationsJson = message.citations ? JSON.stringify(message.citations) : null;
    const tagsJson = message.tags ? JSON.stringify(message.tags) : null;

    this.db.run(
      'INSERT INTO messages (id, conversation_id, role, content, citations_json, tags_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        message.id,
        message.conversationId,
        message.role,
        message.content,
        citationsJson,
        tagsJson,
        message.createdAt
      ]
    );

    this.db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [message.createdAt, message.conversationId]);
    this.saveToFile();
  }

  async listMessages(conversationId: string, limit: number): Promise<{ messages: ChatMessage[]; total: number }> {
    const totalRow = this.queryOne<{ c: number }>(
      'SELECT COUNT(1) as c FROM messages WHERE conversation_id = ?',
      [conversationId]
    );
    const total = totalRow?.c ?? 0;

    const rows = this.queryAll<any>(
      'SELECT id, conversation_id, role, content, citations_json, tags_json, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?',
      [conversationId, limit]
    );

    const messages: ChatMessage[] = rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role,
      content: r.content,
      citations: r.citations_json ? (JSON.parse(r.citations_json) as ChatMessage['citations']) : undefined,
      tags: r.tags_json ? (JSON.parse(r.tags_json) as string[]) : undefined,
      createdAt: r.created_at
    }));

    return { messages, total };
  }

  async conversationBelongsToUser(conversationId: string, userId: string): Promise<boolean> {
    const row = this.queryOne<any>('SELECT id FROM conversations WHERE id = ? AND user_id = ?', [conversationId, userId]);
    return Boolean(row?.id);
  }

  async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    const row = this.queryOne<any>('SELECT id FROM conversations WHERE id = ? AND user_id = ?', [conversationId, userId]);
    if (!row) return false;
    this.db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
    this.db.run('DELETE FROM conversations WHERE id = ? AND user_id = ?', [conversationId, userId]);
    this.saveToFile();
    return true;
  }

  async renameConversation(conversationId: string, userId: string, title: string): Promise<boolean> {
    const row = this.queryOne<any>('SELECT id FROM conversations WHERE id = ? AND user_id = ?', [conversationId, userId]);
    if (!row) return false;
    this.db.run('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?', [
      title,
      nowIso(),
      conversationId,
      userId
    ]);
    this.saveToFile();
    return true;
  }

  async setConversationTitleIfEmpty(conversationId: string, userId: string, title: string): Promise<boolean> {
    const normalized = String(title || '').trim();
    if (!normalized) return false;
    const row = this.queryOne<any>('SELECT id, title FROM conversations WHERE id = ? AND user_id = ?', [conversationId, userId]);
    if (!row) return false;
    if (row.title != null && String(row.title).trim().length > 0) return false;
    this.db.run('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?', [
      normalized,
      nowIso(),
      conversationId,
      userId
    ]);
    this.saveToFile();
    return true;
  }

  async exportConversations(userId: string, conversationIds?: string[]): Promise<ConversationExportBundle> {
    const selected = Array.isArray(conversationIds)
      ? conversationIds.map((x) => String(x).trim()).filter(Boolean)
      : [];
    const hasFilter = selected.length > 0;
    const placeholders = hasFilter ? selected.map(() => '?').join(', ') : '';
    const sql = `SELECT id, title, created_at, updated_at
      FROM conversations
      WHERE user_id = ?
      ${hasFilter ? `AND id IN (${placeholders})` : ''}
      ORDER BY updated_at DESC`;
    const rows = this.queryAll<any>(sql, [userId, ...selected]);
    const conversations = rows.map((r) => {
      const msgRows = this.queryAll<any>(
        'SELECT id, conversation_id, role, content, citations_json, tags_json, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
        [String(r.id)]
      );
      const messages: ChatMessage[] = msgRows.map((m) => ({
        id: String(m.id),
        conversationId: String(m.conversation_id),
        role: m.role as ChatMessage['role'],
        content: String(m.content),
        citations: m.citations_json ? (JSON.parse(m.citations_json) as ChatMessage['citations']) : undefined,
        tags: m.tags_json ? (JSON.parse(m.tags_json) as string[]) : undefined,
        createdAt: String(m.created_at)
      }));
      return {
        id: String(r.id),
        title: r.title == null ? null : String(r.title),
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
        messages
      };
    });
    return { version: 1, exportedAt: nowIso(), conversations };
  }

  async importConversations(
    userId: string,
    payload: ConversationExportBundle
  ): Promise<{ importedConversations: number; importedMessages: number }> {
    if (!payload || payload.version !== 1 || !Array.isArray(payload.conversations)) {
      throw new Error('INVALID_IMPORT_PAYLOAD');
    }
    let importedConversations = 0;
    let importedMessages = 0;
    for (const conv of payload.conversations) {
      if (!conv || !Array.isArray(conv.messages)) continue;
      const newConversationId = randomUUID();
      const title = conv.title == null ? null : String(conv.title);
      const baseCreatedAt = typeof conv.createdAt === 'string' && conv.createdAt ? conv.createdAt : nowIso();
      const baseUpdatedAt = typeof conv.updatedAt === 'string' && conv.updatedAt ? conv.updatedAt : baseCreatedAt;
      this.db.run(
        'INSERT INTO conversations (id, user_id, title, created_at, updated_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)',
        [newConversationId, userId, title, baseCreatedAt, baseUpdatedAt, null]
      );
      importedConversations += 1;
      for (const m of conv.messages) {
        const role = String((m as any)?.role ?? '').trim();
        const content = String((m as any)?.content ?? '');
        if ((role !== 'user' && role !== 'assistant' && role !== 'system') || !content) continue;
        const msgId = randomUUID();
        const createdAt = typeof (m as any)?.createdAt === 'string' && (m as any).createdAt ? (m as any).createdAt : nowIso();
        const citations = Array.isArray((m as any)?.citations) ? (m as any).citations : undefined;
        const tags = Array.isArray((m as any)?.tags) ? (m as any).tags : undefined;
        this.db.run(
          'INSERT INTO messages (id, conversation_id, role, content, citations_json, tags_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [msgId, newConversationId, role, content, citations ? JSON.stringify(citations) : null, tags ? JSON.stringify(tags) : null, createdAt]
        );
        importedMessages += 1;
      }
    }
    this.saveToFile();
    return { importedConversations, importedMessages };
  }

  async ingestText(req: IngestTextRequest, userId?: string | null): Promise<IngestTextResponse> {
    const title = req.title ?? null;
    const sourcePath = req.sourcePath ?? null;
    const text = req.text;

    const { chunkSize, overlap, chunks } = this.chunkText(text, req.options);

    const docId = randomUUID();
    const createdAt = nowIso();

    this.db.run(
      'INSERT INTO documents (id, user_id, source_path, title, created_at, updated_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [docId, userId ?? null, sourcePath, title, createdAt, createdAt, null]
    );

    for (const c of chunks) {
      const chunkId = randomUUID();
      const tokenCount = this.tokenize(c.text).length;
      this.db.run(
        'INSERT INTO document_chunks (id, document_id, chunk_index, text_content, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [chunkId, docId, c.chunkIndex, c.text, tokenCount, createdAt]
      );
    }

    this.saveToFile();

    return {
      doc: { docId, title, sourcePath },
      stats: {
        chars: text.length,
        chunkSize,
        overlap,
        chunks: chunks.length
      }
    };
  }

  async lexicalRetrieveEvidence(query: string, topK: number, docIds?: string[]): Promise<Evidence[]> {
    const qTokens = this.tokenize(query);
    if (qTokens.length === 0) return [];

    const qSet = new Set(qTokens);

    // For MVP reliability: avoid relying solely on SQL LIKE prefilter.
    // We scan a bounded number of chunks and score by token overlap.
    const scanLimit = Math.max(200, topK * 500);
    const selectedDocIds = (docIds || []).map((x) => String(x).trim()).filter(Boolean);
    const hasDocFilter = selectedDocIds.length > 0;
    const placeholders = hasDocFilter ? selectedDocIds.map(() => '?').join(', ') : '';
    const sql = `SELECT
        c.id AS chunk_id,
        c.document_id AS doc_id,
        c.chunk_index AS chunk_index,
        c.text_content AS text_content,
        d.source_path AS doc_source_path
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      ${hasDocFilter ? `WHERE c.document_id IN (${placeholders})` : ''}
      LIMIT ?`;
    const rows = this.queryAll<any>(sql, [...selectedDocIds, scanLimit]);

    if (rows.length === 0) return [];

    const scored = rows.map((r) => {
      const rawText = String(r.text_content);
      const chunkTokens = this.tokenize(rawText);
      let overlap = 0;
      for (const t of chunkTokens) {
        if (qSet.has(t)) overlap += 1;
      }
      const coverageByChunk = overlap / Math.max(1, chunkTokens.length);
      const coverageByQuery = overlap / Math.max(1, qSet.size);
      const normalizedChunk = rawText.toLowerCase().replace(/\s+/g, '');
      const normalizedQuery = query.toLowerCase().replace(/\s+/g, '');
      const containsBoost = normalizedQuery && normalizedChunk.includes(normalizedQuery) ? 0.2 : 0;
      // Prefer recall for short queries ("名字叫什么"), avoid over-penalizing long chunks.
      const score = Math.max(coverageByChunk, coverageByQuery) + containsBoost;
      return {
        evidence: {
          id: String(r.chunk_id),
          source: { docId: String(r.doc_id), path: String(r.doc_source_path ?? '') },
          text: String(r.text_content),
          score,
          metadata: { chunkIndex: Number(r.chunk_index) }
        } as Evidence,
        score
      };
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return 0;
    });

    return scored.slice(0, Math.max(1, topK)).map((s) => s.evidence);
  }

  async getKnowledgeStats(userId: string): Promise<{ documents: number; chunks: number }> {
    const d = this.queryOne<{ c: number }>('SELECT COUNT(1) as c FROM documents WHERE user_id = ?', [userId]);
    const c = this.queryOne<{ c: number }>(
      `SELECT COUNT(1) as c
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE d.user_id = ?`,
      [userId]
    );
    return { documents: d?.c ?? 0, chunks: c?.c ?? 0 };
  }

  async listDocuments(userId: string): Promise<Array<{ id: string; title: string | null; sourcePath: string | null; createdAt: string; updatedAt: string; chunkCount: number }>> {
    const rows = this.queryAll<any>(
      `SELECT d.id, d.title, d.source_path, d.created_at, d.updated_at, COUNT(c.id) AS chunk_count
       FROM documents d
       LEFT JOIN document_chunks c ON c.document_id = d.id
       WHERE d.user_id = ?
       GROUP BY d.id, d.title, d.source_path, d.created_at, d.updated_at
       ORDER BY d.updated_at DESC`,
      [userId]
    );
    return rows.map((r) => ({
      id: String(r.id),
      title: r.title ? String(r.title) : null,
      sourcePath: r.source_path ? String(r.source_path) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      chunkCount: Number(r.chunk_count ?? 0)
    }));
  }

  async getDocumentById(userId: string, docId: string): Promise<{ id: string; title: string | null; sourcePath: string | null; text: string } | null> {
    const doc = this.queryOne<any>('SELECT id, title, source_path FROM documents WHERE id = ? AND user_id = ?', [docId, userId]);
    if (!doc) return null;
    const chunks = this.queryAll<any>(
      'SELECT text_content FROM document_chunks WHERE document_id = ? ORDER BY chunk_index ASC',
      [docId]
    );
    const text = chunks.map((c) => String(c.text_content)).join('\n');
    return {
      id: String(doc.id),
      title: doc.title ? String(doc.title) : null,
      sourcePath: doc.source_path ? String(doc.source_path) : null,
      text
    };
  }

  async updateDocument(userId: string, docId: string, title: string | null, text: string): Promise<{ id: string }> {
    const existed = this.queryOne<any>('SELECT id FROM documents WHERE id = ? AND user_id = ?', [docId, userId]);
    if (!existed) {
      throw new Error('DOC_NOT_FOUND');
    }
    const now = nowIso();
    const chunks = this.chunkText(text, undefined).chunks;
    this.db.run('DELETE FROM document_chunks WHERE document_id = ?', [docId]);
    for (const c of chunks) {
      this.db.run(
        'INSERT INTO document_chunks (id, document_id, chunk_index, text_content, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), docId, c.chunkIndex, c.text, this.tokenize(c.text).length, now]
      );
    }
    this.db.run('UPDATE documents SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?', [title, now, docId, userId]);
    this.saveToFile();
    return { id: docId };
  }

  async deleteDocument(userId: string, docId: string): Promise<boolean> {
    const existed = this.queryOne<any>('SELECT id FROM documents WHERE id = ? AND user_id = ?', [docId, userId]);
    if (!existed) return false;
    this.db.run('DELETE FROM document_chunks WHERE document_id = ?', [docId]);
    this.db.run('DELETE FROM documents WHERE id = ? AND user_id = ?', [docId, userId]);
    this.saveToFile();
    return true;
  }

  async createUser(username: string, password: string): Promise<{ id: string; username: string; theme: 'dark' | 'light' }> {
    const existed = this.queryOne<any>('SELECT id FROM users WHERE username = ?', [username]);
    if (existed) {
      throw new Error('USER_EXISTS');
    }
    const id = randomUUID();
    const createdAt = nowIso();
    const { hash, salt } = this.hashPassword(password);
    this.db.run(
      'INSERT INTO users (id, username, password_hash, password_salt, theme, display_name, age, gender, occupation, needs, avatar_data, custom_fields_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, username, hash, salt, 'dark', null, null, null, null, null, null, null, createdAt]
    );
    this.saveToFile();
    return { id, username, theme: 'dark' };
  }

  async verifyUser(
    username: string,
    password: string
  ): Promise<{
    id: string;
    username: string;
    theme: 'dark' | 'light';
    displayName: string | null;
    age: number | null;
    gender: string | null;
    occupation: string | null;
    needs: string | null;
    avatarData: string | null;
    customFields: Array<{ key: string; value: string }>;
  } | null> {
    const row = this.queryOne<any>(
      'SELECT id, username, password_hash, password_salt, theme, display_name, age, gender, occupation, needs, avatar_data, custom_fields_json FROM users WHERE username = ?',
      [username]
    );
    if (!row) return null;
    const { hash } = this.hashPassword(password, String(row.password_salt));
    if (hash !== String(row.password_hash)) return null;
    const theme = String(row.theme || '').trim() === 'light' ? 'light' : 'dark';
    return {
      id: String(row.id),
      username: String(row.username),
      theme,
      displayName: row.display_name ? String(row.display_name) : null,
      age: row.age == null ? null : Number(row.age),
      gender: row.gender ? String(row.gender) : null,
      occupation: row.occupation ? String(row.occupation) : null,
      needs: row.needs ? String(row.needs) : null,
      avatarData: row.avatar_data ? String(row.avatar_data) : null,
      customFields: row.custom_fields_json ? (JSON.parse(String(row.custom_fields_json)) as Array<{ key: string; value: string }>) : []
    };
  }

  async createSession(userId: string): Promise<{ token: string; expiresAt: string }> {
    const token = randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    this.db.run(
      'INSERT INTO user_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      [token, userId, createdAt, expiresAt]
    );
    this.saveToFile();
    return { token, expiresAt };
  }

  async getUserByToken(token: string): Promise<{
    id: string;
    username: string;
    theme: 'dark' | 'light';
    displayName: string | null;
    age: number | null;
    gender: string | null;
    occupation: string | null;
    needs: string | null;
    avatarData: string | null;
    customFields: Array<{ key: string; value: string }>;
  } | null> {
    const row = this.queryOne<any>(
      `SELECT u.id AS id, u.username AS username, u.theme AS theme, u.display_name AS display_name, u.age AS age, u.gender AS gender, u.occupation AS occupation, u.needs AS needs, u.avatar_data AS avatar_data, u.custom_fields_json AS custom_fields_json, s.expires_at AS expires_at
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ?`,
      [token]
    );
    if (!row) return null;
    if (new Date(String(row.expires_at)).getTime() <= Date.now()) {
      this.db.run('DELETE FROM user_sessions WHERE token = ?', [token]);
      this.saveToFile();
      return null;
    }
    const theme = String(row.theme || '').trim() === 'light' ? 'light' : 'dark';
    return {
      id: String(row.id),
      username: String(row.username),
      theme,
      displayName: row.display_name ? String(row.display_name) : null,
      age: row.age == null ? null : Number(row.age),
      gender: row.gender ? String(row.gender) : null,
      occupation: row.occupation ? String(row.occupation) : null,
      needs: row.needs ? String(row.needs) : null,
      avatarData: row.avatar_data ? String(row.avatar_data) : null,
      customFields: row.custom_fields_json ? (JSON.parse(String(row.custom_fields_json)) as Array<{ key: string; value: string }>) : []
    };
  }

  async updateUserTheme(userId: string, theme: 'dark' | 'light'): Promise<void> {
    this.db.run('UPDATE users SET theme = ? WHERE id = ?', [theme, userId]);
    this.saveToFile();
  }

  async updateUserProfile(
    userId: string,
    payload: {
      displayName?: string | null;
      age?: number | null;
      gender?: string | null;
      occupation?: string | null;
      needs?: string | null;
      avatarData?: string | null;
      customFields?: Array<{ key: string; value: string }>;
    }
  ): Promise<void> {
    this.db.run(
      'UPDATE users SET display_name = ?, age = ?, gender = ?, occupation = ?, needs = ?, avatar_data = ?, custom_fields_json = ? WHERE id = ?',
      [
        payload.displayName ?? null,
        payload.age ?? null,
        payload.gender ?? null,
        payload.occupation ?? null,
        payload.needs ?? null,
        payload.avatarData ?? null,
        payload.customFields ? JSON.stringify(payload.customFields) : null,
        userId
      ]
    );
    this.saveToFile();
  }

  async getUserById(userId: string): Promise<{
    id: string;
    username: string;
    theme: 'dark' | 'light';
    displayName: string | null;
    age: number | null;
    gender: string | null;
    occupation: string | null;
    needs: string | null;
    avatarData: string | null;
    customFields: Array<{ key: string; value: string }>;
  } | null> {
    const row = this.queryOne<any>(
      'SELECT id, username, theme, display_name, age, gender, occupation, needs, avatar_data, custom_fields_json FROM users WHERE id = ?',
      [userId]
    );
    if (!row) return null;
    const theme = String(row.theme || '').trim() === 'light' ? 'light' : 'dark';
    return {
      id: String(row.id),
      username: String(row.username),
      theme,
      displayName: row.display_name ? String(row.display_name) : null,
      age: row.age == null ? null : Number(row.age),
      gender: row.gender ? String(row.gender) : null,
      occupation: row.occupation ? String(row.occupation) : null,
      needs: row.needs ? String(row.needs) : null,
      avatarData: row.avatar_data ? String(row.avatar_data) : null,
      customFields: row.custom_fields_json ? (JSON.parse(String(row.custom_fields_json)) as Array<{ key: string; value: string }>) : []
    };
  }

  private queryOne<T>(sql: string, params: any[]): T | null {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    if (!stmt.step()) {
      stmt.free();
      return null;
    }
    const row = stmt.getAsObject() as T;
    stmt.free();
    return row;
  }

  private queryAll<T>(sql: string, params: any[]): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const out: T[] = [];
    while (stmt.step()) {
      out.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return out;
  }
}

