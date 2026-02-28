
# Stitch Request Transformation Enhancements

**Date:** 2025-02-25  
**Status:** ✅ Completed  
**Related Design Doc:** [`opencode/docs/plans/2026-02-25-opencode-stitch-integration-design.md`](./plans/2026-02-25-opencode-stitch-integration-design.md)

---

## Summary

Enhanced the Stitch provider request transformation layer to support cache control markers, improve message normalization, and add comprehensive request validation. All enhancements are frontend-only and maintain backward compatibility.

---

## Enhancements Implemented

### 1. Cache Control Support ✅

**Problem:** OpenCode messages with cache control markers (`cache_control: { type: "ephemeral" }`) were not being transformed to Stitch's format.

**Solution:** 
- Added transformation logic to map OpenCode's `cache_control` to Stitch's `explicit_caching_control`
- Detects `cache_control: { type: "ephemeral" }` in content blocks
- Transforms to `explicit_caching_control: { enabled: true }` in Stitch format
- Logs cache control additions for debugging

**Example:**
```typescript
// OpenCode format
{
  type: "text",
  text: "Important context",
  cache_control: { type: "ephemeral" }
}

// Transformed to Stitch format
{
  type: "CONTENT_TYPE_TEXT",
  data: "Important context",
  explicit_caching_control: { enabled: true }
}
```

**Implementation:** [`provider.ts:1214-1220`](../packages/opencode/src/provider/provider.ts:1214)

---

### 2. Improved Message Content Normalization ✅

**Problem:** Message content transformation didn't handle all OpenCode content types properly.

**Solution:**
- Added support for all content type variations:
  - Text content blocks (`type: "text"`)
  - Reasoning content blocks (`type: "reasoning"`)
  - Tool use/result blocks (filtered out)
- Handles multiple field name variations: `text`, `content`, `data`
- Properly filters unsupported content types (tool calls, tool results)
- Maintains content array structure correctly

**Content Type Mapping:**
| OpenCode Type | Stitch Type | Action |
|--------------|-------------|--------|
| `"text"` | `"CONTENT_TYPE_TEXT"` | Transform |
| `"reasoning"` | `"CONTENT_TYPE_REASONING"` | Transform |
| `"tool-call"` | N/A | Filter out |
| `"tool-result"` | N/A | Filter out |
| `"tool_use"` | N/A | Filter out |
| `"tool_result"` | N/A | Filter out |

**Implementation:** [`provider.ts:1192-1225`](../packages/opencode/src/provider/provider.ts:1192)

---

### 3. Request Validation ✅

**Problem:** Invalid requests were sent to Stitch without proper validation, causing unclear errors.

**Solution:**
- Added comprehensive request validation before transformation
- Validates required fields: `model`, `messages`
- Validates message structure: `role`, `content`
- Validates role values: `user`, `assistant`, `system`
- Warns about unsupported features (tools)
- Provides clear error messages for validation failures

**Validation Checks:**
1. **Model validation:** Ensures `model` field is present
2. **Messages validation:** Ensures `messages` is a non-empty array
3. **Message structure:** Validates each message has valid `role` and `content`
4. **Role validation:** Ensures role is one of: `user`, `assistant`, `system`
5. **Feature warnings:** Logs warnings for unsupported features like tools

**Implementation:** [`provider.ts:1227-1253`](../packages/opencode/src/provider/provider.ts:1227)

---

### 4. Reasoning Budget Support ✅

**Problem:** Reasoning budget parameter wasn't being passed to Stitch.

**Solution:**
- Added conditional `reasoning_config` to request config
- Only includes `reasoning_budget` if provided in the request
- Logs reasoning config additions for debugging

**Example:**
```typescript
// If reasoning_budget is provided
{
  config: {
    temperature: 0.7,
    max_tokens: 1000,
    reasoning_config: {
      reasoning_budget: 5000
    }
  }
}
```

**Implementation:** [`provider.ts:1278-1285`](../packages/opencode/src/provider/provider.ts:1278)

---

## Testing

### Test Coverage ✅

Created comprehensive test suite with **17 test cases** covering:

1. ✅ Simple string content transformation
2. ✅ Array content with text blocks
3. ✅ Cache control marker transformation
4. ✅ Tool call content filtering
5. ✅ Tool result content filtering
6. ✅ Reasoning content type handling
7. ✅ Role name mapping
8. ✅ Mixed content with cache control
9. ✅ Valid request validation
10. ✅ Missing model validation error
11. ✅ Missing messages validation error
12. ✅ Empty messages array validation error
13. ✅ Invalid role validation error
14. ✅ Missing content validation error
15. ✅ Content field variations handling
16. ✅ Non-standard content format handling
17. ✅ Full request transformation

**Test Results:**
```
✅ 17 pass
❌ 0 fail
📊 29 expect() calls
```

**Test File:** [`test/provider/stitch-transform.test.ts`](../packages/opencode/test/provider/stitch-transform.test.ts)

**Run Tests:**
```bash
cd opencode/packages/opencode
bun test test/provider/stitch-transform.test.ts
```

---

## Usage Examples

### Example 1: Simple Text Message
```typescript
// OpenCode format
{
  model: "stitch-1",
  messages: [
    {
      role: "user",
      content: "Hello, world!"
    }
  ]
}

// Transformed to Stitch format
{
  request: {
    model: "stitch-1",
    fallback_model: "stitch-1",
    messages: [
      {
        role: "MESSAGE_ROLE_USER",
        content: [
          { type: "CONTENT_TYPE_TEXT", data: "Hello, world!" }
        ]
      }
    ],
    config: { temperature: 1, max_tokens: 8192 },
    client_options: { /* ... */ }
  }
}
```

