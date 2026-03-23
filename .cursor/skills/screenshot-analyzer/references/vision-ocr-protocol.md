# Screenshot Analyzer References

## 1. OCR/Vision Output Contract

```json
{
  "extractedText": "string",
  "keyPoints": ["string"],
  "confidence": {
    "overall": 0.0,
    "perBlock": [
      { "text": "string", "score": 0.0, "bbox": [0, 0, 0, 0] }
    ]
  }
}
```

## 2. Processing Pipeline

1. Load image from path/ref
2. Validate image format and size
3. OCR extraction
4. Optional vision understanding
5. Post-process text and build key points

## 3. Error Codes

| Code | Retryable | Meaning |
|---|---:|---|
| `IMAGE_NOT_FOUND` | No | image path/ref invalid |
| `IMAGE_DECODE_FAILED` | No | corrupted/unsupported image |
| `OCR_FAILED` | Yes | OCR engine failure |
| `VISION_MODEL_UNAVAILABLE` | Yes | visual model not reachable |
| `INVALID_PARAMS` | No | invalid operation/constraints |

## 4. Confidence Guidance

- `overall >= 0.85`: high confidence
- `0.65 ~ 0.84`: medium confidence
- `< 0.65`: low confidence, recommend manual verification

