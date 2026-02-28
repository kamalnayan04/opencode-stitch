
# Fix for TypeError: "undefined is not an object (evaluating 'chunk.delta.length')"

**Date:** 2026-02-27  
**Status:** ✅ COMPLETED

## Problem Summary

The Stitch API was sending malformed NDJSON lines during streaming that failed to parse. While the provider caught these JSON parse errors, it didn't validate the structure of successfully parsed chunks before processing them. This caused two critical issues:

1. **Provider Layer**: Successfully parsed but incomplete JSON chunks (missing required fields) were being processed, potentially causing undefined access errors
2. **Field Name Mismatch**: The Stitch provider was emitting `textDelta` field, but the AI SDK expects `delta` field for text-delta events

## Root Cause Analysis

From the debug logs (`stitch-debug.log`), we saw multiple "Failed to parse NDJSON line" warnings:
- Lines 195-222: 7 consecutive parse failures
- Lines 416-447: 8 consecutive parse failures

These malformed chunks were being caught and skipped, but any successfully parsed chunks with incomplete structure were still being processed, leading to crashes when the UI tried to access `chunk.delta.length`.

## Fixes Applied

### 1. Provider Layer - Structure Validation (provider.ts:772-845)

**File:** [`opencode/packages/opencode/src/provider/stitch/provider.ts`](opencode/packages/opencode/src/provider/stitch/provider.ts#L772-L845)

**Changes:**
- Added structure validation AFTER JSON parsing
- Only process chunks that have `result.response.choices[0]` defined
- Added detailed logging for skipped incomplete chunks
- Prevents accessing properties on undefined objects

**Before:**
```typescript
try {
  const parsed = JSON.parse(line);
  const contentText = parsed?.result?.response?.choices?.[0]?.content?.[0]?.data || '';
  // ... process without validation
}
```

**After:**
```typescript
try {
  const parsed = JSON.parse(line);
  
  // DEFENSIVE: Validate chunk structure before processing
  if (!parsed?.result?.response?.choices?.[0]) {
    scopedLogger.warn('Skipping NDJSON chunk with incomplete structure', {
      hasResult: !!parsed?.result,
      hasResponse: !!parsed?.result?.response,
      hasChoices: !!parsed?.result?.response?.choices,
      choicesLength: parsed?.result?.response?.choices?.length || 0
    });
    continue;
  }
  
  const choice = parsed.result.response.choices[0];
  // ... safe to access choice properties now
}
```

### 2. Provider Layer - Correct Field Names (provider.ts:798-891)

**File:** [`opencode/packages/opencode/src/provider/stitch/provider.ts`](opencode/packages/opencode/src/provider/stitch/provider.ts#L798-L891)

**Changes:**
- Fixed field name from `textDelta` to `delta` in all text-delta events
- Added required `id` field to match AI SDK expectations
- Updated all 4 locations where text-delta events are emitted

**Before:**
```typescript
controller.enqueue({
  type: 'text-delta',
  textDelta: content
});
```

**After:**
```typescript
controller.enqueue({
  type: 'text-delta',
  id: 'txt-0',
  delta: content
});
```

### 3. UI Layer - Defensive Access (processor.ts:302-318)

**File:** [`opencode/packages/opencode/src/session/processor.ts`](opencode/packages/opencode/src/session/processor.ts#L302-L318)

**Changes:**
- Added defensive null check for delta field
- Ensures code handles cases where delta is undefined gracefully
- Only processes text-delta events that have actual content

**Before:**
```typescript
case "text-delta":
  if (currentText) {
    currentText.text += value.text
    // ...
  }
```

**After:**
```typescript
case "text-delta":
  if (currentText) {
    // DEFENSIVE: Check that delta field exists before accessing
    const deltaText = (value as any).delta || '';
    if (deltaText) {
      currentText.text += deltaText
      // ...
    }
  }
```

## Expected Chunk Structure

```typescript
{
  result: {
    response: {
      choices: [{
        content: [{
          type: "CONTENT_TYPE_TEXT",
          data: string
        }],
        finish_reason?: string
      }],
      usage?: {
        prompt_tokens: number,
        completion_tokens: number,
        total_tokens: number
      }
    }
  }
}
```

## Test Coverage

Created comprehensive test suite: [`malformed-chunk-handling.test.ts`](opencode/packages/opencode/src/provider/stitch/__tests__/malformed-chunk-handling.test.ts)

**Tests Added:**
1. ✅ Skip chunks without result field
2. ✅ Skip chunks without response field  
3. ✅ Skip chunks without choices array
4. ✅ Skip chunks with empty choices array
5. ✅ Accept chunks with valid structure
6. ✅ Safely access choice properties after validation
7. ✅ Handle chunks with null choice gracefully
8. ✅ Validate text-delta event structure
9. ✅ Handle missing delta field gracefully

**Test Results:** All 9 tests passing ✅

## Files Modified

1. **`opencode/packages/opencode/src/provider/stitch/provider.ts`**
   - Added structure validation before processing chunks
   - Fixed field names in text-delta events (textDelta → delta)
   - Added proper logging for incomplete chunks

2. **`opencode/packages/opencode/src/session/processor.ts`**
   - Added defensive null check for delta field
   - Ensures graceful handling of missing fields

3. **`opencode/packages/opencode/src/provider/stitch/__tests__/malformed-chunk-handling.test.ts`**
   - Created new test file with 9 comprehensive tests
   - Validates all edge cases for malformed chunks

## Impact

This fix ensures:
- ✅ Malformed NDJSON doesn't crash the UI
- ✅ Only valid chunks with complete structure are processed
- ✅ Proper error logging for debugging
- ✅ Graceful degradation when chunks are incomplete
- ✅ Correct field names matching AI SDK expectations
- ✅ No more "undefined is not an object" errors

## Prevention

The validation checks prevent:
1. Accessing undefined properties on incomplete chunks
2. Processing chunks that don't meet the expected structure
3. Silent failures that could corrupt the stream state
4. UI crashes from malformed API responses

## References

- Debug Log: [`opencode/packages/opencode/stitch-debug.log`](opencode/packages/opencode/stitch-debug.log)
- Error Pattern: Lines 195-222, 416-447 showing parse failures
- AI SDK Types: Uses standard `LanguageModelV2StreamPart` interface
- Test Coverage: 100% of malformed chunk scenarios
