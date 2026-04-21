---
name: knowledge-retriever
description: Retrieve top-k relevant local knowledge passages from the built index using query embeddings, re-ranking, and citation-ready evidence formatting. Use when implementing retrieval for local document Q&A and grounding.
---

# Knowledge Retriever

## When to Use
- 用户向本地知识库提问，需要先从索引里检索证据（passages/chunks）。
- 需要把检索结果转换成“可引用证据”的格式给下游生成模块使用。

## Input 契约
```json
{
  "conversationId": "string|null",
  "query": "string",
  "retrieval": {
    "topK": 5,
    "filters": { "docIds": ["optional"], "timeRange": ["optional"] },
    "includeScores": true,
    "dedupe": { "enabled": true, "by": "source|semantic" }
  },
  "requestContext": { "requestId": "string" }
}
```

## Output 契约
```json
{
  "ok": true,
  "code": "SUCCESS|null",
  "data": {
    "evidence": [
      {
        "id": "string",
        "source": { "type": "file|url|screenshot", "docId": "string", "path": "string" },
        "text": "string",
        "score": 0.0,
        "metadata": { "chunkId": "string", "language": "optional" }
      }
    ]
  }
}
```

索引未就绪：
```json
{
  "ok": false,
  "code": "INDEX_NOT_READY",
  "message": "local index is not ready; ingest documents first",
  "retryable": true,
  "nextAction": "ingest or wait"
}
```

## Workflow
1. **查询向量**：将 `query` 转换为 embedding（embedding provider 由 `ai-provider-router` 提供）。
2. **向量检索**：从索引中取候选 topK*（可留出 re-rank 的余量）。
3. **重排/去重**（可选）：
   - 去重：同源 chunk 合并或选择最高分
   - 重排：用轻量模型/启发式调整相关性
4. **证据格式化**：确保每条 evidence 都包含可追踪的 `source` 与 `id`，用于下游引用。
5. **输出返回**：返回 evidence 数组；无证据时也应返回 `ok=true` 且 evidence=[]（若你选择该策略）。

## Failure 与 Fallback
- embedding 失败：`retryable=true`，建议重试。
- 索引不存在：返回 `INDEX_NOT_FOUND`。
- 无证据：返回 `ok=true, evidence=[]`，下游可降级为纯对话。

## Non-goals
- 不负责最终回答生成（由 `ai-response-orchestrator` 完成）。
- 不负责写入索引（由 ingestion/indexer 完成）。

## 本项目已落地（2026-04）
- 已在 `chat.service.ts` 里实现“检索 + 重排 + 过滤”链路：
  - lexical 召回候选
  - embedding cosine rerank（通过 provider router）
  - score 阈值过滤与去重
- 已支持强制 RAG 关键策略：
  - 无证据时显式返回“未检索到相关资料”
  - 证据格式统一用于引用展示
- 可通过环境变量调参：
  - `RAG_SCORE_THRESHOLD`
  - `RAG_RERANK_WEIGHT`

