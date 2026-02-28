
# Native Stitch Provider - Feature Flag Implementation

## Overview

The native Stitch provider is a complete reimplementation of the Stitch integration using Vercel AI SDK v2's native interfaces (`LanguageModelV2` and `ProviderV1`). It replaces the previous "OpenAI SSE Spoofing" approach with clean, maintainable code that properly handles tool schemas through prompt injection.

## Feature Flag System

### Current Status: 🚧 **Disabled by Default**

The native provider is protected by a feature flag and **must be explicitly enabled** for testing and evaluation. This allows safe deployment and rollback without code changes.

### Enabling the Native Provider

Set the environment variable before running OpenCode:

```bash
export OPENCODE_USE_NATIVE_STITCH_PROVIDER=true
```

### Disabling (Rollback)

To revert to the legacy implementation:

```bash
export OPENCODE_USE_NATIVE_STITCH_PROVIDER=false
# or simply unset it
unset OPENCODE_USE_NATIVE_STITCH_PROVIDER
```

## Architecture

### Key Components

1. **StitchLanguageModel** ([`provider.ts:139-503`](./provider.ts))
   - Implements `LanguageModelV2` interface
   - Handles both streaming (`doStream`) and non-streaming (`doGenerate`) modes
   - Native NDJSON stream parsing with proper event emission

2. **Tool Injection** ([`tool-injection.ts`](./tool-injection.ts))
   - Serializes AI SDK tools to compact JSON
   - Injects schemas into first user message
   - Provides strict formatting instructions to model

3. **JsonToolParser** ([`transform.ts:82-200`](./transform.ts))
   - Stateful streaming parser
   - Extracts JSON tool calls from model output
   - Handles incomplete JSON across chunk boundaries

### Integration Points

**Feature Flag Check** ([`flag.ts:58`](../../flag/flag.ts)):
```typescript
export const OPENCODE_USE_NATIVE_STITCH_PROVIDER = truthy("OPENCODE_USE_NATIVE_STITCH_PROVIDER")
```

**Conditional Provider Registration** ([`provider.ts:130-155`](../provider.ts)):
```typescript
const BUNDLED_PROVIDERS: Record<string, (options: any) => SDK> = {
  // ... other providers
  ...(Flag.OPENCODE_USE_NATIVE_STITCH_PROVIDER ? { "@opencode/stitch": createStitch } : {}),
}
```

When the flag is **false** or **unset**, the `@opencode/stitch` provider is not registered, and the system falls back to the existing Stitch transformer with OpenAI-compatible format conversion.

## Implementation Details

### Tool Schema Injection

**Problem:** Backend proxy strips native AI SDK tool schemas from requests.

**Solution:** Inject tool schemas directly into the prompt as JSON with strict formatting instructions.

**Format:**
```json
{
  "tools": [
    {
      "name": "read_file",
      "description": "Read the contents of a file",
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "File path" }
        },
        "required": ["path"]
      }
    }
  ]
}
```

**Instructions to Model:**
```
When you need to use a tool, output ONLY valid JSON:
{ "tool_invocation": true, "tool": "tool_name", "parameters": {...} }
```

### Streaming Implementation

**Input:** NDJSON stream from Stitch API
```json
{"result":{"response":{"choices":[{"content":[{"type":"CONTENT_TYPE_TEXT","data":"Hello"}]}]}}}
{"result":{"response":{"choices":[{"content":[{"type":"CONTENT_TYPE_TEXT","data":" world"}]}]}}}
{"result":{"response":{"choices":[{"finish_reason":"FINISH_REASON_STOP"}]}}}
```

**Processing:**
1. Read NDJSON stream chunk by chunk
2. Buffer incomplete JSON lines
3. Parse complete lines
4. Feed content to `JsonToolParser`
5. Emit AI SDK events based on parser output

**Output:** Native AI SDK v2 events
```typescript
// Text content
{ type: 'text-delta', textDelta: 'Hello world' }

// Tool calls
{ type: 'tool-call', toolCallType: 'function', toolCallId: 'call_123', toolName: 'read_file', args: '{"path":"..."}' }

// Stream completion
{ type: 'finish', finishReason: 'stop', usage: { promptTokens: 10, completionTokens: 5 } }
```

### Non-Streaming Implementation

Similar to streaming but:
1. Makes single HTTP request
2. Waits for complete response
3. Parses with `JsonToolParser`
4. Returns synchronous result

## Advantages Over Legacy Implementation

