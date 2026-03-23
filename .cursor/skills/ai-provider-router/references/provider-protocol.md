# AI Provider Router References

## 1. Unified Request/Response Protocol

### Request (normalized)
```json
{
  "taskType": "chat|summarize|embeddings|vision",
  "provider": {
    "providerKind": "openai|ollama|lmstudio|custom",
    "modelId": "string"
  },
  "input": {
    "prompt": "string|null",
    "messages": [],
    "attachments": []
  },
  "generation": {
    "temperature": 0.2,
    "maxTokens": 800,
    "topP": 1.0
  },
  "requestContext": {
    "requestId": "string",
    "traceId": "string|null"
  }
}
```

### Success response
```json
{
  "ok": true,
  "code": "SUCCESS",
  "data": {
    "text": "string|null",
    "embeddings": [],
    "usage": {
      "promptTokens": 0,
      "completionTokens": 0,
      "totalTokens": 0
    },
    "providerMeta": {
      "providerKind": "string",
      "modelId": "string",
      "latencyMs": 0
    }
  }
}
```

## 2. Error Codes

| Code | Retryable | Meaning | Suggested Action |
|---|---:|---|---|
| `PROVIDER_NOT_CONFIGURED` | No | Provider credentials or endpoint not configured | Ask user/admin to configure provider |
| `PROVIDER_UNAVAILABLE` | Yes | Upstream provider is down/unreachable | Retry or switch fallback provider |
| `MODEL_NOT_FOUND` | No | Requested modelId is not available | Select supported model |
| `AUTH_FAILED` | No | Invalid key/token/permissions | Reconfigure credentials |
| `RATE_LIMITED` | Yes | Upstream rate limit exceeded | Retry with backoff |
| `REQUEST_TOO_LARGE` | No | Prompt/attachments exceed limits | Truncate or split request |
| `TIMEOUT` | Yes | Upstream call timed out | Retry or reduce request size |
| `INVALID_PARAMS` | No | Invalid taskType/parameters | Fix input payload |
| `INTERNAL_PROVIDER_ERROR` | Yes | Provider adapter failure | Retry and inspect logs |

## 3. Provider Selection Policy

1. If `provider.providerKind` specified, honor it.
2. Else choose default provider by `taskType`.
3. If primary fails with retryable error, optionally fail over once.
4. Persist final provider metadata for observability.

