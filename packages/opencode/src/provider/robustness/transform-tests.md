
# Stitch-to-OpenAI Transformation Tests

This document outlines test scenarios to verify the comprehensive transformation layer implementation.

## Test Scenarios

### 1. Empty Content Handling
**Input:** Stitch response with `content: []`
```json
{
  "result": {
    "response": {
      "choices": [{
        "index": 0,
        "content": [],
        "finish_reason": null
      }]
    }
  }
}
```

**Expected Output:**
```json
{
  "choices": [{
    "index": 0,
    "delta": {},  // No content field
    "finish_reason": null
  }]
}
```

**Status:** ✅ Handled by transform function - omits content field when empty

---

### 2. Text Content Filtering
**Input:** Mixed content types
```json
{
  "result": {
    "response": {
      "choices": [{
        "index": 0,
        "content": [
          { "type": "CONTENT_TYPE_TEXT", "data": "Hello" },
          { "type": "CONTENT_TYPE_REASONING", "data": "thinking..." },
          { "type": "CONTENT_TYPE_TEXT", "data": " World" }
        ]
      }]
    }
  }
}
```

**Expected Output:**
```json
{
  "choices": [{
    "index": 0,
    "delta": {
      "content": "Hello World",  // Only TEXT content
      "role": "assistant"
    },
    "finish_reason": null
  }]
}
```

**Status:** ✅ Handled by textBlocks filter in transform

---

### 3. Role Enum Mapping
**Input:** Stitch role enums
```json
{
  "result": {
    "response": {
      "choices": [{
        "index": 0,
        "role": "MESSAGE_ROLE_ASSISTANT",
        "content": [{ "type": "CONTENT_TYPE_TEXT", "data": "Hi" }]
      }]
    }
  }
}
```

**Expected Output:**
```json
{
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",  // Mapped from enum
      "content": "Hi"
    }
  }]
}
```

**Status:** ✅ Handled by mapRole function

---

### 4. Usage Statistics Mapping
**Input:** Stitch camelCase usage with nested tokens
```json
{
  "result": {
    "response": {
      "usage": {
        "promptTokens": 100,
        "completionTokens": 50,
        "totalTokens": 150,
        "promptTokensDetails": {
          "cachedTokens": 20,
          "inputCacheCreationTokens": 10
        },
        "completionTokensDetails": {
          "reasoningTokens": 15
        }
      }
    }
  }
}
```

**Expected Output:**
```json
{
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 50,
    "total_tokens": 150,
    "cache_read_tokens": 20,
    "cache_write_tokens": 10,
    "reasoning_tokens": 15
  }
}
```

**Status:** ✅ Handled by sanitizeUsage function

---

### 5. Finish Reason Mapping
**Input:** Stitch finish reason enum
```json
{
  "result": {
    "response": {
      "choices": [{
        "finish_reason": "FINISH_REASON_STOP",
        "content": []
      }]
    }
  }
}
```

**Expected Output:**
```json
{
  "choices": [{
    "delta": {},
    "finish_reason": "stop"  // Mapped to lowercase
  }]
}
```

**Status:** ✅ Handled by sanitizeFinishReason function

---

### 6. Double Unwrapping
**Input:** Stitch double-wrapped structure
```json
{
  "result": {
    "response": {
      "id": "test-123",
      "model": "claude-4-5-sonnet",
      "choices": [...]
    }
  }
}
```

**Expected Behavior:** Correctly extracts from `result.response` path

**Status:** ✅ Handled by sanitizer safeGet function

---

### 7. Streaming vs Non-Streaming
**Streaming Input:**
```json
{
  "result": {
    "response": {
      "choices": [{
        "content": [{ "type": "CONTENT_TYPE_TEXT", "data": "chunk" }]
      }]
    }
  }
}
```

**Streaming Output:**
```json
{
  "choices": [{
    "index": 0,
    "delta": {
      "content": "chunk",
      "role": "assistant"
    },
    "finish_reason": null
  }]
}
```

**Non-Streaming Output:**
```json
{
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "chunk"
    },
    "finish_reason": null
  }]
}
```

**Status:** ✅ Handled by isStreaming parameter in transform

---

## Integration Points

### Provider.ts Streaming Handler (Lines 1608-1750)
- ✅ Uses `robustnessLayer.transform(parsed, true)` for streaming
- ✅ Passes full Stitch structure to robustness layer
- ✅ Handles validation errors with fallback
- ✅ Uses robustness layer in flush handler

### Provider.ts Non-Streaming Handler (Lines 1780-1810)
- ✅ Uses `robustnessLayer.transform(parsed, false)` for non-streaming
- ✅ Uses `robustnessLayer.handleError()` for parse errors

### Robustness Layer (index.ts)
- ✅ Filters content by type (TEXT only in main content)
- ✅ Maps role enums to lowercase strings
- ✅ Omits content field when empty (UI contract)
- ✅ Handles both streaming and non-streaming modes

### Sanitizer (sanitizer.ts)
- ✅ Unwraps double-nested structure
- ✅ Maps camelCase to snake_case for usage
- ✅ Extracts nested cache and reasoning tokens
- ✅ Maps finish reason enums

## Success Criteria

- [x] Empty content chunks don't crash UI
- [x] TEXT content renders correctly
- [x] REASONING content filtered out of main content
- [x] Mixed content types handled properly
- [x] Usage statistics map correctly (including nested tokens)
- [x] Finish reasons map to lowercase
- [x] Role enums map to lowercase strings
- [x] No empty strings in delta.content
- [x] Double unwrapping works correctly
- [x] Both streaming and non-streaming work

## Reference Implementation

All transformations follow the stitch-cli reference at:
`stitch-cli/src/ai/gateway-client.ts:324-371`

Key patterns replicated:
1. Content type filtering: `content.type === 'CONTENT_TYPE_TEXT'`
2. Field name mapping: `promptTokens` → `prompt_tokens`
3. Nested token extraction: `promptTokensDetails.cachedTokens` → `cache_read_tokens`
4. Role mapping: `MESSAGE_ROLE_ASSISTANT` → `assistant`