| Aspect | Native Provider | Legacy (SSE Spoofing) |
|--------|----------------|----------------------|
| **Code Complexity** | ~500 lines, single purpose | ~2000+ lines, multi-layer transforms |
| **Maintenance** | Follows AI SDK patterns | Custom transform logic |
| **Tool Handling** | Prompt injection (reliable) | Schema stripping (fragile) |
| **Debugging** | Straightforward event flow | Multi-hop transformations |
| **Performance** | Direct NDJSON → Events | NDJSON → SSE → Events |
| **Type Safety** | Native SDK types | Custom type conversions |
| **Error Handling** | SDK error handlers | Custom error mapping |

## Debug Logging

Enable comprehensive debug output:

```bash
export STITCH_DEBUG=true
```

**Sample Debug Output:**
```
[Stitch Provider] Initialized native provider {
  modelId: 'claude-4-sonnet',
  baseURL: 'https://api.stitch.tech/v1/chat/completions',
  hasApiKey: true
}
[Stitch Provider] Injecting tools into prompt {
  toolCount: 15,
  toolNames: ['read_file', 'write_file', 'search_files', ...]
}
[Stitch Provider] Tools injected successfully
[Stitch Stream] Using JsonToolParser for JSON tool interception
[Stitch Stream] Emitted tool call: read_file
[Stitch Stream] Finish reason detected: tool_calls - emitted [DONE]
```

## Testing Checklist

Before enabling in production:

- [ ] Simple text generation works without tools
- [ ] Tool calls are correctly injected into prompt
- [ ] JsonToolParser extracts tool calls from JSON output
- [ ] AI SDK executes tools and passes results back
- [ ] Model uses tool results in final response
- [ ] Streaming terminates cleanly (no hanging)
- [ ] Error handling works for API failures
- [ ] Performance is comparable to legacy implementation
- [ ] No regressions in existing functionality

See [`TESTING.md`](./TESTING.md) for detailed testing procedures.

## Migration Path

### Phase 1: Internal Testing (Current)
- Feature flag **disabled** by default
- Internal team enables for testing
- Collect feedback and metrics

### Phase 2: Opt-In Beta
- Feature flag **disabled** by default
- Document how to enable
- Monitor adoption and issues

### Phase 3: Gradual Rollout
- Enable for percentage of users
- Monitor error rates
- Adjust as needed

### Phase 4: Full Migration
- Feature flag **enabled** by default
- Legacy implementation deprecated
- Plan removal of old code

## Configuration

### Via Environment Variables

```bash
# Enable native provider
export OPENCODE_USE_NATIVE_STITCH_PROVIDER=true

# Stitch API settings
export STITCH_API_URL="https://api.stitch.tech/v1/chat/completions"
export STITCH_API_KEY="your-key-here"

# Debug logging
export STITCH_DEBUG=true
```

### Via opencode.json

```json
{
  "provider": {
    "stitch": {
      "npm": "@opencode/stitch",
      "options": {
        "baseURL": "${STITCH_API_URL}",
        "apiKey": "${STITCH_API_KEY}",
        "timeout": 30000
      }
    }
  }
}
```

## Troubleshooting

### Provider Not Being Used

**Check:** Is feature flag enabled?
```bash
echo $OPENCODE_USE_NATIVE_STITCH_PROVIDER
# Should output: true
```

**Check:** Is provider registered?
```typescript
// Look for this in debug logs
[Stitch Provider] Initialized native provider
```

### Tool Calls Not Working

**Check:** Are tools being injected?
```bash
export STITCH_DEBUG=true
# Look for:
[Stitch Provider] Injecting tools into prompt
```

**Check:** Is JsonToolParser detecting calls?
```bash
# Look for:
[Stitch Stream] Emitted tool call: <tool_name>
```

### Streaming Hangs

**Check:** Is finish event being emitted?
```bash
# Look for:
[Stitch Stream] Finish reason detected: ... - emitted [DONE]
```

## Files Modified

1. [`flag.ts`](../../flag/flag.ts) - Added `OPENCODE_USE_NATIVE_STITCH_PROVIDER` flag
2. [`provider.ts`](../provider.ts) - Conditional provider registration
3. [`stitch/provider.ts`](./provider.ts) - Added debug logging

## Support

For questions or issues:
- Review [`TESTING.md`](./TESTING.md) for testing procedures
- Check debug logs with `STITCH_DEBUG=true`
- Consult architecture document in original task

## License

Same as parent project.
