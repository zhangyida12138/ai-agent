---
name: clipboard-assistant
description: Read and classify clipboard content (text/url/image) and transform it into structured extraction or Markdown summaries using the desktop assistant pipeline. Use when implementing clipboard-based workflows.
---

# Clipboard Assistant

## When to Use
- 用户请求“分析剪贴板内容”“把剪贴板总结成 Markdown/要点”“从剪贴板提取结构化信息”。
- 需要对剪贴板内容类型（纯文本/URL/图片引用等）做类型识别与路由。

## Input 契约
```json
{
  "requestId": "string",
  "operation": "summarize|extract|transform",
  "mode": { "language": "zh-CN|null", "maxLength": 800, "style": "bullet|prose|enterprise" },
  "source": {
    "type": "text|url|image|unknown",
    "text": "string|null",
    "url": "string|null",
    "imageRef": "string|null"
  },
  "requestContext": { "conversationId": "string|null" }
}
```

## Output 契约
总结类（Markdown）：
```json
{
  "ok": true,
  "code": "SUCCESS|null",
  "data": {
    "markdown": "string",
    "highlights": ["string"]
  }
}
```

提取类（结构化）：
```json
{
  "ok": true,
  "code": "SUCCESS|null",
  "data": {
    "extracted": { "any": "structured fields" },
    "notes": "string|null"
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
  "nextAction": "what to do"
}
```

## Workflow
1. **读取剪贴板**：通过 `tauri-capability-bridge` 获取剪贴板快照（必须走权限通道）。
2. **类型识别**：
   - 若是 URL：提取域名/标题（可选）并用于总结
   - 若是图片：将图片引用交给 `screenshot-analyzer` 或 OCR 子流程
   - 若未知：降级为“把内容当作文本处理”的模式
3. **按 operation 选择处理链**：
   - `summarize`：输出企业风格 Markdown
   - `extract`：输出结构化字段 + 简短说明
4. **输出规范**：使用统一标题层级与列表格式；必要时附带“关键信息”段落。

## Failure 与 Fallback
- 剪贴板访问失败：返回 `CLIPBOARD_UNAVAILABLE`（`retryable=false`）。
- 权限不足：`PERMISSION_DENIED`。
- 非文本内容：降级为 OCR/视觉链或最终降级为“文本化转写”（若实现了）。

## Non-goals
- 不做索引写入（由 ingestion/indexer）。
- 不做知识检索与 grounding（由 knowledge-retriever 与 orchestrator）。

