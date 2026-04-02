import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { randomUUID } from 'crypto';
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
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
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

  async upsertConversation(id: string, title?: string | null): Promise<CreateConversationRow> {
    const createdAt = nowIso();
    const updatedAt = nowIso();

    // sql.js doesn't support transaction wrappers like better-sqlite3 by default; we can still use manual control.
    const existing = this.queryOne<{ id: string }>('SELECT id FROM conversations WHERE id = ?', [id]);
    if (existing) {
      this.db.run('UPDATE conversations SET title = COALESCE(?, title), updated_at = ? WHERE id = ?', [
        title ?? null,
        updatedAt,
        id
      ]);
    } else {
      this.db.run(
        'INSERT INTO conversations (id, title, created_at, updated_at, metadata_json) VALUES (?, ?, ?, ?, ?)',
        [id, title ?? null, createdAt, updatedAt, null]
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

  async listConversations(limit: number): Promise<Conversation[]> {
    const rows = this.queryAll<any>(
      'SELECT id, title, created_at, updated_at, metadata_json FROM conversations ORDER BY updated_at DESC LIMIT ?',
      [limit]
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

  async ingestText(req: IngestTextRequest): Promise<IngestTextResponse> {
    const title = req.title ?? null;
    const sourcePath = req.sourcePath ?? null;
    const text = req.text;

    const { chunkSize, overlap, chunks } = this.chunkText(text, req.options);

    const docId = randomUUID();
    const createdAt = nowIso();

    this.db.run(
      'INSERT INTO documents (id, source_path, title, created_at, updated_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)',
      [docId, sourcePath, title, createdAt, createdAt, null]
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

