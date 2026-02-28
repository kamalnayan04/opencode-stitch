
# Tool Request Breaking Issues - FIXED ✅

**Date:** 2026-02-26  
**Status:** All Critical Issues Resolved  

## Problem Summary

User reported that **file write and bash execution were not working**. Tool requests were failing silently - the model would generate XML tool calls, but they weren't being detected and executed.

## Root Cause Analysis

### Issue 1: Missing Tool Names in KNOWN_TOOLS ❌

**Problem:** Tool names existed in `TOOL_NAME_MAPPING` but were **missing from `KNOWN_TOOLS` array**.

**Impact:**
- `<write_file>` → Not detected as tool call, passed through as text
- `<execute>` → Not detected as tool call, passed through as text

**Example of Failure:**
```xml
<!-- Model generates this -->
<write_file>
  <path>test.ts</path>
  <content>console.log("hello");</content>
</write_file>

<!-- But XmlToolParser doesn't detect it because "write_file" not in KNOWN_TOOLS -->
<!-- Result: Printed as plain text instead of executing! ❌ -->
```

**Root Cause Location:**
- File: `transform.ts`
- Line: 28-49 (KNOWN_TOOLS array)
- Missing: `write_file`, `execute`

### Issue 2: Incomplete Argument Mappings

**Problem:** `write_file` tool had incomplete argument name mappings.

**Impact:**
- Missing `file_path` → `filePath` mapping
- Missing `content` → `content` pass-through

**Root Cause Location:**
- File: `tool-mapping.ts`
- Line: 110-114 (write_file argument mapping)
- Missing: `file_path` and `content` mappings

---

## Fixes Applied ✅

### Fix 1: Added Missing Tools to KNOWN_TOOLS

**File:** `transform.ts`  
**Lines Changed:** 28-49

**Changes:**
```typescript
export const KNOWN_TOOLS = [
  // ... existing tools ...
  'list_code_definition_names', 'apply_diff', 'write_to_file', 'write_file',  // ← Added write_file
  'insert_content', 'search_and_replace', 'perform_file_operation',
  'browser_action', 'execute_command', 'execute', 'use_mcp_tool',  // ← Added execute
  // ... rest of tools ...
];
```

**Impact:**
- ✅ `<write_file>` now detected and parsed
- ✅ `<execute>` now detected and parsed
- ✅ Both tools properly mapped to SDK equivalents

### Fix 2: Completed Argument Mappings for write_file

**File:** `tool-mapping.ts`  
**Lines Changed:** 110-115

**Changes:**
```typescript
'write_file': {
  'path': 'filePath',
  'file_path': 'filePath',    // ← Added
  'content': 'content',       // ← Added
},
```

**Impact:**
- ✅ Handles both `path` and `file_path` argument names
- ✅ Properly passes through `content` field
- ✅ Auto-generates required `description` field

### Fix 3: Added Argument Mappings for execute

**File:** `tool-mapping.ts`  
**Lines Changed:** 214-218

**Changes:**
```typescript
'execute': {
  'command': 'command',
  'cmd': 'command',
},
```

**Impact:**
- ✅ Handles both `command` and `cmd` argument names
- ✅ Properly maps to `bash` tool in SDK
- ✅ Auto-generates required `description` field

---

## Verification Tests ✅

### Test Suite 1: Tool Detection Fixes

**File:** `__tests__/tool-detection-fixes.test.ts`  
**Results:** 11/11 tests passing ✅

**Coverage:**
1. ✅ `write_file` in KNOWN_TOOLS
2. ✅ `execute` in KNOWN_TOOLS
3. ✅ `<write_file>` XML detected and parsed
4. ✅ `<execute>` XML detected and parsed
5. ✅ Auto-generated descriptions for both tools
6. ✅ Argument name variations handled
7. ✅ Tools intercepted (not passed as text)
8. ✅ Multiple tool calls work correctly

### Test Suite 2: Transform Tests

**File:** `__tests__/transform.test.ts`  
**Results:** 18/18 tests passing ✅

**Coverage:**
1. ✅ Simple XML parsing
2. ✅ Multiple arguments
3. ✅ Type conversion (boolean, number)
4. ✅ Partial XML across chunks
5. ✅ Multiple sequential tool calls
6. ✅ Function_calls format
7. ✅ System tag exclusion
8. ✅ Bidirectional transformation
9. ✅ Reverse argument mapping

---

## Tool Call Flow (Now Working) ✅

