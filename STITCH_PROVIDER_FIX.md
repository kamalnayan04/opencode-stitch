
# Stitch Provider Streaming Fix

## Problem Identified

The Stitch provider was not receiving streaming responses from the server. The root cause was:

1. **URL correctly rewritten** to `/stream-chat-completion` ✓
2. **Server returns 200 OK** ✓  
3. **BUT**: Response had `content-length: 225` (fixed-size, not chunked) ✗
4. **OpenCode was hanging** waiting for streaming chunks that never arrived ✗

## Root Cause Analysis

After examining the `stitch-cli` project at `/Users/kamal.nayan@grofers.com/StudioProjects/stitch-cli`, I discovered that:

- **Stitch API uses a completely different request format** than OpenAI's API
- The `@ai-sdk/openai-compatible` SDK was sending OpenAI format, but Stitch expects its own custom format
- There is NO `stream: true` parameter - streaming is controlled by the endpoint itself

### Request Format Comparison

**OpenAI Format (what SDK was sending):**
```json
{
  "model": "stitch-1",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "temperature": 1,
  "max_tokens": 8192
}
```

**Stitch Format (what it expects):**
```json
{
  "request": {
    "model": "stitch-1",
    "fallback_model": "stitch-1",
    "messages": [
      {
        "role": "MESSAGE_ROLE_USER",
        "content": [
          {"type": "CONTENT_TYPE_TEXT", "data": "Hello"}
        ]
      }
    ],
    "config": {
      "temperature": 1,
      "max_tokens": 8192
    },
    "client_options": {
      "source": "opencode",
      "retry_options": {"max_retries": 1},
      "request_options": {
        "content_type": "application/json",
        "timeout_ms": 600000
      }
    }
  }
}
```

## Changes Made

### File: `packages/opencode/src/provider/provider.ts`

#### 1. Added Request Body Logging (Lines ~1178-1230)
- Log the original request body to debug streaming configuration
- Transform OpenAI format to Stitch format before sending

#### 2. Request Format Transformation
```typescript
// Transform OpenAI messages to Stitch format
const transformMessage = (msg: any) => {
  const role = msg.role === 'user' ? 'MESSAGE_ROLE_USER' 
    : msg.role === 'assistant' ? 'MESSAGE_ROLE_ASSISTANT'
    : msg.role === 'system' ? 'MESSAGE_ROLE_SYSTEM'
    : 'MESSAGE_ROLE_USER'
  
  const content = typeof msg.content === 'string'
    ? [{ type: 'CONTENT_TYPE_TEXT', data: msg.content }]
    : // ... handle array content
  
  return { role, content }
}

// Build Stitch request format with proper wrapping
const stitchRequest = {
  request: {
    model: bodyObj.model,
    fallback_model: bodyObj.model,
    messages: (bodyObj.messages || []).map(transformMessage),
    config: {
      temperature: bodyObj.temperature ?? 1,
      max_tokens: bodyObj.max_tokens ?? 8192
    },
    client_options: {
      source: 'opencode',
      retry_options: { max_retries: 1 },
      request_options: {
        content_type: 'application/json',
        timeout_ms: 600000
      }
    }
  }
}
```

#### 3. Added Streaming Headers (Lines ~1101-1126)
```typescript
// Add streaming headers for Stitch provider
const streamingHeaders = new Headers(opts.headers || {})
streamingHeaders.set('Accept', 'text/event-stream')
opts.headers = Object.fromEntries(streamingHeaders.entries())
```

## Expected Behavior After Fix

1. ✅ URL is rewritten to `/stream-chat-completion`
2. ✅ Request body is transformed to Stitch format with `request` wrapper
3. ✅ Messages are converted to Stitch's role/content structure
4. ✅ Proper streaming headers are added (`Accept: text/event-stream`)
5. ✅ Configuration includes client_options for proper request handling
6. ✅ Server should now return chunked streaming response
7. ✅ OpenCode should receive and process streaming chunks properly

## Testing

To verify the fix works:

```bash
cd packages/opencode
./bin/opencode run hello --model stitch/stitch-1 --print-logs
```

Check the logs for:
- `[STITCH-DEBUG] Transformed request body:` - Should show Stitch format
- Response should be chunked (no content-length header)
- Streaming chunks should be received and processed

## References

- Stitch CLI implementation: `/Users/kamal.nayan@grofers.com/StudioProjects/stitch-cli/src/ai/gateway-client.ts`
- Lines 65-76: Request format and headers
- Lines 232-319: buildRequest method showing Stitch format structure
