
# GAP-8: NDJSON Schema Validation Implementation

## Summary
Implemented schema validation for NDJSON chunks from stitch-backend to prevent silent failures when backend changes response format.

## Implementation (TDD Approach)

### Step 1: Tests First (RED Phase)
Created comprehensive test suite **BEFORE** implementation:
- **File**: `__tests__/ndjson-schema-validation.test.ts`
- **Tests**: 15 test cases covering:
  - Valid NDJSON structure validation
  - Invalid structure detection (null result, null response, null choices, wrong fields)
  - Error logging with detailed messages
  - Mixed valid/invalid chunk handling
  - Backward compatibility
  - Performance impact (< 5% overhead)

### Step 2: Implementation (GREEN Phase)
Modified `stream.ts` to add validation:

1. **Added Zod Schema** (lines 36-92):
   ```typescript
   const StitchStreamChunkSchema = z.object({
     result: z.object({
       response: z.object({
         model: z.string().optional(),
         choices: z.array(z.object({
           index: z.number(),
           content: z.any().optional(),
           // ... other fields
         })).optional(),
         usage: z.any().optional(),
         metadata: z.any().optional(),
         status: z.any().optional()
       }).optional(),
       error: z.any().optional()
     }).optional(),
     error: z.any().optional()
   }).passthrough().refine(/* custom validation */)
   ```

2. **Added Validation Logic** (lines 199-211):
   ```typescript
   // GAP-8: Validate parsed chunk against schema
   const validationResult = StitchStreamChunkSchema.safeParse(parsed);
   if (!validationResult.success) {
     console.error('[Stitch Stream] Invalid chunk structure:', {
       errors: validationResult.error.errors,
       chunk: trimmedLine
     });
     // Skip this invalid chunk and continue processing
     continue;
   }
   
   // Use validated chunk for further processing
   const validChunk = validationResult.data;
   ```

3. **Updated All References**: Changed `parsed` → `validChunk` throughout processing logic to use validated data.

## Validation Rules

The schema catches these issues:
- ✅ Missing `result` or `error` fields
- ✅ Explicitly null `result` field
- ✅ Null `response` within result
- ✅ Null or non-array `choices`
- ✅ Invalid choice structure (non-object, wrong types)
- ✅ Wrong field names at top level

The schema allows:
- ✅ Optional fields (model, usage, metadata, status)
- ✅ Additional unknown fields (via `.passthrough()`)
- ✅ Empty arrays and missing optional fields
- ✅ All existing valid chunk formats

## Test Results

### New Tests (GAP-8)
```
✅ 15/15 tests passing
- Valid structures: 3/3 passing
- Invalid structures: 6/6 passing  
- Error logging: 2/2 passing
- Mixed chunks: 1/1 passing
- Backward compatibility: 2/2 passing
- Performance: 1/1 passing
```

### Regression Testing
```
✅ error-status-handling.test.ts: 14/14 passing
✅ usage-metadata.test.ts: 11/11 passing
✅ integration.test.ts (streaming): 16/19 passing
   (3 pre-existing failures in request transformation, unrelated to validation)
```

## Impact

### Benefits
1. **Early Detection**: Invalid chunks are caught immediately with detailed error logs
2. **Resilience**: Future backend changes won't cause silent failures
3. **Debugging**: Error messages include both validation errors and original chunk data
4. **Performance**: < 5% overhead (validated with 100-chunk test)

### No Breaking Changes
- All existing valid chunks continue to process correctly
- Error handling is additive (logs errors but continues processing)
- Schema is intentionally permissive to allow evolution

## Example Error Output

```javascript
[Stitch Stream] Invalid chunk structure: {
  errors: [
    {
      code: 'custom',
      message: 'Invalid chunk structure detected',
      path: []
    }
  ],
  chunk: '{"result":null}'
}
```

## Files Modified
1. `src/provider/stitch/stream.ts` - Added schema validation
2. `src/provider/stitch/__tests__/ndjson-schema-validation.test.ts` - New test suite

## Compliance with TDD Workflow
✅ Tests written FIRST before implementation  
✅ Tests failed initially (RED phase confirmed)  
✅ Implementation made tests pass (GREEN phase achieved)  
✅ No regression in existing tests  
✅ Code is clean and well-documented
