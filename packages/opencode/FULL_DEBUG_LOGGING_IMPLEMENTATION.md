
# Full Debug Logging Implementation - Complete

## Overview

Comprehensive debug logging has been added to trace the complete request/response flow from provider through to UI consumer. All logs are written to `stitch-debug.log` in the opencode directory.

## Files Modified

### 1. Provider Side: [`src/provider/stitch/provider.ts`](src/provider/stitch/provider.ts)

**Added logging at every critical point in the streaming flow:**

#### Request Phase (Lines 554-580)
- 🚀 Request details (URL, headers, body size, model, message count)
- 📥 Response received (status, headers, body presence)
- ✅ Response validation passed

#### Stream Initialization (Lines 603-615)
- 🎬 Stream start() called
- 📖 Reader initialized
- Starting read loop

#### Chunk Processing (Lines 837-845)
- 📦 RAW CHUNK for each incoming chunk with:
  - Chunk number and byte count
  - Raw bytes preview
  - Decoded text preview
  - Buffer size

#### NDJSON Parsing (Lines 890-910)
- 🔍 Parsing each NDJSON line
- ✅ Successfully parsed with full structure details:
  - Has result/response/choices
  - Content type and data preview
  - Finish reason and usage info

#### Event Emission (Lines 1006-1090)
- 🔧 XML parser invoked with content
- 🔍 Parser result details
- 📤 EMITTING text-start event
- ✅ text-start enqueued successfully
- 📤 EMITTING text-delta event with preview
- ✅ text-delta enqueued successfully
- 📤 EMITTING tool-call events
- ✅ tool-call enqueued
- 📤 EMITTING text-end event
- ✅ text-end enqueued successfully
- 📤 EMITTING finish event
- ✅ finish event enqueued successfully

#### Stream Completion (Lines 822-830)
- 🏁 doStream COMPLETE with duration and stats
- 🔒 Closing stream controller
- ✅ Stream controller closed

### 2. Consumer Side: [`src/session/processor.ts`](src/session/processor.ts)

**Added logging for event consumption:**

#### Stream Start (Lines 45-70)
- 🎯 Calling LLM.stream()
- ✅ LLM.stream() returned
- 📥 CONSUMER RECEIVED EVENT for each event with:
  - Event number
  - Event type
  - Keys present in event

#### Event Processing (Lines 58-380)
- 🎬 Stream START event
- 🧠 Reasoning-start event
- 🔧 Tool-input-start event
- 🔨 Tool-call event
- 📝 TEXT-START event received
- 💬 TEXT-DELTA event received with:
  - Delta preview (first 50 chars)
  - Delta length
  - Total text accumulated
- 🏁 TEXT-END event received
- 🎉 FINISH event received
- ⚠️  Unhandled event type (if any)
- 🔚 Stream consumption complete

## Log File Location

**Primary Log:** `opencode/packages/opencode/stitch-debug.log`

The debug logger automatically:
- Creates the file on first write
- Appends all subsequent logs
- Includes timestamps, correlation IDs, and log levels
- Sanitizes sensitive data (API keys, tokens)
- Truncates large payloads

## Environment Variables

### STITCH_DEBUG (Default: enabled)

The logger is **enabled by default** unless explicitly disabled:

```bash
# Logging is ON by default (no need to set)
# To disable:
export STITCH_DEBUG=false
```

The logger checks: `process.env.STITCH_DEBUG !== 'false'`

This means:
- ✅ Not set → **Logging ENABLED**
- ✅ Set to 'true' → **Logging ENABLED**  
- ❌ Set to 'false' → **Logging DISABLED**

## How to Use

### 1. Clear Previous Logs
```bash
cd opencode/packages/opencode
> stitch-debug.log
```

### 2. Run a Chat Session
```bash
# From project root
cd opencode
bun run --cwd packages/opencode dev run "Hello, can you help me?"
```

### 3. Analyze the Logs
```bash
cd packages/opencode
cat stitch-debug.log
```

## Log Format

Each log entry includes:
```
[2026-02-28T01:05:00.123Z] [DEBUG] [req-1234567890-abc123] 📦 RAW CHUNK
{
  "chunkNumber": 1,
  "byteCount": 256,
  "decodedPreview": "{\"result\":{\"response\"..."
}
```

- **Timestamp:** ISO 8601 format with milliseconds
- **Level:** TRACE, DEBUG, INFO, WARN, ERROR
- **Correlation ID:** Unique ID per request (e.g., `req-1234567890-abc123`)
- **Message:** Descriptive message with emoji for easy scanning
- **Data:** JSON object with relevant context

## Key Diagnostic Points

### To Find Where Flow Breaks:

1. **Request sent?**
   - Look for: `🚀 Sending stream request`
   - Check: URL, headers, body size

2. **Response received?**
   - Look for: `📥 Response received`
   - Check: status=200, ok=true, hasBody=true

