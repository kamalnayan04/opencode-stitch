
# Argument Name Mapping Implementation

## Problem
The Stitch provider was successfully mapping tool names (e.g., `read_file` → `read`) but not argument names. This caused tools to receive `undefined` parameters because:

- Stitch/gemini-cli uses: `<read_file><path>file.ts</path></read_file>`
- OpenCode expects: `read({ filePath: "file.ts" })`

The tool name was mapped correctly, but `path` was not transformed to `filePath`, resulting in undefined parameters.

## Solution
Added `ARGUMENT_NAME_MAPPING` constant and updated `parseXmlToToolCall()` function to transform argument names alongside tool names.

## Implementation Details

### 1. Added ARGUMENT_NAME_MAPPING Constant

```typescript
const ARGUMENT_NAME_MAPPING: Record<string, Record<string, string>> = {
  'read_file': {
    'path': 'filePath',
    'line_range': 'offset',
  },
  'write_to_file': {
    'path': 'filePath',
  },
  'search_files': {
    'regex': 'pattern',
  },
  // ... other mappings
};
```

### 2. Updated parseXmlToToolCall() Function

The function now:
1. Extracts arguments from XML
2. **Applies argument name mapping** (NEW)
3. Applies tool name mapping
4. Returns transformed tool call

```typescript
// Apply argument name mapping
const argumentMapping = ARGUMENT_NAME_MAPPING[originalToolName];
const mappedArgs: Record<string, any> = {};

if (argumentMapping) {
  for (const [originalArgName, value] of Object.entries(args)) {
    const mappedArgName = argumentMapping[originalArgName] || originalArgName;
    mappedArgs[mappedArgName] = value;
  }
} else {
  Object.assign(mappedArgs, args);
}
```

## Key Mappings

### File Operations
| Stitch Tool | Stitch Param | OpenCode Tool | OpenCode Param |
|-------------|--------------|---------------|----------------|
| `read_file` | `path` | `read` | `filePath` |
| `write_to_file` | `path` | `write` | `filePath` |
| `apply_diff` | `path` | `edit` | `filePath` |
| `insert_content` | `path` | `edit` | `filePath` |
| `search_and_replace` | `path` | `edit` | `filePath` |
| `perform_file_operation` | `path` | `edit` | `filePath` |

### Search Operations
| Stitch Tool | Stitch Param | OpenCode Tool | OpenCode Param |
|-------------|--------------|---------------|----------------|
| `search_files` | `regex` | `grep` | `pattern` |

## Debugging

Enable debug logging with:
```bash
STITCH_DEBUG=true
```

This will log:
- Tool name mappings: `[Stitch Stream] Tool name mapped: read_file → read`
- Argument mappings: `[Stitch Stream] Argument mapped: path → filePath`

## Testing

Test the mapping with a simple read operation:

**Input (Stitch XML):**
```xml
<read_file>
  <path>src/index.ts</path>
</read_file>
```

**Output (OpenCode JSON):**
```json
{
  "name": "read",
  "arguments": {
    "filePath": "src/index.ts"
  }
}
```

## Files Modified

- `packages/opencode/src/provider/stitch/stream.ts`
  - Added `ARGUMENT_NAME_MAPPING` constant (lines 71-118)
  - Updated `parseXmlToToolCall()` function (lines 245-272)

## Future Improvements

1. **Complex Transformations**: Some tools like `apply_diff` have nested structures that may need special handling beyond simple name mapping.

2. **Type Conversions**: Some parameters may need type conversions (e.g., `line_range` to `offset` may need format transformation, not just renaming).

3. **Validation**: Add validation to ensure mapped arguments match the expected schema for each OpenCode tool.

4. **Dynamic Mapping**: Consider loading mappings from a configuration file for easier maintenance.

## References

- OpenCode tool schemas: `packages/opencode/src/tool/*.ts`
- Stitch tool definitions: Referenced in stitch-cli documentation
- Related documentation: `TOOL_MAPPING.md`, `IMPLEMENTATION_SUMMARY.md`
