# Knowledge Retriever References

## 1. Retrieval Protocol

### Input
```json
{
  "query": "string",
  "topK": 5,
  "filters": {
    "docIds": [],
    "timeRange": { "from": null, "to": null }
  },
  "dedupe": true
}
```

### Output
```json
{
  "evidence": [
    {
      "id": "chunk-id",
      "source": { "docId": "string", "path": "string" },
      "text": "string",
      "score": 0.0,
      "metadata": {}
    }
  ]
}
```

## 2. Ranking Policy

1. Candidate retrieval from vector index (topK * 2).
2. Optional re-rank using lexical score or lightweight reranker.
3. Deduplicate by `docId + near-duplicate text`.
4. Return final topK with stable ordering by score desc.

## 3. Error Codes

| Code | Retryable | Meaning |
|---|---:|---|
| `INDEX_NOT_READY` | Yes | index exists but still building |
| `INDEX_NOT_FOUND` | No | no local index available |
| `QUERY_EMBEDDING_FAILED` | Yes | embedding generation failed |
| `RETRIEVAL_FAILED` | Yes | vector store query failed |
| `INVALID_PARAMS` | No | invalid query payload |

