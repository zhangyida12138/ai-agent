---
name: markdown-summarizer
description: Produce consistent, high-quality Markdown summaries (including structured sections, citations, and task-oriented outputs) with length controls and corporate style. Use when converting long text/evidence into Markdown deliverables.
---

# Markdown Summarizer

## When to Use
- 用户请求“总结成 Markdown/企业风格简报/提炼要点/生成可复用摘要”。
- 下游希望对检索证据或截图/OCR 文本做二次摘要（保持引用与结构）。

## Input 契约
```json
{
  "requestId": "string",
  "source": {
    "type": "text|evidence",
    "text": "string|null",
    "evidence": [
      { "id": "string", "text": "string", "source": { "docId": "string", "path": "string" } }
    ]
  },
  "summary": {
    "language": "zh-CN",
    "maxChars": 2500,
    "tone": "enterprise|neutral",
    "includeCitations": true,
    "format": "executive-summary|bullets|memo"
  }
}
```

## Output 契约
```json
{
  "ok": true,
  "code": "SUCCESS|null",
  "data": {
    "markdown": "string",
    "summaryJson": { "title": "string", "highlights": ["string"], "actionItems": ["string"] },
    "citations": [
      { "refId": "string", "label": "source label", "snippet": "string" }
    ]
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
1. **约束解析**：确定最大长度、语气、是否需要 citations。
2. **内容清洗与截断**：当输入过长时分段摘要或截断策略（保证关键事实不丢）。
3. **结构化生成**：
   - 先给“标题/一句话结论”
   - 再给“关键要点（条目）”
   - 如需要，再给“引用列表/证据片段”
4. **Markdown 规范**：
   - 标题层级固定（例如 `#` `##`）
   - 列表只使用一种风格（要点用 `- `）
5. **一致性校验**：输出是否包含必需段落；若缺失可进行一次自我修正重试（可选）。

## Failure 与 Fallback
- 输入过长：返回“截断摘要”并标记 `fallback=true`（若你实现该字段）。
- 生成格式不合规：最多重试一次格式校正（避免无限循环）。
- 模型失败：退化为纯要点（无复杂段落）。

## Non-goals
- 不负责检索（由 knowledge-retriever 完成）。
- 不负责写入数据库（由各持久化 skills 完成）。

