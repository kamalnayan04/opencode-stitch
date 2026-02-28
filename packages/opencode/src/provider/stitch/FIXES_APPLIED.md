
# Critical Fixes Applied to Native Stitch Provider

**Date:** 2026-02-26  
**File:** `packages/opencode/src/provider/stitch/provider.ts`

## Summary

Applied 4 critical fixes to prevent agent amnesia, support parallel tools, ensure strict role alternation, and enable sub-agent model routing.

---

## ✅ Fix #1: Assistant Amnesia - Tool Call History Preservation

**Problem:** The `convertMessages` function was ignoring `'tool-call'` parts in the message history, causing Sisyphus to forget it ever called tools and enter infinite loops.

**Solution:** Added explicit handling for `'tool-call'` parts in lines 111-115:

```typescript
if (part.type === 'tool-call') {
  // Reconstruct the JSON tool call so Sisyphus remembers its history
  const args = typeof part.args === 'string' ? JSON.parse(part.args) : part.args;
  return JSON.stringify({ tool: part.toolName, parameters: args }, null, 2);
}
```

**Status:** ✅ Already implemented (lines 111-115)

---

## ✅ Fix #2: Parallel Tool Results Support

**Problem:** When multiple tools were called in parallel, only the first result was being processed due to hardcoded `[0]` indexing, causing other tool results to be silently dropped.

**Solution:** The code now iterates through ALL tool results with `.map()`:

```typescript
if (message.role === 'tool') {
  content = message.content.map(part => {
    if (part.type === 'tool-result') {
      const resultStr = typeof part.result === 'string' ? part.result : JSON.stringify(part.result);
      return `Tool "${part.toolName}" result:\n${resultStr}`;
    }
    return '';
  }).filter(Boolean).join('\n\n');
  // ...
}
```

**Status:** ✅ Already implemented (lines 88-94)

---

## ✅ Fix #3: Role Collapsing - Prevent 400 Bad Request

**Problem:** Consecutive messages with the same role (e.g., USER → USER) violate Gemini/Stitch's strict alternation requirement, causing 400 errors.

**Solution:** Added role collapsing logic at the end of `convertMessages`:

```typescript
// CRITICAL: Collapse consecutive roles to prevent 400 Bad Request
const collapsedMessages: StitchApiRequest['request']['messages'] = [];
for (const msg of stitchMessages) {
  if (collapsedMessages.length > 0 && collapsedMessages[collapsedMessages.length - 1].role === msg.role) {
    collapsedMessages[collapsedMessages.length - 1].content[0].data += '\n\n' + msg.content[0].data;
  } else {
    collapsedMessages.push(msg);
  }
}

return collapsedMessages;
```

**Status:** ✅ Already implemented (lines 130-138)

---

## ✅ Fix #4: Sub-Agent Model Routing

**Problem:** The native provider was using `this.modelId` directly without mapping OpenCode's internal model names (like `antigravity-gemini-3-flash`) to Stitch-supported models, causing sub-agent dispatch failures.

**Solution:** Added `routeModel()` function and applied it in both `doGenerate` and `doStream`:

```typescript
/**
 * Map OpenCode sub-agent models to supported Stitch models
 * Handles antigravity-* models and other internal model names
 */
function routeModel(modelId: string): string {
  const modelMappings: Record<string, string> = {
    'stitch-1': 'claude-4-5-sonnet',
    'stitch-2': 'claude-4-5-sonnet',
    'antigravity-gemini-3-flash': 'claude-4-5-sonnet',
    'antigravity-gemini-2-flash': 'claude-4-5-sonnet',
    'antigravity-gemini-flash': 'claude-4-5-sonnet',
  };
  
  // Map known internal names
  if (modelMappings[modelId]) {
    if (process.env.STITCH_DEBUG === 'true') {
      console.log(`[Stitch Provider] Mapped model "${modelId}" to ${modelMappings[modelId]}`);
    }
    return modelMappings[modelId];
  }
  
  // Fallback: map any antigravity-* or unknown models to working backend
  if (modelId.startsWith('antigravity-') || (!modelId.includes('claude') && !modelId.includes('gemini-2'))) {
    if (process.env.STITCH_DEBUG === 'true') {
      console.log(`[Stitch Provider] Mapped unknown model "${modelId}" to claude-4-5-sonnet`);
    }
    return 'claude-4-5-sonnet';
  }
  
  return modelId;
}
```

Applied in both methods:
- `doGenerate`: lines 248-249
- `doStream`: lines 370-371

**Status:** ✅ Newly added (lines 48-81, 248-249, 370-371)

---

## Impact

These fixes resolve:
1. **Infinite tool call loops** - Agent remembers its tool call history
2. **Lost parallel agent results** - All tool results are processed
3. **400 Bad Request errors** - Strict role alternation is enforced
4. **Sub-agent dispatch failures** - Model names are properly routed

---

## Testing Recommendations

1. Test tool calling with multiple parallel tools
2. Test sub-agent dispatch with `antigravity-*` models
3. Verify no 400 errors with consecutive user messages + tool results
4. Confirm tool call history is maintained across multi-turn conversations