3. **Chunks arriving?**
   - Look for: `📦 RAW CHUNK`
   - Check: Multiple chunks, increasing byte counts

4. **NDJSON parsing?**
   - Look for: `✅ Successfully parsed NDJSON`
   - Check: hasChoices=true, hasContent=true

5. **Events emitted?**
   - Look for: `📤 EMITTING text-start`
   - Look for: `📤 EMITTING text-delta`
   - Check: Multiple deltas with content

6. **Events received by consumer?**
   - Look for: `📥 CONSUMER RECEIVED EVENT`
   - Check: text-start, text-delta events present

7. **Events processed?**
   - Look for: `📝 TEXT-START event received`
   - Look for: `💬 TEXT-DELTA event received`
   - Check: Delta applied, text length increasing

8. **Stream completed?**
   - Look for: `🏁 doStream COMPLETE`
   - Look for: `🔚 Stream consumption complete`

## Expected Log Sequence (Successful Flow)

```
[INFO] 🎯 Calling LLM.stream()
[INFO] ✅ LLM.stream() returned
[INFO] doStream START
[DEBUG] 🚀 Sending stream request
[DEBUG] 📥 Response received (status: 200, ok: true)
[DEBUG] ✅ Response validation passed
[DEBUG] 🎬 Stream start() called
[DEBUG] 📖 Reader initialized
[DEBUG] 📦 RAW CHUNK (chunk 1)
[DEBUG] 🔍 Parsing NDJSON line
[DEBUG] ✅ Successfully parsed NDJSON
[DEBUG] 🔧 XML parser invoked
[DEBUG] 🔍 Parser result (hasContent: true)
[DEBUG] 📤 EMITTING text-start event
[DEBUG] ✅ text-start enqueued successfully
[INFO] 📥 CONSUMER RECEIVED EVENT (type: text-start)
[INFO] 📝 TEXT-START event received
[DEBUG] ✅ Text part created and saved
[DEBUG] 📦 RAW CHUNK (chunk 2)
[DEBUG] 🔍 Parsing NDJSON line
[DEBUG] ✅ Successfully parsed NDJSON
[DEBUG] 📤 EMITTING text-delta event
[DEBUG] ✅ text-delta enqueued successfully
[INFO] 📥 CONSUMER RECEIVED EVENT (type: text-delta)
[DEBUG] 💬 TEXT-DELTA event received (delta: "Hello...")
[DEBUG] ✅ Delta applied (totalLength: 5)
... (more deltas)
[DEBUG] 📤 EMITTING finish event
[DEBUG] ✅ finish event enqueued successfully
[INFO] 📥 CONSUMER RECEIVED EVENT (type: finish)
[INFO] 🎉 FINISH event received
[INFO] 🏁 doStream COMPLETE (duration: 1234ms)
[INFO] 🔚 Stream consumption complete
```

## Troubleshooting Common Issues

### Issue: "Thinking only" without messages

**What to look for in logs:**

1. **Events NOT being emitted:**
   ```
   ✅ Successfully parsed NDJSON
   🔧 XML parser invoked
   🔍 Parser result (hasContent: false)  ← NO CONTENT!
   ```
   → Problem: Parser not extracting content

2. **Events emitted but NOT received:**
   ```
   📤 EMITTING text-delta event
   ✅ text-delta enqueued successfully
   [No CONSUMER RECEIVED EVENT follows]
   ```
   → Problem: Stream not being consumed

3. **Events received but NOT processed:**
   ```
   📥 CONSUMER RECEIVED EVENT (type: text-delta)
   ❌ text-delta received but currentText is undefined!
   ```
   → Problem: text-start never created currentText

### Issue: Stream hangs/never completes

**What to look for:**
```
📦 RAW CHUNK (last chunk)
✅ Successfully parsed NDJSON
[No finish event follows]
```
→ Problem: Backend not sending finish_reason

### Issue: No chunks arriving

**What to look for:**
```
📥 Response received (status: 200, ok: true, hasBody: true)
🎬 Stream start() called
📖 Reader initialized
[No RAW CHUNK appears]
```
→ Problem: Backend stream not sending data

## Testing Checklist

- [ ] Log file created at `opencode/packages/opencode/stitch-debug.log`
- [ ] Request logged with full details
- [ ] Response received with status 200
- [ ] Multiple chunks logged
- [ ] NDJSON parsing successful
- [ ] text-start event emitted
- [ ] Multiple text-delta events emitted
- [ ] text-delta events received by consumer
- [ ] Text parts created and updated
- [ ] finish event emitted and received
- [ ] Stream completed successfully

## Next Steps

1. **Run the chat** and generate logs
2. **Check the log file** for the complete flow
3. **Identify the break point** using the diagnostic points above
4. **Report findings** with specific log entries showing where flow stops

## Implementation Complete ✅

All logging infrastructure is now in place to trace the complete request/response flow from provider → stream → consumer → UI.
