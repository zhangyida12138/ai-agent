# Document Ingestion Indexer References

## 1. SQLite Tables (recommended)

```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_hash TEXT,
  title TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
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
  embedding_ref TEXT,                 -- vector store key
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE INDEX IF NOT EXISTS idx_chunks_document
  ON document_chunks(document_id, chunk_index);
```

## 2. Ingestion/Index Lifecycle

1. Discover files
2. Parse text + metadata
3. Chunking
4. Embedding generation
5. Persist document/chunks
6. Update task progress

Each step should be idempotent by stable ids (`document.id`, `chunk.id`).

## 3. Error Codes

| Code | Retryable | Meaning |
|---|---:|---|
| `FILE_NOT_READABLE` | No | file missing or permission denied |
| `UNSUPPORTED_FORMAT` | No | parser not available for file type |
| `CHUNKING_FAILED` | No | chunk generation error |
| `EMBEDDING_FAILED` | Yes | embedding provider failure |
| `INDEX_WRITE_FAILED` | Yes | failed writing index/vector metadata |
| `TASK_CANCELLED` | No | ingestion cancelled by user |

