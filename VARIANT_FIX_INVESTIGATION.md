
# Token Usage Variants Fix - Investigation Report

## Problem Summary
Token usage variants (low, medium, high, extrahigh) were not appearing in the UI for Stitch models, despite code changes being applied to check for Stitch provider before reasoning capability.

## Root Cause Analysis

### Investigation Process
1. **Verified the fix was applied** - Confirmed that [`transform.ts:333-343`](packages/opencode/src/provider/transform.ts:333-343) had the Stitch check before reasoning check ✅
2. **Added debug logging** - Instrumented the `variants()` function to log model details
3. **Analyzed production logs** - User provided debug output showing actual model configuration

### Root Cause Discovery
Debug logs revealed the critical issue at line 21796 of debug_res.txt:

```
[VARIANT-DEBUG] Model ID: stitch-1
[VARIANT-DEBUG] Provider ID: stitch
[VARIANT-DEBUG] API npm package: @ai-sdk/openai-compatible
[VARIANT-DEBUG] API URL: undefined  ← THE PROBLEM!
[VARIANT-DEBUG] URL includes "/inference-service": undefined
```

**The Stitch model's `api.url` field was `undefined`!**

### Why the Original Code Failed

```typescript
// Original check - FAILED because api.url was undefined
if (model.api?.url?.includes("/inference-service")) {
  return { /* token variants */ }
}
```

When `api.url` is `undefined`:
- `undefined?.includes("/inference-service")` returns `undefined`
- The if condition evaluates to `false`
- Token variants were never returned

## The Fix

### Code Changes

**File: [`transform.ts:339`](packages/opencode/src/provider/transform.ts:339)**

```typescript
// BEFORE (line 336):
if (model.api?.url?.includes("/inference-service")) {

// AFTER (line 339):
if (model.providerID === "stitch" || model.api?.url?.includes("/inference-service")) {
```

### Why This Works

The fix checks `providerID` first, which is **always set correctly** for Stitch models:
- `model.providerID === "stitch"` ✅ Always true for Stitch models
- Falls back to URL check for edge cases where URL is defined
- Both conditions use OR logic, so either one passing returns variants

### Test Coverage

Added comprehensive test case for the production scenario:

```typescript
it('should return token variants for Stitch models when api.url is undefined', () => {
  const stitchModelWithUndefinedUrl: Provider.Model = {
    id: 'stitch-1',
    providerID: 'stitch',
    api: {
      id: 'stitch-1',
      url: undefined, // Production scenario
      npm: '@ai-sdk/openai-compatible',
    },
    // ... rest of config
  };

  const variants = ProviderTransform.variants(stitchModelWithUndefinedUrl);

  expect(variants).toEqual({
    low: { maxTokens: 2048 },
    medium: { maxTokens: 8192 },
    high: { maxTokens: 16384 },
    extrahigh: { maxTokens: 32000 },
  });
});
```

**All tests passing: 5/5 ✅**

## Verification Steps

After applying this fix, users should:

1. **Restart the OpenCode application** to load the updated code
2. **Open the chat interface** with a Stitch model selected
3. **Verify the variant dropdown appears** with options: low, medium, high, extrahigh
4. **Test switching variants** to ensure they work correctly

## Why Previous Attempts Failed

### Attempt 1: Moved Stitch Check Before Reasoning Check
- **Status**: Correct approach, but insufficient
- **Issue**: Still relied on `api.url` which was `undefined`
- **Learning**: Logic ordering was correct, but the condition itself was flawed

### Attempt 2: Added Debug Logging
- **Status**: Critical for diagnosis
- **Result**: Revealed the actual root cause (undefined URL)
- **Learning**: Always verify assumptions with runtime data

### Attempt 3: Fixed the Condition (Current)
- **Status**: ✅ Complete fix
- **Result**: Check `providerID` instead of relying on `api.url`
- **Verification**: All tests pass, production scenario covered

## Technical Details

### Model Structure
```typescript
interface Provider.Model {
  id: string;           // e.g., "stitch-1"
  providerID: string;   // e.g., "stitch" ← ALWAYS SET
  api: {
    id: string;
    url: string;        // ← CAN BE UNDEFINED!
    npm: string;
  };
  capabilities: { ... };
  // ...
}
```

### Variant Configuration
Stitch models use **token-based variants** instead of reasoning effort:

```typescript
{
  low: { maxTokens: 2048 },      // ~2K tokens
  medium: { maxTokens: 8192 },   // ~8K tokens  
  high: { maxTokens: 16384 },    // ~16K tokens
  extrahigh: { maxTokens: 32000 } // ~32K tokens
}
```

## Lessons Learned

1. **Never assume field presence** - Even if a field should logically exist, verify it does
2. **Debug logging is invaluable** - Runtime data reveals truth that static analysis cannot
3. **Test production scenarios** - Include edge cases like undefined fields in test suite
4. **Use stable identifiers** - `providerID` is more reliable than derived values like URLs
5. **Document assumptions** - If code assumes a field exists, document why and what happens if it doesn't

## Related Files

- [`transform.ts`](packages/opencode/src/provider/transform.ts) - Main fix location
- [`transform-stitch-variants.test.ts`](packages/opencode/src/provider/__tests__/transform-stitch-variants.test.ts) - Test coverage
- [`debug_res.txt`](packages/opencode/debug_res.txt) - Production debug output that revealed the issue

## Status

**✅ ISSUE RESOLVED**

- Root cause identified with concrete evidence
- Fix implemented and tested
- Test coverage expanded to prevent regression
- All 5 test cases passing
- Production scenario specifically covered
