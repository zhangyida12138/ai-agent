# Chat History Store References

## 1. SQLite Schema (recommended)

```sql
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
  role TEXT NOT NULL,                  -- user|assistant|system
  content TEXT NOT NULL,
  citations_json TEXT,                 -- optional
  tags_json TEXT,                      -- optional
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON messages(conversation_id, created_at);
```

## 2. Query Contract

- List messages by conversation:
  - Input: `conversationId`, `limit`, `from`, `to`
  - Output: ordered by `created_at ASC` (or latest-first by caller config)
- Search by tags/time:
  - Input: `tagFilters[]`, `timeRange`
  - Output: matched message list + total count

## 3. Error Codes

| Code | Retryable | Meaning |
|---|---:|---|
| `DB_UNAVAILABLE` | Yes | SQLite unavailable/locked |
| `NOT_FOUND` | No | conversation/message not found |
| `INVALID_PARAMS` | No | payload missing required fields |
| `WRITE_CONFLICT` | Yes | concurrent write conflict |
| `SERIALIZATION_FAILED` | No | invalid metadata/citations JSON |

