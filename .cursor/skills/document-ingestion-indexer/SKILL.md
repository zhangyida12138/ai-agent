---
name: document-ingestion-indexer
description: Ingest local documents and build searchable indexes (chunking, metadata extraction, embeddings, and index-task persistence). Use when implementing document import and indexing for the local-first knowledge base.
---

# Document Ingestion Indexer

## When to Use
- 实现“导入文档/文件夹 -> 入库 -> 索引”的 pipeline。
- 需要支持索引进度、可重试失败、部分成功（尽量不让一个文件失败导致全局失败）。

## Input 契约
```json
{
  "taskId": "string",
  "source": {
    "paths": ["file-or-dir-paths"],
    "includeGlobs": ["optional"],
    "excludeGlobs": ["optional"]
  },
  "strategy": {
    "chunking": { "mode": "fixed|semantic", "chunkSize": 800, "overlap": 100 },
    "metadata": { "extractTitle": true, "detectLanguage": true },
    "ocr": { "enabled": false }
  },
  "indexing": {
    "embedding": { "modelId": "optional", "providerKind": "optional" },
    "topK": 10
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
    "taskId": "string",
    "summary": {
      "documents": 0,
      "chunks": 0,
      "skipped": 0,
      "failedChunks": 0
    }
  }
}
```

失败：
```json
{
  "ok": false,
  "code": "<error-code>",
  "message": "human-readable",
  "retryable": true,
  "nextAction": "what to do",
  "partial": true
}
```

## Workflow
1. **任务状态写入**：将 `taskId` 对应的状态置为 `RUNNING`（由 index-task-runner 统一也可，这里给出契约）。
2. **文件遍历与过滤**：根据 include/exclude globs 生成待处理文件列表。
3. **内容解析**（每种文件类型单独实现/抽象）：
   - 文本抽取、元数据提取
   - 图像/扫描件：在 `ocr.enabled=true` 时触发截图/ocr 提取流程
4. **分块**：按 chunking 策略切分并为每个 chunk 生成稳定的 chunkId（用于幂等更新）。
5. **embedding 生成**：调用 embedding 能力（由 `ai-provider-router` 提供）。
6. **写入索引与元数据**：
   - 写 SQLite：文档元数据、chunk 元数据、索引版本/任务版本
   - 写索引存储：向量/embedding（实现方式可后续替换）
7. **统计与上报**：把 summary 写入任务结果，并更新任务终态（`SUCCEEDED/FAILED`）。
8. **失败策略**：
   - chunk 级失败：记录并继续（partial=true）
   - 文件级失败：视策略决定是否继续其它文件

## Failure 与 Fallback
- 源文件不可读：跳过并记录（`retryable=false` 或由上层决定）。
- embedding/provider 失败：返回 `retryable=true`（允许重试整个 task 或 embedding 子步骤）。
- 索引写入失败：`retryable=true`，建议重试并保持幂等键（chunkId/docId）。
- 输入为空：`INVALID_PARAMS`。

## Non-goals
- 不负责“回答用户问题”（由检索与 orchestrator 完成）。
- 不负责 UI 进度展示（由 index-task-runner 产生事件/状态）。

## 本项目已落地（2026-04）
- 已在 `knowledge/ingest-text` 接口实现文本导入到本地知识库：
  - 文档元数据写入
  - 分块策略（chunkSize/overlap）切块
  - token 计数与 chunk 持久化
- 已提供知识库管理相关接口：
  - 文档列表
  - 文档详情（回拼文本）
  - 文档更新（重建分块）
  - 文档删除

