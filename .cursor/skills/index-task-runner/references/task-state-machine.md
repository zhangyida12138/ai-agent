# Index Task Runner References

## 1. Task State Machine

```text
QUEUED -> RUNNING -> SUCCEEDED
                 -> FAILED
                 -> CANCELLED
FAILED (retryable) -> QUEUED
```

State rules:
- Only one terminal state: `SUCCEEDED|FAILED|CANCELLED`.
- Retry only allowed from `FAILED` when `retryable=true`.

## 2. SQLite Schema (recommended)

```sql
CREATE TABLE IF NOT EXISTS index_tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                  -- ingest|index|export|reindex
  status TEXT NOT NULL,                -- QUEUED|RUNNING|SUCCEEDED|FAILED|CANCELLED
  progress_current INTEGER DEFAULT 0,
  progress_total INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  retryable INTEGER DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  payload_json TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_index_tasks_status
  ON index_tasks(status, updated_at);
```

## 3. Progress Event Contract

```json
{
  "taskId": "string",
  "status": "RUNNING",
  "progress": { "current": 10, "total": 100, "message": "chunking" },
  "updatedAt": "ISO-8601"
}
```

## 4. Error Codes

| Code | Retryable | Meaning |
|---|---:|---|
| `TASK_NOT_FOUND` | No | task id does not exist |
| `TASK_TIMEOUT` | Yes | task exceeded timeout |
| `TASK_EXECUTION_FAILED` | Yes | worker execution failed |
| `TASK_CANCELLED` | No | task cancelled by user |
| `DB_UNAVAILABLE` | Yes | task storage unavailable |