### Example 2: Message with Cache Control
```typescript
// OpenCode format
{
  model: "stitch-1",
  messages: [
    {
      role: "system",
      content: [
        {
          type: "text",
          text: "You are a helpful assistant.",
          cache_control: { type: "ephemeral" }
        }
      ]
    },
    {
      role: "user",
      content: "What is the weather?"
    }
  ]
}

// System message content transformed to
{
  type: "CONTENT_TYPE_TEXT",
  data: "You are a helpful assistant.",
  explicit_caching_control: { enabled: true }
}
```

### Example 3: Message with Reasoning
```typescript
// OpenCode format
{
  role: "assistant",
  content: [
    { type: "reasoning", content: "Let me analyze this..." },
    { type: "text", text: "Here's my answer" }
  ]
}

// Transformed to
{
  role: "MESSAGE_ROLE_ASSISTANT",
  content: [
    { type: "CONTENT_TYPE_REASONING", data: "Let me analyze this..." },
    { type: "CONTENT_TYPE_TEXT", data: "Here's my answer" }
  ]
}
```

### Example 4: Message with Reasoning Budget
```typescript
// OpenCode format
{
  model: "stitch-1",
  messages: [{ role: "user", content: "Solve this problem" }],
  reasoning_budget: 5000
}

// Config includes reasoning_config
{
  config: {
    temperature: 1,
    max_tokens: 8192,
    reasoning_config: {
      reasoning_budget: 5000
    }
  }
}
```

---

## Error Handling

### Validation Errors

**Missing Model:**
```
Error: Invalid request: Missing required field: model
```

**Empty Messages:**
```
Error: Invalid request: Messages array cannot be empty
```

**Invalid Role:**
```
Error: Invalid request: Invalid role at message 0: invalid_role
```

**Missing Content:**
```
Error: Invalid request: Missing content at message 0
```

### Warnings

**Unsupported Tools:**
```
[STITCH-DEBUG] Warning: Tools are not supported by Stitch API and will be ignored
```

**Filtered Content:**
```
[STITCH-DEBUG] Filtering out unsupported content type: tool-call
```

---

## Implementation Details

### Files Modified

1. **[`packages/opencode/src/provider/provider.ts`](../packages/opencode/src/provider/provider.ts)**
   - Lines 1176-1310: Enhanced message transformation logic
   - Added cache control support
   - Added content filtering
   - Added validation
   - Added reasoning budget support

### Files Created

1. **[`test/provider/stitch-transform.test.ts`](../packages/opencode/test/provider/stitch-transform.test.ts)**
   - Comprehensive test suite with 17 test cases
   - All tests passing

2. **[`docs/stitch-request-transformation-enhancements.md`](./stitch-request-transformation-enhancements.md)**
   - This documentation file

---

## Compatibility

### Backward Compatibility ✅

- All changes are additive
- Existing functionality preserved
- No breaking changes to API
- Graceful handling of legacy formats

### Forward Compatibility ✅

- Extensible design for future content types
- Clear separation of concerns
- Easy to add new transformations

---

## Performance Impact

**Minimal overhead:**
- Simple field mapping operations
- Linear time complexity O(n) for message array
- No external dependencies
- Efficient filtering and transformation

---

## Future Enhancements

### Potential Improvements

1. **Image/Audio Support:** Add transformation for multimodal content when Stitch supports it
2. **Advanced Caching:** Support additional cache control types if Stitch adds them
3. **Tool Call Emulation:** Client-side tool handling if needed
4. **Partial Delta Handling:** Buffer incomplete content across streaming chunks

### Non-Goals

- Backend modifications (out of scope)
- Tool call support (Stitch limitation)
- Breaking changes to existing API

---

## References

### Related Documents

- **Design Document:** [`2026-02-25-opencode-stitch-integration-design.md`](./plans/2026-02-25-opencode-stitch-integration-design.md)
  - Section 2.1: Request Format Comparison
  - Section 6.1: Field-Level Mapping (Request)
  - Section 7.1: Request Transformation Pseudocode

- **NDJSON Parser Fix:** [`fix-ndjson-streaming-parser.md`](./fix-ndjson-streaming-parser.md)

- **Original Fix Documentation:** [`STITCH_PROVIDER_FIX.md`](../STITCH_PROVIDER_FIX.md)

### Implementation References

- **Provider Implementation:** [`packages/opencode/src/provider/provider.ts`](../packages/opencode/src/provider/provider.ts)
- **Test Suite:** [`test/provider/stitch-transform.test.ts`](../packages/opencode/test/provider/stitch-transform.test.ts)

---

## Success Criteria ✅

All success criteria met:

- ✅ Cache control markers are properly transformed
- ✅ All content types are correctly normalized
- ✅ Request validation catches invalid inputs
- ✅ Comprehensive test coverage (17 tests, all passing)
- ✅ Clear error messages for failures
- ✅ No backend modifications required
- ✅ Maintains compatibility with existing OpenCode message format
- ✅ Does not break existing functionality
- ✅ Handles edge cases gracefully

---

## Conclusion

The Stitch provider request transformation has been successfully enhanced with:

1. **Cache control support** for prompt caching optimization
2. **Improved message normalization** for all content types
3. **Comprehensive validation** with clear error messages
4. **Reasoning budget support** for advanced models
5. **Complete test coverage** with 17 passing tests

All enhancements are production-ready and maintain full backward compatibility.
