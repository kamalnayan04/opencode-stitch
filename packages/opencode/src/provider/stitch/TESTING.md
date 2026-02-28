
# Native Stitch Provider Testing Guide

## Overview

The native Stitch provider is a complete implementation of the Vercel AI SDK v2 `LanguageModelV2` and `ProviderV1` interfaces, replacing the brittle "OpenAI SSE Spoofing" approach with native tool schema injection and JSON tool call parsing.

## Feature Flag

The native provider is **disabled by default** and must be explicitly enabled via feature flag:

```bash
export OPENCODE_USE_NATIVE_STITCH_PROVIDER=true
```

When disabled, the system falls back to the existing Stitch transformer implementation.

## Prerequisites

### 1. Environment Configuration

Set the following environment variables:

```bash
# Enable native Stitch provider
export OPENCODE_USE_NATIVE_STITCH_PROVIDER=true

# Stitch API configuration
export STITCH_API_URL="https://your-stitch-backend.com/v1/chat/completions"
export STITCH_API_KEY="your-api-key-here"

# Enable debug logging (optional but recommended for testing)
export STITCH_DEBUG=true
```

### 2. Model Configuration

Ensure your `opencode.json` or models configuration includes a Stitch model using the native provider:

```json
{
  "provider": {
    "stitch": {
      "npm": "@opencode/stitch",
      "options": {
        "baseURL": "https://your-stitch-backend.com/v1/chat/completions",
        "apiKey": "${STITCH_API_KEY}"
      }
    }
  }
}
```

## Testing Commands

### Test 1: Simple Text Generation (No Tools)

**Purpose:** Verify basic text generation without tool calls.

```bash
bun run --cwd packages/opencode dev run "What is 2+2?"
```

**Expected Behavior:**
- Provider initializes with debug log (if `STITCH_DEBUG=true`)
- Model responds with simple text answer
- CLI exits cleanly without infinite loading

**Debug Output Should Show:**
```
[Stitch Provider] Initialized native provider { modelId: '...', baseURL: '...', hasApiKey: true }
```

### Test 2: Tool Call Execution

**Purpose:** Verify tool schema injection and tool call execution.

```bash
bun run --cwd packages/opencode dev run "Read the file package.json and tell me the version"
```

**Expected Behavior:**
1. Tools are injected into first user message
2. Model responds with JSON tool call format
3. JsonToolParser extracts the tool call
4. AI SDK executes the `read_file` tool
5. Tool result is passed back to model
6. Model provides final answer
7. CLI exits cleanly

**Debug Output Should Show:**
```
[Stitch Provider] Initialized native provider
[Stitch Provider] Injecting tools into prompt { toolCount: X, toolNames: ['read_file', ...] }
[Stitch Provider] Tools injected successfully
[Stitch Stream] Emitted tool call: read_file
```

### Test 3: Multiple Tool Calls

**Purpose:** Verify sequential tool call handling.

```bash
bun run --cwd packages/opencode dev run "Read package.json and then list files in src/"
```

**Expected Behavior:**
- Multiple tool calls are detected and executed in sequence
- Each tool result is properly formatted and sent back
- Model integrates results and provides comprehensive answer

### Test 4: Streaming Behavior

**Purpose:** Verify proper stream termination and event emission.

```bash
bun run --cwd packages/opencode dev run "Write a short poem about TypeScript"
```

**Expected Behavior:**
- Text streams in real-time (text-delta events)
- Stream terminates with finish event
- No infinite loading or hanging
- CLI exits cleanly

## Debugging Failed Tests

### Issue: Infinite Loading UI

**Symptom:** CLI spins forever at the end, never exits.

**Diagnosis:**
1. Check if `finish` event is being emitted
2. Verify NDJSON stream terminates properly
3. Look for `finishReason` in API response

**Debug Commands:**
```bash
# Enable detailed logging
export STITCH_DEBUG=true

# Check stream transformer logs
grep "\[Stitch Stream\]" debug.log
```

### Issue: Tool Not Executed

**Symptom:** Model mentions using a tool but nothing happens.

**Diagnosis:**
1. Check if tool schemas were injected
2. Verify JSON format matches expected pattern
3. Confirm JsonToolParser detected the tool call

**Debug Output to Look For:**
```
[Stitch Provider] Injecting tools into prompt
[Stitch Stream] Emitted tool call: <tool_name>
```

### Issue: API 400 Error

**Symptom:** Request fails with 400 Bad Request.

**Common Causes:**
- Empty string in message content
- Missing role alternation (consecutive same-role messages)
- Invalid message format

**Fix:**
Check message conversion in `convertMessages()` function.

### Issue: Argument Mapping Failed

**Symptom:** Tool executes but arguments are incorrect.

**Diagnosis:**
Verify JsonToolParser extracts arguments correctly:

```typescript
// Expected output format:
{
  id: 'call_...',
  type: 'function',
  function: {
    name: 'tool_name',
    arguments: '{"param":"value"}' // Must be JSON string
  }
}
```

## Success Criteria

✅ **Test Passes When:**
1. Provider initializes without errors
2. Tools are injected into prompt (debug log confirms)
3. Model returns tool calls in JSON format
4. JsonToolParser successfully extracts tool calls
5. AI SDK executes tools and passes results back
6. Model provides final answer using tool results
7. Stream terminates cleanly (no hanging)
8. CLI exits with code 0

## Comparison: Native vs. Legacy

| Aspect | Native Provider | Legacy (SSE Spoofing) |
|--------|----------------|----------------------|
| **Tool Schema** | Injected in prompt | Native SDK format (stripped by proxy) |
| **Tool Detection** | JsonToolParser | XML parsing |
| **Streaming** | NDJSON → AI SDK events | NDJSON → SSE → AI SDK |
| **Integration** | Native AI SDK interfaces | Custom transformers |
| **Maintenance** | Easier (follows SDK patterns) | Complex (multi-layer transforms) |

## Rollback Plan

If native provider has issues, **disable the feature flag**:

```bash
export OPENCODE_USE_NATIVE_STITCH_PROVIDER=false
# or simply unset it
unset OPENCODE_USE_NATIVE_STITCH_PROVIDER
```

The system will automatically fall back to the existing Stitch transformer implementation.

## Implementation Files

- **Provider:** [`packages/opencode/src/provider/stitch/provider.ts`](./provider.ts)
- **Tool Injection:** [`packages/opencode/src/provider/stitch/tool-injection.ts`](./tool-injection.ts)
- **Types:** [`packages/opencode/src/provider/stitch/provider-types.ts`](./provider-types.ts)
- **Parser:** [`packages/opencode/src/provider/stitch/transform.ts`](./transform.ts)
- **Feature Flag:** [`packages/opencode/src/flag/flag.ts`](../../flag/flag.ts:58)
- **Registration:** [`packages/opencode/src/provider/provider.ts`](../provider.ts:130-155)

## Next Steps After Testing

1. **Verify Performance:** Compare response times vs. legacy implementation
2. **Monitor Error Rates:** Track API errors and tool execution failures
3. **Collect Metrics:** Tool usage, streaming reliability, finish rate
4. **Gradual Rollout:** Enable for internal testing first, then broader release
5. **Documentation:** Update user-facing docs with new provider usage

## Support

For issues or questions:
- Check debug logs with `STITCH_DEBUG=true`
- Review implementation files listed above
- Consult architecture document in task description
