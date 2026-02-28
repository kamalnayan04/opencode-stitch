# Error Status Code Handling Implementation

**Date**: 2025-02-26  
**Task**: Batch 1, Task 3 - Error Status Code Propagation (GAP-2/FIX-2)  
**Status**: ✅ Complete

---

## Overview

Implemented error status code detection and propagation in streaming responses from stitch-backend. Previously, non-success status codes from `ResponseStatus` were silently ignored, leading to silent failures.

## Problem Statement

In [`stream.ts:150-172`](src/provider/stitch/stream.ts:150), the error handling only checked:
- `parsed.error` (top-level errors)
- `parsed.result?.error` (result-level errors)

But it did NOT check `parsed.result?.response?.status?.code`, causing status codes like:
- `RESPONSE_CODE_BAD_REQUEST`
- `RESPONSE_CODE_INTERNAL_ERROR`
- `RESPONSE_CODE_UNAUTHORIZED`
- `RESPONSE_CODE_RATE_LIMIT_EXCEEDED`
- `RESPONSE_CODE_FORBIDDEN`
- `RESPONSE_CODE_NOT_FOUND`

to be ignored, resulting in silent failures.

## Implementation

### Files Modified

1. **[`types.ts`](src/provider/stitch/types.ts)** - Added `ResponseStatus` type definition
2. **[`stream.ts`](src/provider/stitch/stream.ts:177-202)** - Added error status code detection
3. **[`__tests__/error-status-handling.test.ts`](src/provider/stitch/__tests__/error-status-handling.test.ts)** - Comprehensive test suite (14 tests)

### Changes in Detail

#### 1. Type Definitions (types.ts)

Added `ResponseStatus` interface:

```typescript
/**
 * Response status from stitch-backend
 */
export interface ResponseStatus {
  /** Response code enum (e.g., RESPONSE_CODE_SUCCESS, RESPONSE_CODE_BAD_REQUEST) */
  code?: string;
  /** Human-readable status message */
  message?: string;
}
```

Updated `StitchStreamChunk` to include status:

```typescript
export interface StitchStreamChunk {
  result?: {
    response?: {
      model?: string;
      choices?: StitchResponseChoice[];
      usage?: StitchUsageMetadata;
      status?: ResponseStatus;  // ← Added
    };
  };
  // ...
}
```

#### 2. Error Status Detection (stream.ts)

Added status code checking after existing error checks (lines 177-202):

```typescript
// FIX-2: Check for error status codes in response.status
// Non-success status codes should be treated as errors
const statusCode = parsed?.result?.response?.status?.code;
const statusMessage = parsed?.result?.response?.status?.message;

if (statusCode && statusCode !== 'RESPONSE_CODE_SUCCESS') {
  console.error('[Stitch Stream] Error status code detected:', {
    code: statusCode,
    message: statusMessage
  });
  
  // Emit error delta with status information
  const errorDelta: OpenCodeStreamDelta = {
    id: `stitch-stream-error-${Date.now()}`,
    object: "chat.completion.chunk",
    model: modelName,
    choices: [{
      index: 0,
      delta: {
        content: `[Error ${statusCode}: ${statusMessage || 'No message provided'}]`
      },
      finish_reason: 'error'
    }]
  };
  
  const errorLine = `data: ${JSON.stringify(errorDelta)}\n\n`;
  controller.enqueue(encoder.encode(errorLine));
  
  // Don't process this chunk further - continue to next chunk
  continue;
}
```

#### 3. Test Coverage

Created comprehensive test suite with 14 tests covering:

**Non-Success Status Code Detection (6 tests):**
- RESPONSE_CODE_BAD_REQUEST
- RESPONSE_CODE_INTERNAL_ERROR
- RESPONSE_CODE_UNAUTHORIZED
- RESPONSE_CODE_RATE_LIMIT_EXCEEDED
- RESPONSE_CODE_FORBIDDEN
- RESPONSE_CODE_NOT_FOUND

