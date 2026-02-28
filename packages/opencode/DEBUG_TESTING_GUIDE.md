
# Debug Testing Guide - Message Flow Diagnosis

## Purpose

Test the comprehensive debug logging to identify exactly where messages stop flowing from provider → consumer → UI.

## Prerequisites

All logging code has been added to:
- ✅ [`src/provider/stitch/provider.ts`](src/provider/stitch/provider.ts) - Provider emitting events
- ✅ [`src/session/processor.ts`](src/session/processor.ts) - Consumer receiving events
- ✅ [`src/shared/logger.ts`](src/shared/logger.ts) - Logger facade
- ✅ [`src/provider/stitch/debug-logger.ts`](src/provider/stitch/debug-logger.ts) - File-based logger

## Step 1: Clear Previous Logs

```bash
cd opencode/packages/opencode
> stitch-debug.log
echo "Log file cleared - ready for testing"
```

## Step 2: Verify Environment

The logger is **enabled by default** (no need to set STITCH_DEBUG):

```bash
# Check if explicitly disabled (should not be set)
echo $STITCH_DEBUG
# If output is "false", enable it:
unset STITCH_DEBUG
```

## Step 3: Run a Simple Chat

```bash
cd opencode
bun run --cwd packages/opencode dev run "Hello, can you help me with a simple task?"
```

**Expected behavior:**
- Chat should respond (even if just "thinking")
- Log file should populate with entries

## Step 4: Analyze the Logs

```bash
cd packages/opencode
cat stitch-debug.log
```

### Look for These Key Markers:

#### A. Provider Side (Events Being Emitted)

**1. Request Phase:**
```
🚀 Sending stream request
📥 Response received
✅ Response validation passed
```

**2. Stream Reading:**
```
🎬 Stream start() called
📖 Reader initialized
📦 RAW CHUNK (multiple times)
```

**3. Parsing:**
```
🔍 Parsing NDJSON line
✅ Successfully parsed NDJSON
```

**4. Event Emission:**
```
📤 EMITTING text-start event
✅ text-start enqueued successfully
📤 EMITTING text-delta event (multiple times)
✅ text-delta enqueued successfully
```

**5. Completion:**
```
📤 EMITTING finish event
✅ finish event enqueued successfully
🏁 doStream COMPLETE
```

#### B. Consumer Side (Events Being Received)

**1. Stream Consumption:**
```
🎯 Calling LLM.stream()
✅ LLM.stream() returned
```

**2. Event Reception:**
```
📥 CONSUMER RECEIVED EVENT (type: text-start)
📥 CONSUMER RECEIVED EVENT (type: text-delta)
📥 CONSUMER RECEIVED EVENT (type: finish)
```

**3. Event Processing:**
```
📝 TEXT-START event received
✅ Text part created and saved
💬 TEXT-DELTA event received (multiple times)
✅ Delta applied
🏁 TEXT-END event received
🎉 FINISH event received
🔚 Stream consumption complete
```

## Step 5: Diagnose the Break Point

### Scenario 1: No Logs at All
**Symptom:** stitch-debug.log is empty
**Cause:** Logger not being imported or STITCH_DEBUG=false
**Fix:** 
```bash
unset STITCH_DEBUG
# Verify imports in provider.ts and processor.ts
```

### Scenario 2: Request Logs But No Response
**Symptom:** 
```
🚀 Sending stream request
[No 📥 Response received]
```
**Cause:** Network/API issue
**Fix:** Check API endpoint, credentials, network connectivity

### Scenario 3: Response But No Chunks
**Symptom:**
```
📥 Response received (status: 200, ok: true)
🎬 Stream start() called
📖 Reader initialized
[No 📦 RAW CHUNK]
```
**Cause:** Backend not streaming data
**Fix:** Check backend logs, API configuration

### Scenario 4: Chunks But No Content
**Symptom:**
```
📦 RAW CHUNK (appears multiple times)
✅ Successfully parsed NDJSON
🔧 XML parser invoked
🔍 Parser result (hasContent: false)
```
**Cause:** Parser not extracting content or backend sending empty content
**Fix:** Check parser logic, verify backend response format

