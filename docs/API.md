# API 文档（当前实现）

Base URL（默认）：`http://localhost:3001`

统一响应 envelope：

- 成功：`{ ok: true, code: "SUCCESS", data: ... }`
- 失败：`{ ok: false, code, message, retryable, nextAction? }`

---

## 1. 健康检查

### `GET /health`

返回服务状态。

示例响应：

```json
{
  "ok": true,
  "status": "UP"
}
```

---

## 2. 会话与消息

### `GET /conversations?limit=20`

获取最近会话列表。

参数：
- `limit`（可选，默认 `20`）

### `GET /conversations/:conversationId/messages?limit=50`

获取某会话消息。

参数：
- `conversationId`（路径参数）
- `limit`（可选，默认 `50`）

### `POST /chat/send`

发送消息并生成回复。

请求体：

```json
{
  "requestId": "string",
  "conversationId": "string",
  "userMessage": "string",
  "options": {
    "language": "zh-CN",
    "useLocalKnowledge": true,
    "includeCitations": false,
    "maxReplyChars": 4000,
    "retrievalTopK": 3,
    "maxEvidenceChars": 2000
  }
}
```

说明：
- `useLocalKnowledge=true` 时启用 RAG（先检索本地 evidence，再注入 provider）。
- `includeCitations=true` 且启用 RAG 时，`reply.citations` 会返回结构化引用（基于检索 evidence 生成）。

---

## 3. 知识库

### `POST /knowledge/ingest-text`

把文本导入本地知识库并切块入库。

请求体：

```json
{
  "requestId": "string",
  "title": "doc title",
  "sourcePath": "desktop",
  "text": "plain text",
  "options": {
    "chunkSize": 800,
    "overlap": 100,
    "maxChunks": 1000
  }
}
```

成功响应 `data`：

```json
{
  "doc": {
    "docId": "string",
    "title": "doc title",
    "sourcePath": "desktop"
  },
  "stats": {
    "chars": 1234,
    "chunkSize": 800,
    "overlap": 100,
    "chunks": 4
  }
}
```

### `GET /knowledge/stats`

获取知识库统计。

成功响应 `data`：

```json
{
  "documents": 3,
  "chunks": 12
}
```

### `POST /knowledge/retrieve`

按查询词检索 evidence（调试用途）。

请求体：

```json
{
  "query": "knowledge retrieval",
  "topK": 5
}
```

成功响应 `data`：

```json
{
  "evidence": [
    {
      "id": "chunk-id",
      "source": {
        "docId": "doc-id",
        "path": "source-path"
      },
      "text": "chunk text",
      "score": 0.42,
      "metadata": {
        "chunkIndex": 0
      }
    }
  ]
}
```

