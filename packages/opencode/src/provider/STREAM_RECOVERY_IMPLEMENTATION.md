
# NDJSON Streaming Parser & Error Recovery Implementation

**Date:** 2026-02-25  
**Status:** ✅ Completed

## Summary

Successfully implemented stream error recovery infrastructure for the Stitch provider. The NDJSON streaming parser was already correctly implemented; this work added robust error handling with intelligent recovery decisions.

## Changes Made

### 1. Added Stream Error Recovery Functions (`stitch-error.ts`)

#### `isStreamRecoverable(error: StitchError): boolean`
Determines if a streaming error allows continuation:
- **Terminal errors:** authentication_error, rate_limit, 400, 403
- **Recoverable errors:** streaming_error, validation_error
- Returns `false` for terminal errors, `true` for recoverable ones

#### `handleStreamError(error, buffer): { shouldContinue, errorResponse? }`
Central error recovery decision maker:
- Converts unknown errors to StitchError format
- Adds buffer context to error details
- Calls `isStreamRecoverable()` to decide action
- Returns SSE-formatted error response for terminal errors
- Logs recoverable errors and allows stream to continue

#### `createStreamErrorResponse(error: StitchError): string`
Creates properly formatted SSE error response:
- Wraps error in OpenAI-compatible format
- Returns: `data: {...}\n\ndata: [DONE]\n\n`

### 2. Integrated Error Recovery in Provider (`provider.ts`)

#### Import Updates
Added imports for:
- `handleStreamError`
- `isStreamRecoverable`
- `createStreamErrorResponse`

#### Transform Stream Updates

**Per-line error handling:**
```typescript
try {
  const parsed = JSON.parse(line)
  // Check for errors in response
  if (parsed.error) {
    const recovery = handleStreamError(stitchError, buffer)
    if (!recovery.shouldContinue) {
      controller.enqueue(recovery.errorResponse)
      controller.terminate()
      return
    }
    continue // Recoverable - skip to next line
  }
  // Transform and enqueue
} catch (lineError) {
  const recovery = handleStreamError(lineError, buffer)
  if (!recovery.shouldContinue) {
    controller.enqueue(recovery.errorResponse)
    controller.terminate()
    return
  }
  // Recoverable - continue processing
}
```

**Transform-level error handling:**
```typescript
catch (transformError) {
  const recovery = handleStreamError(transformError, buffer)
  if (!recovery.shouldContinue) {
    controller.enqueue(recovery.errorResponse)
    controller.terminate()
  }
  // If recoverable, stream continues
}
```

**Flush handler with cleanup:**
```typescript
flush(controller) {
  try {
    if (buffer.trim()) {
      try {
        // Process final buffer
      } catch (flushError) {
        const recovery = handleStreamError(flushError, buffer)
        if (recovery.errorResponse) {
          controller.enqueue(recovery.errorResponse)
          return // Skip [DONE] after error
        }
      }
    }
    // Always send [DONE] for clean termination
    controller.enqueue('data: [DONE]\n\n')
  } finally {
    buffer = '' // Clean up buffer
  }
}
```

## Error Recovery Logic

### Terminal Errors (Stream Stops)
1. **Authentication errors** - Invalid API key
2. **Rate limit errors** - Too many requests
3. **400 Bad Request** - Invalid request format
4. **403 Forbidden** - Insufficient permissions

**Action:** Send error response + [DONE], terminate stream

### Recoverable Errors (Stream Continues)
1. **Malformed JSON chunks** - Skip and continue
2. **Validation errors** (non-400) - Log and continue
3. **Streaming errors** - Skip chunk and continue

**Action:** Log error, continue processing next chunks

## Verification

### Test Results
All error recovery scenarios tested and verified:
- ✅ Recoverable streaming_error continues stream
- ✅ Terminal authentication_error stops stream
- ✅ Terminal rate_limit stops stream
- ✅ Terminal 400 validation_error stops stream
- ✅ SSE error response format correct

### NDJSON Parser Verification
Existing implementation already correct:
- ✅ Buffer management for incomplete lines
- ✅ NDJSON parsing without `data:` prefix
- ✅ SSE output format with `data:` prefix
- ✅ [DONE] marker sent on stream end
- ✅ Buffer cleanup in finally block

## Benefits

1. **Resilient streaming:** Recovers from transient errors
2. **Clear error reporting:** Terminal errors properly communicated
3. **Resource cleanup:** Buffers always cleaned up
4. **Partial results preserved:** Sends data before error
5. **Logging:** All errors logged with context
6. **No silent failures:** Every error handled explicitly

## Files Modified

1. [`opencode/packages/opencode/src/provider/stitch-error.ts`](opencode/packages/opencode/src/provider/stitch-error.ts)
   - Added `isStreamRecoverable()`
   - Added `handleStreamError()`
   - Added `createStreamErrorResponse()`

2. [`opencode/packages/opencode/src/provider/provider.ts`](opencode/packages/opencode/src/provider/provider.ts)
   - Added imports for recovery functions
   - Integrated recovery in per-line error handling
   - Integrated recovery in transform error handling
   - Enhanced flush handler with recovery and cleanup

## Next Steps

Recommended follow-up tasks:
1. Monitor error logs in production to tune recovery decisions
2. Add metrics for recoverable vs terminal errors
3. Consider adding retry logic for specific recoverable errors
4. Document error scenarios in user-facing documentation

## References

- Design doc: [`opencode/docs/plans/2026-02-25-opencode-stitch-integration-design.md`](opencode/docs/plans/2026-02-25-opencode-stitch-integration-design.md)
- Error types: Section 2.5
- Streaming protocol: Section 2.3
- Error handling: Sections 7.4, 8, 10.5
