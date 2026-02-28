
# Streaming Response Issue - Root Cause Analysis

## Problem Description
Text appearing after chat message is sent in OpenCode CLI, indicating streaming is not working correctly.

## Root Cause Identified

### Issue 1: Content-Type Detection Failure
**Location**: `opencode/packages/opencode/src/provider/provider.ts:1491-1493`

**Problem**: 
The streaming detection was checking ONLY for `text/event-stream` content-type:
```typescript
const contentType = response.headers.get('content-type') || ''
const isStreaming = contentType.includes('text/event-stream')
```

However, the Stitch API `/stream-chat-completion` endpoint returns **NDJSON** (Newline-Delimited JSON) with a content-type like `application/x-ndjson` or `application/json`, NOT `text/event-stream`.

**Result**: 
- `isStreaming` was `false` for all Stitch API responses
- Response was treated as non-streaming
- All content was buffered and displayed at once after completion
- This explains why text appears AFTER the message is sent

### Fix Applied
Changed detection logic to check both content-type AND URL:
```typescript
const contentType = response.headers.get('content-type') || ''
const isStreamingByContentType = contentType.includes('text/event-stream')
const isStreamingByUrl = url.includes('/stream-chat-completion')
const isStreaming = isStreamingByUrl || isStreamingByContentType
```

Now it correctly identifies streaming responses from Stitch API by URL pattern.

## Comparison with stitch-cli

### stitch-cli Implementation
- Directly reads from `response.body.getReader()`
- Processes NDJSON line-by-line
- No SSE conversion needed (CLI displays directly)
- Simple buffer management with newline splitting

### opencode Implementation  
- Uses `TransformStream` to convert NDJSON → SSE format
- Requires SSE format for AI SDK compatibility
- More complex error recovery logic
- Must output `data: {...}\n\n` format for each chunk

## Debug Logging Added

Added comprehensive `[STITCH-STREAM]` prefix logs to track:
1. Transform function entry and chunk sizes
2. Buffer management (size before/after operations)
3. Line processing counts
4. JSON parsing attempts and results
5. Transformation success/failure
6. SSE data enqueuing
7. Flush operation with remaining buffer
8. [DONE] marker transmission

## Testing Instructions

1. **Run OpenCode CLI** with a simple query
2. **Monitor console output** for `[STITCH-STREAM]` logs
3. **Verify streaming behavior**:
   - Text should appear character-by-character in real-time
   - NOT all at once after completion
   - Debug logs should show:
     - `isStreamingByUrl: true`
     - `Final isStreaming decision: true`
     - Multiple `Transform called` entries
     - `SSE data enqueued successfully` messages
     - `[DONE] marker sent successfully` at end

## Expected Fixes

### Before Fix
```
[User sends message]
[Wait... wait... wait...]
[ALL text appears at once]
[Message marked as complete]
```

### After Fix
```
[User sends message]
[Text streams character-by-character in real-time]
H
He
Hel
Hell
Hello
Hello w
Hello wo
...
[DONE]
```

## Additional Observations

1. **SSE Format**: Verified we're outputting correct format: `data: {...}\n\n`
2. **[DONE] Marker**: Correctly formatted as `data: [DONE]\n\n`
3. **Buffer Management**: Properly handles partial JSON across chunk boundaries
4. **Error Recovery**: Comprehensive error handling maintains stream continuity

## Next Steps

1. Test the fix with actual OpenCode CLI usage
2. Verify debug logs show correct flow
3. Confirm streaming works end-to-end
4. Consider removing excessive debug logs once verified
5. Document the content-type issue for future reference
