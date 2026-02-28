
# Streaming Response Fix - Test Plan

## Changes Made

### 1. Fixed Streaming Detection Logic
**File**: `opencode/packages/opencode/src/provider/provider.ts`
**Lines**: 1491-1502

**Before**:
```typescript
const contentType = response.headers.get('content-type') || ''
const isStreaming = contentType.includes('text/event-stream')
```

**After**:
```typescript
const contentType = response.headers.get('content-type') || ''
const isStreamingByContentType = contentType.includes('text/event-stream')
const isStreamingByUrl = url.includes('/stream-chat-completion')
const isStreaming = isStreamingByUrl || isStreamingByContentType
```

**Rationale**: 
- Stitch API `/stream-chat-completion` returns NDJSON format
- Content-Type is `application/x-ndjson` or `application/json`, NOT `text/event-stream`
- Previous code failed to detect streaming, causing buffered (non-streaming) behavior
- New code checks URL pattern as primary indicator, content-type as fallback

### 2. Added Comprehensive Debug Logging
Added `[STITCH-STREAM]` prefixed logs throughout the transform stream:
- Transform entry/exit points
- Buffer size tracking
- Line processing counts  
- JSON parsing success/failure
- SSE data enqueuing confirmation
- Flush operation details
- [DONE] marker transmission

## Test Scenarios

### Test 1: Basic Streaming Response
**Steps**:
1. Open OpenCode CLI
2. Send a simple query: "Write a hello world function"
3. Observe the response

**Expected Behavior**:
- ✅ Text appears character-by-character in real-time
- ✅ NOT all at once after completion
- ✅ Console shows `isStreamingByUrl: true`
- ✅ Console shows `Final isStreaming decision: true`
- ✅ Multiple `[STITCH-STREAM] Transform called` logs
- ✅ `[STITCH-STREAM] SSE data enqueued successfully` messages
- ✅ `[STITCH-STREAM] [DONE] marker sent successfully` at end

**Failure Indicators**:
- ❌ Text appears all at once
- ❌ `Final isStreaming decision: false`
- ❌ No transform stream logs
- ❌ Response treated as non-streaming

### Test 2: Long Response Streaming
**Steps**:
1. Send a query requiring long response: "Explain the OpenCode architecture in detail"
2. Monitor console for streaming activity
3. Verify continuous text updates

**Expected Behavior**:
- ✅ Smooth, continuous text streaming
- ✅ Multiple transform calls with varying chunk sizes
- ✅ Buffer management logs showing proper accumulation/clearing
- ✅ No long pauses between chunks

### Test 3: Error Recovery During Streaming
**Steps**:
1. Simulate network interruption (if possible)
2. Send a query
3. Observe error handling

**Expected Behavior**:
- ✅ Graceful error messages
- ✅ Error recovery logs showing decision process
- ✅ Stream terminates cleanly with error response
- ✅ [DONE] marker sent (or skipped if terminal error)

### Test 4: Partial Chunk Handling
**Steps**:
1. Send a query that generates JSON chunks split across boundaries
2. Monitor buffer management logs

**Expected Behavior**:
- ✅ Partial lines kept in buffer
- ✅ Complete lines processed immediately
- ✅ No JSON parsing errors for partial chunks
- ✅ Flush processes final buffer correctly

## Console Log Verification Checklist

When testing, verify these log patterns appear:

```
[STITCH-DEBUG] Rewritten URL: .../stream-chat-completion
[STITCH-DEBUG] Added streaming headers - Accept: text/event-stream
[STITCH-DEBUG] Content-Type: application/x-ndjson (or similar)
[STITCH-DEBUG] isStreamingByContentType: false
[STITCH-DEBUG] isStreamingByUrl: true
[STITCH-DEBUG] Final isStreaming decision: true
[STITCH-DEBUG] Processing streaming response (NDJSON format)

[STITCH-STREAM] Transform called, chunk size: XXX
[STITCH-STREAM] Buffer size after decode: XXX
[STITCH-STREAM] Processing N lines, buffer remaining: XXX
[STITCH-STREAM] Parsing line: {...
[STITCH-STREAM] Parsed type: XXX
[STITCH-STREAM] Transformed, has delta: true
[STITCH-STREAM] Delta content: XXX
[STITCH-STREAM] Enqueueing SSE data, size: XXX
[STITCH-STREAM] SSE data enqueued successfully

... (repeated for each chunk) ...

[STITCH-STREAM] Flush called, buffer remaining: XXX
[STITCH-STREAM] Sending [DONE] marker
[STITCH-STREAM] [DONE] marker sent successfully
[STITCH-STREAM] Cleanup complete
```

## Performance Verification

### Metrics to Check:
1. **First Byte Time**: Time from request to first character appearing
   - Should be < 1 second for streaming
   - Non-streaming would be 5-30+ seconds

2. **Progressive Updates**: Text should update continuously
   - Not in large chunks
   - Smooth character-by-character or word-by-word flow

3. **Memory Usage**: No excessive buffer accumulation
   - Buffer should clear after each line
   - Remaining buffer should be small (< 1KB typically)

## Regression Tests

Verify these scenarios still work:

1. **Non-Streaming Providers**: Other providers (OpenAI, Anthropic, etc.) should still work
2. **Error Responses**: Error handling for non-streaming errors
3. **Tool Calls**: Tool request/response handling (if applicable)
4. **Large Messages**: Very long responses don't cause issues

## Success Criteria

✅ **Primary**: Text streams in real-time, character-by-character
✅ **Primary**: Console logs confirm streaming detection and processing
✅ **Secondary**: No performance degradation
✅ **Secondary**: Error handling works correctly
✅ **Secondary**: All existing functionality preserved

## Rollback Plan

If issues occur:
1. Revert changes to `provider.ts` lines 1491-1502
2. Remove debug logging additions
3. Investigate alternative approaches (e.g., check request headers instead)

## Next Steps After Testing

1. If successful:
   - Consider reducing debug log verbosity
   - Keep critical logs, remove verbose details
   - Document the content-type issue

2. If issues found:
   - Use debug logs to identify failure point
   - Adjust detection logic as needed
   - Test alternative detection methods
