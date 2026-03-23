# AI Response Orchestrator References

## 1. End-to-End Flow

1. Load conversation context from `chat-history-store`.
2. If enabled, call `knowledge-retriever` for evidence.
3. Build prompt/messages with constraints.
4. Call `ai-provider-router` for generation.
5. Normalize reply + citations.
6. Persist assistant response back to `chat-history-store`.

## 2. Orchestrator I/O Contract

Input:
```json
{
  "conversationId": "string",
  "userMessage": "string",
  "options": {
    "useLocalKnowledge": true,
    "includeCitations": true
  }
}
```

Output:
```json
{
  "reply": {
    "text": "string",
    "citations": []
  },
  "persisted": {
    "conversationId": "string",
    "assistantMessageId": "string"
  }
}
```

## 3. Error Codes

| Code | Retryable | Meaning |
|---|---:|---|
| `CONTEXT_LOAD_FAILED` | Yes | failed to read chat history |
| `RETRIEVAL_FAILED` | Yes | knowledge retrieval failed |
| `GENERATION_FAILED` | Yes | model call failed |
| `PERSIST_FAILED` | Yes | failed to persist final message |
| `INVALID_PARAMS` | No | invalid orchestrator input |

## 4. Fallback Matrix

- Retrieval failure -> continue with pure conversational response.
- Provider timeout -> retry or switch fallback provider.
- Persist failure -> return reply with `persisted=false` and retry suggestion.

