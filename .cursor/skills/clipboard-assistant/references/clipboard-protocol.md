# Clipboard Assistant References

## 1. Clipboard Payload Types

Supported source types:

- `text`
- `url`
- `image`
- `unknown` (fallback path)

Normalized payload:
```json
{
  "source": {
    "type": "text|url|image|unknown",
    "text": "string|null",
    "url": "string|null",
    "imageRef": "string|null"
  }
}
```

## 2. Operation Modes

| Operation | Output |
|---|---|
| `summarize` | Markdown summary + highlights |
| `extract` | structured fields |
| `transform` | rewritten/normalized content |

## 3. Error Codes

| Code | Retryable | Meaning |
|---|---:|---|
| `CLIPBOARD_UNAVAILABLE` | No | cannot access clipboard |
| `PERMISSION_DENIED` | No | missing capability permission |
| `UNSUPPORTED_CONTENT` | No | unsupported clipboard type |
| `TRANSFORM_FAILED` | Yes | transformation pipeline failed |
| `INVALID_PARAMS` | No | invalid operation or options |

## 4. Routing Rules

1. If `type=image`, route to screenshot analyzer (OCR/vision).
2. If `type=url`, extract URL metadata then summarize.
3. If `type=unknown`, fallback to text normalization if possible.

