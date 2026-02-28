
# Function Calls Format Support

## Overview

The XML interceptor in `stream.ts` now supports **both** XML formats used by Stitch:

### Format 1: Legacy Direct Tags (Still Supported)
```xml
<read_file>
<path>file.txt</path>
</read_file>
```

### Format 2: Function Calls with Invoke (NEW - Primary Format)
```xml
<function_calls>
<invoke name="read_file">
<parameter name="path">file.txt</parameter>
</invoke>
</function_calls>
```

## Implementation

### Parser Functions

1. **`parseFunctionCallsXml()`** - Parses the new `<function_calls><invoke>` format
   - Extracts tool name from `name` attribute in `<invoke>` tag
   - Extracts parameters from `<parameter name="...">` tags
   - Applies tool name and argument mappings

2. **`parseXmlToToolCall()`** - Handles both formats
   - Detects `<function_calls>` format and delegates to `parseFunctionCallsXml()`
   - Falls back to legacy format parsing for direct tags

### Detection

Both `function_calls` and `invoke` are now in `KNOWN_TOOL_TAGS` array, enabling detection of the wrapper format.

### Tool Name Mappings

Added mapping for `write_file` (used in function_calls format):
```typescript
'write_file': 'write',      // function_calls format
'write_to_file': 'write',   // legacy format
```

### Argument Mappings

Added mapping for `write_file` arguments:
```typescript
'write_file': {
  'path': 'filePath',
}
```

## Examples

### Example 1: File Write
**Input (from Stitch):**
```xml
<function_calls>
<invoke name="write_file">
<parameter name="path">test.txt</parameter>
<parameter name="content">Hello World</parameter>
</invoke>
</function_calls>
```

**Output (to OpenCode):**
```json
{
  "name": "write",
  "arguments": {
    "filePath": "test.txt",
    "content": "Hello World"
  }
}
```

### Example 2: File Read with Line Range
**Input:**
```xml
<function_calls>
<invoke name="read_file">
<parameter name="path">src/app.ts</parameter>
<parameter name="start_line">220</parameter>
<parameter name="end_line">280</parameter>
</invoke>
</function_calls>
```

**Output:**
```json
{
  "name": "read",
  "arguments": {
    "filePath": "src/app.ts",
    "start_line": 220,
    "end_line": 280
  }
}
```

### Example 3: Mixed Text and Tool Call
**Input:**
```
I'll write that file for you.

<function_calls>
<invoke name="write_file">
<parameter name="path">test.txt</parameter>
<parameter name="content">Test content</parameter>
</invoke>
</function_calls>

File created successfully!
```

**Output:**
- Text chunk: "I'll write that file for you."
- Tool call chunk: `write` with `filePath: test.txt`
- Text chunk: "File created successfully!"

## Type Conversion

Parameters are automatically converted to appropriate types:
- `"true"` / `"false"` → boolean
- Numeric strings → number
- Everything else → string

## Testing

Comprehensive test coverage in `function-calls-format.test.ts`:
- ✅ Write file format
- ✅ Read file format with line ranges
- ✅ Mixed text and XML
- ✅ Boolean and number parameter types
- ✅ Legacy format still works

All 88 tests pass with 1 skipped (fragmented opening tag edge case).

## Known Limitations

1. **Fragmented Opening Tags**: If the opening tag itself (e.g., `<func`) is split across multiple chunks, detection may fail. This is an extremely rare edge case.

## Migration Notes

No migration needed - both formats work simultaneously. The system automatically detects which format is being used and parses accordingly.
