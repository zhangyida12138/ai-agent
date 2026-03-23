# Markdown Summarizer References

## 1. Markdown Output Spec

Recommended structure:

```markdown
# <标题>

## 核心结论
- ...

## 关键要点
- ...

## 后续行动
- [ ] ...

## 引用
- [ref-1] source / snippet
```

Rules:
- Keep heading levels consistent.
- Use bullet list marker `- ` consistently.
- Include citations if requested and evidence exists.

## 2. Length and Truncation Policy

- If source length exceeds `maxChars`, summarize in segments then merge.
- Always preserve factual statements before stylistic refinement.

## 3. Error Codes

| Code | Retryable | Meaning |
|---|---:|---|
| `INVALID_SOURCE` | No | source text/evidence missing |
| `FORMAT_VALIDATION_FAILED` | Yes | output does not match required structure |
| `MODEL_GENERATION_FAILED` | Yes | text generation failed |
| `OUTPUT_TOO_LONG` | Yes | output exceeds hard limit |

