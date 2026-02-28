
# Native Stitch Provider - Quick Start Guide

## TL;DR

The native Stitch provider is **ready but disabled by default**. Enable it for testing with:

```bash
export OPENCODE_USE_NATIVE_STITCH_PROVIDER=true
export STITCH_API_URL="your-stitch-api-url"
export STITCH_API_KEY="your-api-key"
export STITCH_DEBUG=true  # Optional: for debug logs

# Then run OpenCode
bun run --cwd packages/opencode dev run "Read package.json and tell me the version"
```

## What Was Implemented

✅ **Complete native provider** with:
- Tool schema injection into prompts
- JsonToolParser for tool call extraction
- Native NDJSON → AI SDK event streaming
- Both streaming and non-streaming modes
- Full AI SDK v2 interface compliance

✅ **Feature flag protection**:
- `OPENCODE_USE_NATIVE_STITCH_PROVIDER` environment variable
- Disabled by default for safety
- Clean rollback without code changes

✅ **Debug logging**:
- Provider initialization logs
- Tool injection confirmation
- Tool call detection tracking
- Stream completion verification

## Quick Test Commands

### 1. Simple Text (No Tools)
```bash
bun run --cwd packages/opencode dev run "What is 2+2?"
```
**Expected:** Simple answer, clean exit

### 2. Tool Execution
```bash
bun run --cwd packages/opencode dev run "Read package.json and tell me the version"
```
**Expected:** Tool is executed, result is used, clean exit

### 3. Multiple Tools
```bash
bun run --cwd packages/opencode dev run "Read package.json then list files in src/"
```
**Expected:** Both tools execute in sequence, clean exit

## Success Indicators

✅ **You'll see these debug logs:**
```
[Stitch Provider] Initialized native provider
[Stitch Provider] Injecting tools into prompt
[Stitch Stream] Emitted tool call: <tool_name>
[Stitch Stream] Finish reason detected: ... - emitted [DONE]
```

✅ **UI behavior:**
- No infinite spinning
- Tool execution messages appear
- Clean exit with results

## Rollback

If anything goes wrong:

```bash
export OPENCODE_USE_NATIVE_STITCH_PROVIDER=false
# or
unset OPENCODE_USE_NATIVE_STITCH_PROVIDER
```

System automatically falls back to legacy implementation.

## More Information

- **Detailed testing:** [`TESTING.md`](./TESTING.md)
- **Architecture & implementation:** [`NATIVE_PROVIDER_README.md`](./NATIVE_PROVIDER_README.md)
- **Source code:** [`provider.ts`](./provider.ts), [`tool-injection.ts`](./tool-injection.ts)

## Status

🚧 **Phase: Internal Testing**
- Implementation: ✅ Complete
- Feature flag: ✅ Implemented
- Documentation: ✅ Complete
- Testing: ⏳ In Progress
- Production: ❌ Not yet enabled by default
