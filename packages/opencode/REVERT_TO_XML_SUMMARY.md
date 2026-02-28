
# Revert from JSON to XML Parsing - Implementation Summary

## Context
The Sisyphus AI provider was outputting unparseable "pseudo-JSON" when forced away from its native XML fine-tuning. This implementation reverts to XML instructions and the XML State Machine parser.

## Changes Implemented

### ✅ Step 1: Reverted Tool Injection to XML
**File:** `src/provider/stitch/tool-injection.ts`

Changed `createToolInstructions()` to return XML format instructions:
- Removed JSON formatting instructions
- Added strict XML tag format instructions
- Updated examples to show XML format

### ✅ Step 2: Swapped Parser in Native Provider
**File:** `src/provider/stitch/provider.ts`

- **Line 38:** Changed import from `JsonToolParser` to `XmlToolParser`
- **Line 297:** Updated `doGenerate()` to use `new XmlToolParser()`
- **Line 429:** Updated `doStream()` to use `new XmlToolParser()`

### ✅ Step 3: Fixed Assistant Amnesia (Tool History Translation)
**File:** `src/provider/stitch/provider.ts`

Updated `convertMessages()` function (lines 147-156) to map tool calls to XML format:
```typescript
if (part.type === 'tool-call') {
  const args = typeof part.args === 'string' ? JSON.parse(part.args) : part.args;
  let xml = `<${part.toolName}>\n`;
  for (const [k, v] of Object.entries(args)) {
    const valStr = typeof v === 'object' ? JSON.stringify(v) : v;
    xml += `  <${k}>${valStr}</${k}>\n`;
  }
  xml += `</${part.toolName}>`;
  return xml;
}
```

### ✅ Step 4: Ensured Sub-Agent Tools Support
**Files:** `src/provider/stitch/transform.ts` and `src/provider/stitch/tool-mapping.ts`

#### transform.ts
- **Line 46:** Added `'list_directory'` to KNOWN_TOOLS array

#### tool-mapping.ts
- **Line 69:** Added `'list_directory': 'bash'` mapping
- **Line 301:** Added `case 'list_directory':` to custom command generator
- **Line 346:** Updated mapArguments to handle both `list_dir` and `list_directory`

**Note:** The `task` tool already preserves all arguments (agent, prompt) via the existing fallback logic in mapArguments (line 367).

## Verification

### Test Results
All XML parser tests pass successfully:
```bash
bun test src/provider/stitch/__tests__/transform.test.ts
✅ 18 pass, 0 fail
```

### Expected Behavior
The system should now:
1. ✅ Successfully stream XML tool calls from Sisyphus
2. ✅ Intercept them cleanly with the State Machine parser
3. ✅ Execute tools natively via the Vercel AI SDK
4. ✅ Preserve tool call history in XML format for context
5. ✅ Support sub-agent tools (task, list_dir, list_directory)

## Files Modified
1. `src/provider/stitch/tool-injection.ts` - XML instructions
2. `src/provider/stitch/provider.ts` - Parser swap and history translation
3. `src/provider/stitch/transform.ts` - Added list_directory to KNOWN_TOOLS
4. `src/provider/stitch/tool-mapping.ts` - Added list_directory mappings

## Status
✅ **Implementation Complete and Verified**

All steps executed successfully with test verification confirming XML parsing works correctly.
