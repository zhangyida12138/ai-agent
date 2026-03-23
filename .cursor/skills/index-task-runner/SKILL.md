---
name: index-task-runner
description: Run and manage background indexing-related tasks with a durable state machine, concurrency control, progress events, and retry policies. Use when implementing reliable local-first document import/index/update/export pipelines.
---

# Index Task Runner

## When to Use
- 实现后台任务（导入/索引/导出/重建索引）与任务状态持久化。
- 需要可重试、可查看进度、可取消并发任务，且对失败具备清晰状态机。

## Input 契约
```json
{
  "requestId": "string",
  "task": {
    "type": "ingest|index|export|reindex",
    "taskId": "string",
    "params": { "any": "task-specific payload" }
  },
  "runner": {
    "concurrency": 2,
    "timeoutMs": 900000,
    "retry": { "maxAttempts": 3, "backoffMs": 1000 }
  }
}
```

## Output 契约
```json
{
  "ok": true,
  "code": "SUCCESS|null",
  "data": {
    "taskId": "string",
    "status": "QUEUED|RUNNING|SUCCEEDED|FAILED|CANCELLED",
    "progress": { "current": 0, "total": 0, "message": "string" }
  }
}
```

## Workflow
1. **任务落库**：在 SQLite 创建/更新任务记录（`taskId` 唯一）。
2. **状态机**：
   - `QUEUED -> RUNNING -> SUCCEEDED/FAILED/CANCELLED`
   - 失败区分：可重试失败 vs 不可重试失败
3. **并发与队列**：限制并发数；为相同资源（同 docId）避免竞争（可选）。
4. **事件/进度回传**：定期写入进度表或发出事件（供 UI 消费）。
5. **调用具体实现**：
   - `ingest/index/export` 的具体业务由对应 skills/module 完成（例如 ingestion indexer）。
6. **重试策略**：
   - 仅对 `retryable=true` 的失败重试
   - 重试时保持幂等（依赖稳定的 chunkId/docId/task version）
7. **终态记录**：成功/失败都要落库最终原因与统计信息。

## Failure 与 Fallback
- SQLite 不可用：`retryable=true`，建议暂停 runner 或提示重试。
- 任务执行超时：标记 `FAILED_TIMEOUT` 并允许重试。
- 单任务失败：不阻塞其它任务（除非资源冲突策略要求）。

## Non-goals
- 不负责生成 AI 文本（由 orchestrator 完成）。
- 不负责检索/向量索引细节（由对应 skills 完成）。

