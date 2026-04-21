import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { randomUUID } from 'crypto';
import crypto from 'node:crypto';
import type { ChatMessage, Conversation, Evidence, IngestTextRequest, IngestTextResponse } from '@ai-agent/shared';

const DEFAULT_SQLITE_PATH = './data/ai-agent.sqlite';

type CreateConversationRow = Conversation;

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

      const SQL = await initSqlJs({
        locateFile: (file: string) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
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

  async lexicalRetrieveEvidence(query: string, topK: number): Promise<Evidence[]> {
    const qTokens = this.tokenize(query);
    if (qTokens.length === 0) return [];

    const qSet = new Set(qTokens);

    // For MVP reliability: avoid relying solely on SQL LIKE prefilter.
    // We scan a bounded number of chunks and score by token overlap.
    const scanLimit = Math.max(200, topK * 500);
    const rows = this.queryAll<any>(
      `SELECT
        c.id AS chunk_id,
        c.document_id AS doc_id,
        c.chunk_index AS chunk_index,
        c.text_content AS text_content,
        d.source_path AS doc_source_path
      FROM document_chunks c
      JOIN documents d ON d.id = c.document_id
      LIMIT ?`,
      [scanLimit]
    );

    if (rows.length === 0) return [];

    const scored = rows.map((r) => {
      const chunkTokens = this.tokenize(r.text_content);
      let overlap = 0;
      for (const t of chunkTokens) {
        if (qSet.has(t)) overlap += 1;
      }

      const score = overlap / Math.max(1, chunkTokens.length);
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

  async getKnowledgeStats(): Promise<{ documents: number; chunks: number }> {
    const d = this.queryOne<{ c: number }>('SELECT COUNT(1) as c FROM documents', []);
    const c = this.queryOne<{ c: number }>('SELECT COUNT(1) as c FROM document_chunks', []);
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

  async createUser(username: string, password: string): Promise<{ id: string; username: string }> {
    const existed = this.queryOne<any>('SELECT id FROM users WHERE username = ?', [username]);
    if (existed) {
      throw new Error('USER_EXISTS');
    }
    const id = randomUUID();
    const createdAt = nowIso();
    const { hash, salt } = this.hashPassword(password);
    this.db.run(
      'INSERT INTO users (id, username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, username, hash, salt, createdAt]
    );
    this.saveToFile();
    return { id, username };
  }

  async verifyUser(username: string, password: string): Promise<{ id: string; username: string } | null> {
    const row = this.queryOne<any>(
      'SELECT id, username, password_hash, password_salt FROM users WHERE username = ?',
      [username]
    );
    if (!row) return null;
    const { hash } = this.hashPassword(password, String(row.password_salt));
    if (hash !== String(row.password_hash)) return null;
    return { id: String(row.id), username: String(row.username) };
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

  async getUserByToken(token: string): Promise<{ id: string; username: string } | null> {
    const row = this.queryOne<any>(
      `SELECT u.id AS id, u.username AS username, s.expires_at AS expires_at
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
    return { id: String(row.id), username: String(row.username) };
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

