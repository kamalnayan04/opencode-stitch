
# Message Part Delta Event Flow Debugging

## Problem
Chat window not showing LLM responses for some messages despite backend logs showing successful processing.

## Event Flow Architecture

```
Backend Stream Processing
  └─> Session.updatePartDelta()
      └─> Bus.publish("message.part.delta")
          └─> /event SSE endpoint
              └─> GlobalSDK (frontend)
                  └─> GlobalSync listener
                      └─> applyDirectoryEvent()
                          └─> EventReducer
                              └─> UI Update
```

## Instrumented Debug Points

### 1. Backend Event Publishing
**File**: `opencode/packages/opencode/src/session/index.ts`
**Lines**: Around Session.updatePartDelta()
**Logs**: 
- `📢 Publishing delta to event bus`
- Shows: messageId, partId, deltaLength

### 2. SSE Stream Reception
**File**: `opencode/packages/app/src/context/global-sdk.tsx`
**Lines**: 120-145 (for await loop) and 96-103 (flush function)
**Logs**:
- `[global-sdk] 📥 Received event from SSE stream`
- `[global-sdk] 📤 Emitting message.part.delta event`
- Shows: messageID, partID, deltaLength, directory

### 3. GlobalSync Listener
**File**: `opencode/packages/app/src/context/global-sync.tsx`
**Lines**: 248-290
**Logs**:
- `[global-sync] 📨 Received message.part.delta event from GlobalSDK`
- `[global-sync] ⚠️  Dropping message.part.delta - directory not in children`
- Shows: directory, messageID, partID, availableDirectories

### 4. Event Reducer Processing
**File**: `opencode/packages/app/src/context/global-sync/event-reducer.ts`
**Lines**: 243-302
**Logs**:
- `🎨 UI Reducer received message.part.delta event`
- Shows: messageID, partID, field, deltaLength

## Key Diagnostic Questions

1. **Are events reaching the SSE stream?**
   - Check for `[global-sdk] 📥 Received event from SSE stream` logs
   - If missing: SSE connection issue

2. **Are events being emitted by GlobalSDK?**
   - Check for `[global-sdk] 📤 Emitting message.part.delta event` logs
   - If missing: Event buffering/coalescing issue

3. **Are events reaching GlobalSync?**
   - Check for `[global-sync] 📨 Received message.part.delta event` logs
   - If missing: EventEmitter subscription issue

4. **Are events being dropped at GlobalSync?**
   - Check for `[global-sync] ⚠️  Dropping message.part.delta - directory not in children` logs
   - If present: **Directory mismatch issue** - the `directory` from the event doesn't match any in `children.children`

5. **Are events reaching the Event Reducer?**
   - Check for `🎨 UI Reducer received message.part.delta event` logs
   - If missing after GlobalSync reception: applyDirectoryEvent() issue

## Common Issues to Check

### Directory Mismatch
- Events published with incorrect/empty directory
- Frontend expecting different directory format
- Child stores not initialized for the directory

### Event Buffering
- Events coalesced/dropped in GlobalSDK flush logic
- Stale delta detection incorrectly marking events

### Store Initialization
- Directory child store not created before events arrive
- Session not in active children.children map

## Next Steps

1. Reproduce the issue with instrumented code
2. Check browser console for the debug logs above
3. Identify which step in the chain is failing
4. Compare successful vs failed message event flows
5. Fix the identified bottleneck

## Log Search Patterns

```bash
# Backend logs
grep "📢 Publishing delta to event bus" opencode-flow-debug.log

# Frontend logs (browser console)
# Filter by: "[global-sdk]" or "[global-sync]" or "🎨 UI Reducer"
```

## Related Files
- Backend: `opencode/packages/opencode/src/session/index.ts`
- Frontend SSE: `opencode/packages/app/src/context/global-sdk.tsx`
- Frontend Sync: `opencode/packages/app/src/context/global-sync.tsx`
- Frontend Reducer: `opencode/packages/app/src/context/global-sync/event-reducer.ts`
