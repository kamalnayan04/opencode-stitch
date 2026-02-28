
# Critical Fixes Applied to StitchLanguageModel Provider

**Date:** 2026-02-26  
**File:** `packages/opencode/src/provider/stitch/provider.ts`  
**Function:** `convertMessages()`

## Summary

Applied 4 critical fixes to prevent agent amnesia, support parallel tools, and ensure strict role alternation in the Stitch native Vercel AI provider.

## Fixes Applied

### 1. ✅ Assistant Amnesia Fix (Lines 111-115)
**Problem:** The assistant was forgetting its tool call history because `tool-call` content parts were being ignored.

**Solution:** Now reconstructs JSON tool calls when processing assistant messages:
```typescript
if (part.type === 'tool-call') {
  // Reconstruct the JSON tool call so Sisyphus remembers its history
  const args = typeof part.args === 'string' ? JSON.parse(part.args) : part.args;
  return JSON.stringify({ tool: part.toolName, parameters: args }, null, 2);
}
```

### 2. ✅ Parallel Tool Results Support (Lines 87-94)
**Problem:** Only the first tool result was being processed; parallel tool results were dropped.

**Solution:** Maps through ALL tool result parts and joins them:
```typescript
content = message.content.map(part => {
  if (part.type === 'tool-result') {
    const resultStr = typeof part.result === 'string' ? part.result : JSON.stringify(part.result);
    return `Tool "${part.toolName}" result:\n${resultStr}`;
  }
  return '';
}).filter(Boolean).join('\n\n');
```

### 3. ✅ Role Alternation Enforcement (Lines 130-138)
**Problem:** Consecutive messages with the same role caused 400 Bad Request errors.

**Solution:** Collapses consecutive same-role messages:
```typescript
const collapsedMessages: StitchApiRequest['request']['messages'] = [];
for (const msg of stitchMessages) {
  if (collapsedMessages.length > 0 && collapsedMessages[collapsedMessages.length - 1].role === msg.role) {
    collapsedMessages[collapsedMessages.length - 1].content[0].data += '\n\n' + msg.content[0].data;
  } else {
    collapsedMessages.push(msg);
  }
}
```

### 4. ✅ Build Verification
- TypeScript compilation: ✅ Success (exit code 0)
- No syntax errors in provider.ts
- All imports and types resolve correctly

## Impact

These fixes ensure:
- **Memory Persistence:** The assistant now remembers all previous tool calls in the conversation
- **Parallel Tool Handling:** Multiple simultaneous tool results are properly processed
- **API Compliance:** Consecutive role messages are merged to prevent validation errors
- **Conversation Continuity:** Tool call history is preserved across multi-turn interactions

## Testing Recommendations

1. Test multi-turn conversations with tool calls
2. Verify parallel tool execution (multiple tools called simultaneously)
3. Confirm role alternation in edge cases (consecutive tool results)
4. Validate conversation history persistence across turns