### Scenario 5: Events Emitted But Not Received
**Symptom:**
```
📤 EMITTING text-delta event
✅ text-delta enqueued successfully
[No 📥 CONSUMER RECEIVED EVENT]
```
**Cause:** Stream not being consumed, consumer not connected
**Fix:** Check processor.ts stream consumption loop

### Scenario 6: Events Received But Not Processed
**Symptom:**
```
📥 CONSUMER RECEIVED EVENT (type: text-delta)
❌ text-delta received but currentText is undefined!
```
**Cause:** text-start not creating currentText or events out of order
**Fix:** Check event sequencing, verify text-start processed first

### Scenario 7: Everything Works But UI Shows "Thinking"
**Symptom:**
```
✅ Delta applied (totalLength: 150)
🔚 Stream consumption complete
```
But UI still shows "thinking only"

**Cause:** UI layer not connected to stream or message parts not being displayed
**Fix:** Check UI component, Session.updatePartDelta, message rendering

## Step 6: Generate Detailed Report

```bash
cd opencode/packages/opencode

# Count events by type
echo "=== Event Emission Count ==="
grep "📤 EMITTING" stitch-debug.log | cut -d' ' -f6- | sort | uniq -c

echo -e "\n=== Event Reception Count ==="
grep "📥 CONSUMER RECEIVED EVENT" stitch-debug.log | grep -o 'type: [^,}]*' | sort | uniq -c

echo -e "\n=== Error Count ==="
grep "ERROR\|❌" stitch-debug.log | wc -l

echo -e "\n=== Last 20 Log Entries ==="
tail -20 stitch-debug.log
```

## Step 7: Share Findings

When reporting the issue, include:

1. **Last successful point:**
   ```
   The flow stops after: [exact log entry]
   ```

2. **Missing expected entry:**
   ```
   Expected to see: [expected log entry]
   But got: [actual last entry]
   ```

3. **Relevant log excerpt:**
   ```
   [Paste 20-30 lines showing the break point]
   ```

4. **Event counts:**
   ```
   text-start emitted: X
   text-start received: Y
   text-delta emitted: X
   text-delta received: Y
   ```

## Common Patterns

### Healthy Flow Pattern:
```
🚀 → 📥 → 🎬 → 📦 → 🔍 → ✅ → 📤 → 📥 → 📝 → ✅ → 🏁
```

### Broken at Parsing:
```
🚀 → 📥 → 🎬 → 📦 → 🔍 → ❌ [ERROR: Invalid JSON]
```

### Broken at Emission:
```
🚀 → 📥 → 🎬 → 📦 → 🔍 → ✅ → [No 📤 events]
```

### Broken at Consumption:
```
📤 text-start ✅ → [No 📥 CONSUMER RECEIVED]
```

### Broken at Processing:
```
📥 CONSUMER RECEIVED (text-delta) → ❌ currentText undefined
```

## Quick Diagnosis Commands

```bash
cd opencode/packages/opencode

# Check if events are being emitted
grep "📤 EMITTING" stitch-debug.log | tail -10

# Check if events are being received
grep "📥 CONSUMER RECEIVED" stitch-debug.log | tail -10

# Check for errors
grep "ERROR\|❌" stitch-debug.log

# Check stream lifecycle
grep "🎬\|🏁\|🔚" stitch-debug.log

# Check text events specifically
grep "TEXT-START\|TEXT-DELTA\|TEXT-END" stitch-debug.log | tail -20
```

## Success Criteria

A successful flow will show:
- ✅ At least 1 text-start emitted and received
- ✅ Multiple text-delta events emitted and received
- ✅ text-end emitted and received
- ✅ finish event emitted and received
- ✅ Stream completed on both provider and consumer side

## Next Steps After Testing

Once you've identified the break point:
1. Note the exact last successful log entry
2. Note what was expected next
3. Check the code at that specific point
4. Add targeted fixes based on the diagnosis

---

**Ready to test!** Follow steps 1-6 above and report findings.
