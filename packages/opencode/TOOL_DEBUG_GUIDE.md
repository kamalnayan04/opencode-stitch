
# Tool Request Debugging Guide

## Issue Description

Tools are appearing as normal chat messages with XML commands in logs instead of being sent as native proto definitions. This guide will help trace the transformation pipeline to identify where tools are being converted to text.

## Added Logging Locations

### 1. Request Entry Point (`request.ts`)

**Location:** `openCodeToStitchRequest()` function start (line ~62)

**What it logs:**
- Input request has tools (yes/no)
- Tool count and names
- Message count and roles
- Input message structure before transformation

**Look for:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[DEBUG-TOOLS] openCodeToStitchRequest() ENTRY
[DEBUG-TOOLS] Input openCodeReq has tools: true
[DEBUG-TOOLS] Tool count: 1
[DEBUG-TOOLS] Tool names: ['get_weather']
```

### 2. Message Transformation (`request.ts`)

**Location:** Before/after `openCodeToStitchMessages()` call (line ~68-95)

**What it logs:**
- Input messages to transform function
- Transformed message count
- Transformed message structure
- Content types and text previews

**Look for:**
```
[DEBUG-TOOLS] About to call openCodeToStitchMessages()
[DEBUG-TOOLS] After openCodeToStitchMessages()
[DEBUG-TOOLS] Transformed message count: 2
```

### 3. Tool Configuration (`request.ts`)

**Location:** After adding tools to config (line ~310-327)

**What it logs:**
- Tools added to config.tools
- Full config.tools structure

**Look for:**
```
[DEBUG-TOOLS] ✅ Tools added to config.tools
[DEBUG-TOOLS] config.tools: [
  {
    "type": 1,
    "function": {
      "name": "get_weather",
      ...
    }
  }
]
```

### 4. Final Request Structure (`request.ts`)

**Location:** Before returning stitchRequest (line ~493-540)

**What it logs:**
- Final tools count in request.tools and config.tools
- All messages with content inspection
- Whether message data contains tool-related content (⚠️ WARNING if found)
- Tool choice configuration

**Look for:**
```
[DEBUG-TOOLS] ━━━ FINAL stitchReq STRUCTURE ━━━
[DEBUG-TOOLS] stitchReq.request.tools: 1 tools
[DEBUG-TOOLS] stitchReq.request.config.tools: 1 tools
[DEBUG-TOOLS] stitchReq.request.messages: 2 messages
[DEBUG-TOOLS] Message inspection:
[DEBUG-TOOLS]   Message 0:
[DEBUG-TOOLS]     Role: MESSAGE_ROLE_USER
[DEBUG-TOOLS]     Content blocks: 1
[DEBUG-TOOLS]       Block 0: type=1
[DEBUG-TOOLS]       Data preview: What's the weather?
```

### 5. Transform Function Entry (`transform.ts`)

**Location:** `openCodeToStitchMessages()` start (line ~589)

**What it logs:**
- Input message count
- Each message being processed
- Message role, tool_calls presence, content type

**Look for:**
```
[DEBUG-TRANSFORM] openCodeToStitchMessages() ENTRY
[DEBUG-TRANSFORM] Input message count: 2
[DEBUG-TRANSFORM] Processing message 0:
[DEBUG-TRANSFORM]   Role: user
[DEBUG-TRANSFORM]   Has tool_calls: false
[DEBUG-TRANSFORM]   Content type: string
```

### 6. Tool Result Handling (`transform.ts`)

**Location:** Tool result message detection (line ~644-662)

**What it logs:**
- Tool result detection
- Tool call ID, content, and name
- Confirmation of native proto handling

**Look for:**
```
[DEBUG-TRANSFORM] 🔧 Tool result message detected
[DEBUG-TRANSFORM]   tool_call_id: call_123
[DEBUG-TRANSFORM]   content: Result data here
[DEBUG-TRANSFORM]   name: get_weather
[DEBUG-TRANSFORM]   Returning as-is for native proto handling
```

### 7. Provider Integration (`provider.ts`)

**Location:** Before calling transformation (line ~1263-1278)

**What it logs:**
- Tools in bodyObj before transformation
- Tool names
- Transformed request structure
- Tools present in different locations

**Look for:**
```
[DEBUG-PROVIDER] About to transform request for Stitch
[DEBUG-PROVIDER] Has tools in bodyObj: true
[DEBUG-PROVIDER] Tools: ['get_weather']
[DEBUG-PROVIDER] Transformed request ready
[DEBUG-PROVIDER] stitchRequest.request has tools field: true
[DEBUG-PROVIDER] stitchRequest.request.config has tools field: true
```

---

## Running the Debug Session

### 1. Build the Project

```bash
cd opencode/packages/opencode
bun install
bun run build
```

### 2. Run with Logging Enabled

```bash
cd opencode/packages/opencode
bun run --conditions=browser ./src/index.ts
```

The logging will automatically appear in console output (no environment variable needed).

### 3. Trigger Tool Use

In the chat interface, send a message that would trigger tool use:
- "What's the weather in San Francisco?"
- "Search for files containing 'authentication'"
- Any task that requires tool invocation

---

## Analyzing the Logs

### ✅ Good Signs (Tools Working Correctly)

1. **Tools Present Throughout Pipeline:**
```
[DEBUG-TOOLS] Input openCodeReq has tools: true
[DEBUG-TOOLS] ✅ Tools added to config.tools
[DEBUG-TOOLS] ✅ Tools added to stitchRequest.request.tools
```

2. **No Tool Content in Messages:**
```
[DEBUG-TOOLS] Message 0:
[DEBUG-TOOLS]   Block 0: type=1
[DEBUG-TOOLS]   Data preview: What's the weather?
// NO WARNING about tool-related content
```

3. **Clean Message Structure:**
```
[DEBUG-TRANSFORM] Processing message 0:
[DEBUG-TRANSFORM]   Role: user
[DEBUG-TRANSFORM]   Content type: string
// Simple user message, no XML
```

### ❌ Bad Signs (Tools as Text)

1. **Tools Missing from Structure:**
```
[DEBUG-TOOLS] stitchReq.request.tools: undefined
[DEBUG-TOOLS] stitchReq.request.config.tools: undefined
```

2. **Tool Content in Messages:**
```
[DEBUG-TOOLS]   Data preview: <get_weather><location>...
[DEBUG-TOOLS]   ⚠️  WARNING: Data contains tool-related content!
```

3. **XML in Assistant Messages:**
```
[DEBUG-TRANSFORM]   Content type: string
[DEBUG-TRANSFORM]   Text preview: Let me search for that.<grep>...
```

---

## Common Issues to Check

### Issue 1: Tools Being Injected into System Messages

**Check:** Look for tools in system message content blocks

**Logs to examine:**
```
[DEBUG-TOOLS] Message 0:
[DEBUG-TOOLS]   Role: MESSAGE_ROLE_SYSTEM
[DEBUG-TOOLS]   Data preview: ...
```

**Expected:** System messages should NOT contain tool definitions as text

**Fix Location:** `request.ts` - ensure system message handling doesn't inject tools

---

### Issue 2: Transform Pipeline Converting to XML

**Check:** Are assistant messages being converted to XML format?

**Logs to examine:**
```
[DEBUG-TRANSFORM] Processing message 1:
[DEBUG-TRANSFORM]   Role: assistant
[DEBUG-TRANSFORM]   Has tool_calls: true
```

**Expected:** Tool calls should be preserved in native format, not converted to XML

**Fix Location:** `transform.ts` - the `openCodeToStitchMessages()` function

---

### Issue 3: Provider Not Passing Tools

**Check:** Are tools reaching the transformation layer?

**Logs to examine:**
```
[DEBUG-PROVIDER] Has tools in bodyObj: false
```

**Expected:** Tools should be present in bodyObj

**Fix Location:** `provider.ts` - check earlier in the request pipeline

---

### Issue 4: Message Collapsing Breaking Tool Handling

**Check:** Are tool-related messages being incorrectly merged?

**Logs to examine:**
```
[DEBUG-TOOLS] Collapsed 5 messages to 2 messages
[DEBUG-TOOLS]   ⚠️  WARNING: Data contains tool-related content!
```

**Expected:** Tool messages should NOT be collapsed with other messages

**Fix Location:** `request.ts` - message collapsing logic around line 219-251

---

### Issue 5: Tools Added But Not Sent

**Check:** Are tools in the structure but not serialized correctly?

**Logs to examine:**
```
[DEBUG-TOOLS] ✅ Tools added to config.tools
// But in API logs: no tools field in JSON
```

**Expected:** Tools should appear in final JSON body

**Fix Location:** Check JSON serialization and proto encoding

---

## Debug Report Template

After running with logging, create a report with:

### 1. Request Entry
- Did tools come into `openCodeToStitchRequest()`?
- How many tools and what names?

### 2. Transform Process
- How were messages transformed?
- Were tool_calls detected?
- Were tool results handled correctly?

### 3. Final Output
- Are tools in `request.tools`?
- Are tools in `request.config.tools`?
- Do any messages contain tool-related text?

### 4. Problem Identification
- Where exactly do tools become text?
- Which function/line is responsible?

### 5. Root Cause
- Why is the transformation failing?
- What code change caused this?

---

## Expected Output Example

### Correct Tool Handling

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[DEBUG-TOOLS] openCodeToStitchRequest() ENTRY
[DEBUG-TOOLS] Input openCodeReq has tools: true
[DEBUG-TOOLS] Tool count: 1
[DEBUG-TOOLS] Tool names: ['get_weather']
[DEBUG-TOOLS] Message count: 1
[DEBUG-TOOLS] Message roles: ['user']
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[DEBUG-TRANSFORM] openCodeToStitchMessages() ENTRY
[DEBUG-TRANSFORM] Input message count: 1
[DEBUG-TRANSFORM] Processing message 0:
[DEBUG-TRANSFORM]   Role: user
[DEBUG-TRANSFORM]   Has tool_calls: false
[DEBUG-TRANSFORM]   Content type: string

[DEBUG-TOOLS] ✅ Tools added to config.tools
[DEBUG-TOOLS] config.tools: [
  {
    "type": 1,
    "function": {
      "name": "get_weather",
      "description": "Get weather information",
      "parameters": {...}
    }
  }
]

[DEBUG-TOOLS] ✅ Tools added to stitchRequest.request.tools
[DEBUG-TOOLS] stitchRequest.request.tools: [...]

[DEBUG-TOOLS] ━━━ FINAL stitchReq STRUCTURE ━━━
[DEBUG-TOOLS] stitchReq.request.tools: 1 tools
[DEBUG-TOOLS] stitchReq.request.config.tools: 1 tools
[DEBUG-TOOLS] stitchReq.request.messages: 1 messages
[DEBUG-TOOLS] Message inspection:
[DEBUG-TOOLS]   Message 0:
[DEBUG-TOOLS]     Role: MESSAGE_ROLE_USER
[DEBUG-TOOLS]     Content blocks: 1
[DEBUG-TOOLS]       Block 0: type=1
[DEBUG-TOOLS]       Data preview: What's the weather in San Francisco?
[DEBUG-TOOLS] stitchReq.request.config.tool_choice: 1
[DEBUG-TOOLS] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[DEBUG-PROVIDER] About to transform request for Stitch
[DEBUG-PROVIDER] Has tools in bodyObj: true
[DEBUG-PROVIDER] Tools: ['get_weather']
[DEBUG-PROVIDER] Transformed request ready
[DEBUG-PROVIDER] stitchRequest.request has tools field: true
[DEBUG-PROVIDER] stitchRequest.request.config has tools field: true
```

---

## Next Steps After Debugging

1. **Identify the exact location** where tools are being converted to text
2. **Check the commit history** to see what changed
3. **Compare with working code** (if available from git history)
4. **Fix the root cause** - likely in:
   - Message transformation (`transform.ts`)
   - System message handling (`request.ts`)
   - Tool serialization logic
5. **Verify the fix** by checking logs show ✅ markers and no ⚠️ warnings
6. **Test tool execution** end-to-end

---

## Removing Debug Logging

After debugging is complete, search for and remove all:
- `[DEBUG-TOOLS]` log statements
- `[DEBUG-TRANSFORM]` log statements  
- `[DEBUG-PROVIDER]` log statements

Or keep them behind an environment variable:
```typescript
if (process.env.DEBUG_TOOLS === 'true') {
  console.log('[DEBUG-TOOLS] ...');
}
```
