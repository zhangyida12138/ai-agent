# Tauri Capability Bridge References

## 1. Capability Policy Model

Use an allowlist model:

```json
{
  "capabilities": [
    "fs-read",
    "fs-write",
    "clipboard-get",
    "clipboard-set",
    "screenshot-capture",
    "window-open",
    "shell-exec"
  ]
}
```

Only explicitly allowed capability names are executable.

## 2. Request/Response Envelope

```json
{
  "capability": "string",
  "params": {},
  "requestContext": { "requestId": "string" }
}
```

```json
{
  "ok": false,
  "code": "PERMISSION_DENIED",
  "message": "capability is not allowed",
  "retryable": false
}
```

## 3. Error Codes

| Code | Retryable | Meaning |
|---|---:|---|
| `PERMISSION_DENIED` | No | capability or path not permitted |
| `UNKNOWN_CAPABILITY` | No | capability not defined |
| `INVALID_PARAMS` | No | failed validation |
| `CAPABILITY_FAILED` | Yes | runtime bridge failure |
| `PATH_OUT_OF_SCOPE` | No | path outside authorized roots |

## 4. Safety Checks

- Validate paths after normalization.
- For shell-like capability, enforce executable + arg policy.
- Add request tracing (`requestId`) on every response.