```
┌─────────────────────────────────────────────┐
│ 1. Model generates XML                      │
│    <write_file>                             │
│      <path>test.ts</path>                   │
│      <content>code</content>                │
│    </write_file>                            │
└──────────────┬──────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────┐
│ 2. XmlToolParser detects tool               │
│    - Checks if "write_file" in KNOWN_TOOLS  │
│    - ✅ Found! (was missing before)         │
│    - Extracts XML content                   │
└──────────────┬──────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────┐
│ 3. Tool mapping transforms                  │
│    - Tool name: write_file → write          │
│    - Arguments: path → filePath             │
│    - Auto-add: description field            │
└──────────────┬──────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────┐
│ 4. SDK receives tool call                   │
│    {                                        │
│      name: "write",                         │
│      arguments: {                           │
│        filePath: "test.ts",                 │
│        content: "code",                     │
│        description: "Write to test.ts"      │
│      }                                      │
│    }                                        │
└──────────────┬──────────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────────┐
│ 5. Tool executed successfully! ✅            │
│    File created on disk                     │
└─────────────────────────────────────────────┘
```

---

## Testing Examples

### Example 1: File Write (Now Works ✅)

**Input XML:**
```xml
<write_file>
  <path>src/app.ts</path>
  <content>console.log("hello");</content>
</write_file>
```

**Parsed Tool Call:**
```json
{
  "id": "call_1772056249666_m5qb5bh",
  "type": "function",
  "function": {
    "name": "write",
    "arguments": "{\"filePath\":\"src/app.ts\",\"content\":\"console.log(\\\"hello\\\");\",\"description\":\"Write to src/app.ts\"}"
  }
}
```

**Result:** ✅ File created successfully

### Example 2: Bash Command (Now Works ✅)

**Input XML:**
```xml
<execute>
  <command>npm test</command>
</execute>
```

**Parsed Tool Call:**
```json
{
  "id": "call_1772056250123_x7yz8ab",
  "type": "function",
  "function": {
    "name": "bash",
    "arguments": "{\"command\":\"npm test\",\"description\":\"npm test\"}"
  }
}
```

**Result:** ✅ Command executed successfully

---

## Debug Logging

Enable debug mode to see tool detection in action:

```bash
export STITCH_DEBUG=true
```

**Example Output:**
```
[XmlToolParser] Tool opening detected: write_file (matchLength: 12)
[XmlToolParser] Original tool: write_file, mapped: write
[XmlToolParser] Original args: { path: 'test.ts', content: 'code' }
[XmlToolParser] Mapped args: { filePath: 'test.ts', content: 'code', description: 'Write to test.ts' }
[Tool Mapping] Generated description for write: "Write to test.ts"
[XmlToolParser] Tool call created: write { filePath: 'test.ts', content: 'code', description: 'Write to test.ts' }
```

---

## Summary of Changes

### Files Modified

1. **transform.ts**
   - Added `write_file` to KNOWN_TOOLS (line 40)
   - Added `execute` to KNOWN_TOOLS (line 42)

2. **tool-mapping.ts**
   - Completed `write_file` argument mappings (lines 110-115)
   - Added `execute` argument mappings (lines 214-218)

3. **__tests__/transform.test.ts**
   - Updated tests to expect mapped argument names (lines 11-28, 89-99, 189-229)

4. **__tests__/tool-detection-fixes.test.ts** (NEW)
   - Comprehensive test suite for the fixes (115 lines)

### Test Results

- ✅ 11/11 new tests passing (tool-detection-fixes.test.ts)
- ✅ 18/18 existing tests passing (transform.test.ts)
- ✅ **29 total tests passing**
- ✅ **0 failures**

---

## Success Criteria Met ✅

- ✅ File write creates actual files on disk
- ✅ Bash commands execute and return output  
- ✅ Debug logs show complete flow working
- ✅ No schema validation errors
- ✅ No missing required fields
- ✅ All tool name variations recognized
- ✅ Argument mappings complete and correct
- ✅ All tests passing

---

## Related Documentation

- [XML Tool Transform](./XML_TOOL_TRANSFORM.md) - XML ↔ JSON transformation
- [Tool Mapping](./TOOL_MAPPING.md) - Tool name and argument mappings
- [Stream Transformer](./stream.ts) - NDJSON → SSE streaming

---

**Status:** ✅ ALL CRITICAL ISSUES RESOLVED  
**Breaking Issues:** FIXED  
**Tool Functionality:** RESTORED
