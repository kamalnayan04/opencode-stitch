
# CRITICAL FIX: Loader Spinning Forever Issue

## 🔴 Root Cause Identified

**Problem:** The loader keeps spinning even though `</attempt_completion>` appears in the message.

**Root Cause:** `attempt_completion` was incorrectly included in `KNOWN_TOOL_TAGS` at line 58 in [`stream.ts`](src/provider/stitch/stream.ts:58), causing the XML interceptor to treat it as a tool call instead of a system message tag.

### Why This Broke the Loader

1. When the assistant sends `<attempt_completion>...</attempt_completion>`, the XML interceptor:
   - Detects `<attempt_completion>` as a "tool call"
   - Starts buffering the content
   - Converts it to a tool_calls chunk
   - **NEVER emits the text content as regular message content**

2. The UI expects `<attempt_completion>` to be visible text in the message, not a tool call

3. Because the content is intercepted, the message appears "incomplete" to the UI

4. The loader waits for the message to complete, but it never receives the completion marker as text

5. **Result:** Infinite loader spinning ⚙️∞

## ✅ The Fix

### 1. Created SYSTEM_TAGS Exclusion List

```typescript
/**
 * System/message tags that should NOT be intercepted as tool calls.
 * These are formatting/structural tags used by the assistant for message organization,
 * not actual tool invocations.
 */
const SYSTEM_TAGS = new Set([
  'thinking',           // Claude's reasoning process
  'attempt_completion', // System completion marker - CRITICAL!
  'result',            // Result container
  'feedback',          // User feedback container
  'error',             // Error messages
  'response',          // Generic response wrapper
  'message',           // Message wrapper
  'content',           // Content wrapper
  'antml:thinking',    // Anthropic thinking tags
  'antml:invoke',      // Anthropic invoke tags
]);
```

### 2. Updated Tag Detection Logic

Modified [`detectToolTagOpening()`](src/provider/stitch/stream.ts:345) to skip system tags:

```typescript
function detectToolTagOpening(text: string, knownTags: string[]): string | null {
  for (const tag of knownTags) {
    if (text.includes(`<${tag}>`)) {
      // CRITICAL: Don't intercept system/message tags
      if (SYSTEM_TAGS.has(tag)) {
        console.log('[Stitch Stream] Ignoring system tag:', tag);
        continue;
      }
      return tag;
    }
  }
  return null;
}
```

### 3. Removed from KNOWN_TOOL_TAGS

Removed `'attempt_completion'` from the tool tags array since it's now properly categorized as a system tag.

### 4. Removed from Tool Name Mapping

Removed `'attempt_completion': 'task'` mapping since it should never be converted to a tool call.

## 📊 System Tags vs Tool Tags

### System Tags (Should NOT Be Intercepted)

These are **formatting/structural** tags used for message organization:

| Tag | Purpose | Why Not Intercepted |
|-----|---------|---------------------|
| `<thinking>` | Claude's reasoning process | Internal thought process, not an action |
| `<attempt_completion>` | Completion marker | UI signal, not a tool invocation |
| `<result>` | Result container | Formatting wrapper |
| `<feedback>` | User feedback | Message structure |
| `<error>` | Error messages | Message content |
| `<response>` | Response wrapper | Formatting |
| `<message>` | Message container | Structure |
| `<content>` | Content wrapper | Structure |

### Tool Tags (Should Be Intercepted)

These are **actual tool invocations** that trigger actions:

| Tag | OpenCode Tool | Purpose |
|-----|---------------|---------|
| `<read_file>` | `read` | Read file contents |
| `<write_to_file>` | `write` | Write file |
| `<apply_diff>` | `edit` | Apply code changes |
| `<execute_command>` | `bash` | Run commands |
| `<search_files>` | `grep` | Search codebase |
| `<vector_query>` | `explore` | Semantic search |
| `<ask_followup_question>` | `question` | Ask user |
| `<new_task>` | `task` | Create subtask |
| `<switch_mode>` | `task` | Change mode |

## 🔍 Industry Standard XML Tags Research

### Anthropic Claude

**System Tags:**
- `<thinking>` - Internal reasoning (should not intercept)
- `<search_quality_reflection>` - Quality assessment
- `<search_quality_score>` - Numerical score
- `