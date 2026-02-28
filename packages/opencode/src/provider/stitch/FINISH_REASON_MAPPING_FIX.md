
# Finish Reason Mapping Fix (GAP-7/FIX-6)

## Overview
Fixed incomplete finish reason mapping in the provider bridge. Added mappings for error-type ResponseCode values that were falling through to default lowercase conversion.

## Problem
The [`FINISH_REASON_MAP`](stream.ts:37) constant only included 9 finish reason mappings. New error-type finish reasons from the ResponseCode enum (proto/stitch-backend/inferenceservice/v1/api_message.proto:82-101) were not mapped, causing them to be converted to lowercase instead of mapping to 'error'.

**Missing Mappings:**
- RESPONSE_CODE_BAD_REQUEST
- RESPONSE_CODE_INTERNAL_ERROR
- RESPONSE_CODE_UNAUTHORIZED
- RESPONSE_CODE_RATE_LIMIT_EXCEEDED
- RESPONSE_CODE_FORBIDDEN
- RESPONSE_CODE_NOT_FOUND

## Solution
Expanded the FINISH_REASON_MAP constant to include all error ResponseCode types, mapping them to 'error':

```typescript
const FINISH_REASON_MAP: Record<string, string> = {
  // Standard finish reasons
  'FINISH_REASON_STOP': 'stop',
  'FINISH_REASON_MAX_TOKENS': 'length',
  'FINISH_REASON_SAFETY': 'content_filter',
  'FINISH_REASON_RECITATION': 'content_filter',
  'FINISH_REASON_FUNCTION_CALL': 'tool_calls',
  // Legacy mappings (lowercase)
  'STOP': 'stop',
  'MAX_TOKENS': 'length',
  'SAFETY': 'content_filter',
  'RECITATION': 'content_filter',
  'FUNCTION_CALL': 'tool_calls',
  // Error ResponseCode types (GAP-7/FIX-6)
  'RESPONSE_CODE_BAD_REQUEST': 'error',
  'RESPONSE_CODE_INTERNAL_ERROR': 'error',
  'RESPONSE_CODE_UNAUTHORIZED': 'error',
  'RESPONSE_CODE_RATE_LIMIT_EXCEEDED': 'error',
  'RESPONSE_CODE_FORBIDDEN': 'error',
  'RESPONSE_CODE_NOT_FOUND': 'error'
};
```

## TDD Workflow Applied
Following the `.clinerules/skills/superpowers/test-driven-development/SKILL.md` workflow:

### 1. RED Phase (Tests First)
Created comprehensive test suite in `__tests__/finish-reason-mapping.test.ts`:
- 4 tests for existing finish reasons (verify no regressions)
- 6 tests for new error-type finish reasons (verify new mappings)
- 2 tests for fallback behavior
- 2 tests for stream integration

**Initial Test Results:** 6 failures (as expected - mappings didn't exist yet)

### 2. GREEN Phase (Implementation)
Added 6 new mappings to FINISH_REASON_MAP in stream.ts:37-57

**Final Test Results:** All 14 tests pass ✅

### 3. Verification Phase
Confirmed no regressions:
- ✅ finish-reason-mapping.test.ts: 14/14 pass
- ✅ usage-metadata.test.ts: 11/11 pass (streaming integration)
- ✅ Existing finish reason tests in stitch.test.ts: pass

## Test Coverage

### New Test File: `__tests__/finish-reason-mapping.test.ts`
```
✅ Existing Finish Reasons (4 tests)
  - FINISH_REASON_STOP → 'stop'
  - FINISH_REASON_MAX_TOKENS → 'length'
  - FINISH_REASON_SAFETY → 'content_filter'
  - FINISH_REASON_FUNCTION_CALL → 'tool_calls'

✅ New Error-Type Finish Reasons (6 tests)
  - RESPONSE_CODE_BAD_REQUEST → 'error'
  - RESPONSE_CODE_INTERNAL_ERROR → 'error'
  - RESPONSE_CODE_UNAUTHORIZED → 'error'
  - RESPONSE_CODE_RATE_LIMIT_EXCEEDED → 'error'
  - RESPONSE_CODE_FORBIDDEN → 'error'
  - RESPONSE_CODE_NOT_FOUND → 'error'

✅ Fallback Behavior (2 tests)
  - Unknown reasons use lowercase fallback
  - Missing finish_reason returns null

✅ Stream Integration (2 tests)
  - Finish reasons work with content streaming
  - Mixed content scenarios handled correctly
```

## Impact

**Before Fix:**
```json
{
  "finish_reason": "response_code_rate_limit_exceeded"  // Wrong!
}
```

**After Fix:**
```json
{
  "finish_reason": "error"  // Correct!
}
```

## Files Modified
1. `stream.ts:37-57` - Expanded FINISH_REASON_MAP constant
2. `__tests__/finish-reason-mapping.test.ts` - Created comprehensive test suite (350 lines)

## Changes Summary
- ✅ Added 6 error ResponseCode mappings
- ✅ Maintained all 9 existing mappings
- ✅ Preserved fallback behavior
- ✅ No regressions introduced
- ✅ 14 new passing tests
- ✅ Full TDD workflow followed

## Related Tasks
- Part of Provider Bridge Event Handling Fixes - Batch 2, Task 1
- Addresses GAP-7/FIX-6 from `docs/plans/2025-02-26-provider-bridge-event-handling-fixes.md`

## Verification
Run tests:
```bash
cd opencode/packages/opencode
bun test src/provider/stitch/__tests__/finish-reason-mapping.test.ts
```

Expected: 14 pass, 0 fail ✅
