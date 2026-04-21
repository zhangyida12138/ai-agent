---
name: chat-history-store
description: Persist and retrieve local chat sessions and messages using SQLite with stable conversation IDs and queryable metadata. Use when storing chat context for a local-first desktop AI assistant.
---

# Chat History Store

## When to Use
- 实现或调整本地聊天记录的写入/读取能力（会话创建、消息追加、按条件查询）。
- 需要在“对话链路”中为后续检索/总结提供持久化上下文。

## Input 契约
```json
{
  "conversationId": "string",
  "operation": "create|append|list|get|search|export",
  "messages": [
    {
      "messageId": "string",
      "role": "user|assistant|system",
      "content": "string",
      "createdAt": "ISO-8601 string",
      "tags": ["optional", "labels"]
    }
  ],
  "query": {
    "limit": 50,
    "timeRange": { "from": "ISO|null", "to": "ISO|null" },
    "tagFilters": ["optional"],
    "includeCitations": true
  },
  "requestContext": { "requestId": "string" }
}
```

## Output 契约
写入/读出都使用统一结构（示例）：

```json
{
  "ok": true,
  "code": "SUCCESS|null",
  "data": { "conversation": {}, "messages": [], "total": 0 }
}
```

失败：
```json
{
  "ok": false,
  "code": "<error-code>",
  "message": "human-readable",
  "retryable": true,
  "nextAction": "what to do"
}
```

## Workflow
1. **定义会话与消息模型**：会话粒度（conversation），消息粒度（message），保存最小必要字段。
2. **SQLite schema 与迁移**：
   - 使用稳定主键（例如 `conversationId`、`messageId`）。
   - 为检索字段（`conversationId`、`createdAt`、`tags`、必要的 `sourceDocId`）创建索引。
3. **实现写入路径**：
   - `create`：当 `conversationId` 不存在时创建（或由 orchestrator 决定）。
   - `append`：追加消息并返回成功与写入计数。
4. **实现读取路径**：
   - `get`：按会话 ID 取指定消息范围。
   - `search`：按时间/标签过滤取候选上下文。
5. **导出能力**（可选但推荐）：
   - 支持导出 JSON/Markdown（由上层指定格式）。
6. **一致性策略**：
   - SQLite 写入失败返回可重试错误；
   - 会话不存在按约定：创建新会话或返回 `NOT_FOUND`（在失败策略里写清楚）。

## Failure 与 Fallback
- SQLite 连接失败：`DB_UNAVAILABLE`（`retryable=true`）。
- 会话不存在：`NOT_FOUND`（`retryable=false`）。
- 输入不合法：`INVALID_PARAMS`（`retryable=false`）。

## Non-goals
- 不生成回复文本（由 `ai-response-orchestrator` / `markdown-summarizer` 完成）。
- 不做 embedding/index（由索引相关 skills 完成）。

## 本项目已落地（2026-04）
- 已在 `apps/sidecar/src/db/chat-history-store.ts` 落地 SQLite 本地存储：
  - 会话/消息 CRUD
  - 用户与登录会话（`users` / `user_sessions`）
  - 知识库文档与分块存储（`documents` / `document_chunks`）
- 已实现多用户数据隔离：
  - `conversations.user_id`
  - `documents.user_id`
- 已支持：
  - 会话重命名、删除
  - 会话归属校验
  - 文档列表/详情/更新/删除