**Success Status Handling (2 tests):**
- RESPONSE_CODE_SUCCESS allowed through
- Chunks without status field processed normally

**Error Message Formatting (2 tests):**
- Status code and message included in error content
- Graceful handling when message is missing

**Error Processing Behavior (3 tests):**
- Chunk processing stops after error detection
- Model name from response used in error delta
- Default "stitch" model when not present

**Multiple Chunks (1 test):**
- Handles multiple chunks where only some have errors

## Test Results

```bash
✅ 14/14 tests passing
✅ 0 failures
✅ 35 expect() calls
```

All error status handling tests pass. Usage metadata tests also pass (11/11), confirming no regression in existing functionality.

## Usage Example

### Error Status Response from Stitch-Backend

```json
{
  "result": {
    "response": {
      "status": {
        "code": "RESPONSE_CODE_RATE_LIMIT_EXCEEDED",
        "message": "Rate limit exceeded, retry after 60s"
      },
      "choices": [{
        "index": 0,
        "content": [],
        "finish_reason": "FINISH_REASON_STOP"
      }]
    }
  }
}
```

### OpenCode SSE Output

```
data: {"id":"stitch-stream-error-1772113288","object":"chat.completion.chunk","model":"stitch","choices":[{"index":0,"delta":{"content":"[Error RESPONSE_CODE_RATE_LIMIT_EXCEEDED: Rate limit exceeded, retry after 60s]"},"finish_reason":"error"}]}

data: [DONE]
```

## Key Features

1. **Early Detection**: Status code checked immediately after top-level errors
2. **All Error Types**: Handles all ResponseCode error types from stitch-backend proto
3. **Proper Formatting**: Error messages include both status code and message
4. **Stop Processing**: Prevents further processing of error chunks
5. **Model Preservation**: Uses actual model name from response in error delta
6. **SSE Compliance**: Proper SSE format with finish_reason: 'error'
7. **Logging**: Console errors for debugging with structured data

## Verification

### Manual Testing

1. Trigger rate limit error from stitch-backend
2. Verify error delta is emitted with proper format
3. Check console logs show error detection
4. Confirm no further processing of error chunk

### Integration

Works seamlessly with:
- Existing error handling (parsed.error, parsed.result.error)
- Usage metadata tracking
- Stream timeout mechanism
- Duplicate chunk detection

## TDD Workflow Followed

✅ **Step 1: Write Tests First (RED)**
- Created 14 tests verifying all error scenarios
- Confirmed tests failed (expected behavior not implemented)

✅ **Step 2: Implement (GREEN)**
- Added ResponseStatus type
- Implemented error status code detection
- All 14 tests now pass

✅ **Step 3: Verify**
- No regression in existing tests
- All error types handled correctly
- Proper SSE format maintained

## Success Criteria Met

✅ Non-success status codes are detected and converted to error deltas  
✅ All ResponseCode error types handled (BAD_REQUEST, INTERNAL_ERROR, UNAUTHORIZED, RATE_LIMIT_EXCEEDED, FORBIDDEN, NOT_FOUND)  
✅ Error status messages included in error delta  
✅ Success status (RESPONSE_CODE_SUCCESS) allowed through  
✅ Status code errors stop further processing of chunk  
✅ Error deltas use proper SSE format with finish_reason: 'error'  

## Related Tasks

- **Batch 1, Task 1**: Tool Call Interception Tracking (GAP-1) - Not yet implemented
- **Batch 1, Task 2**: Usage Metadata Preservation (GAP-2) - Already implemented
- **This Task**: Error Status Code Propagation (GAP-2/FIX-2) - ✅ Complete

## References

- Implementation Plan: [`docs/plans/2025-02-26-provider-bridge-event-handling-fixes.md`](../../../docs/plans/2025-02-26-provider-bridge-event-handling-fixes.md)
- Proto Definition: `stitch-backend/proto/stitch-backend/inferenceservice/v1/api_message.proto`
- TDD Workflow: `.clinerules/skills/superpowers/test-driven-development/SKILL.md`
