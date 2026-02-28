
# Tool Call Handling Fix for Stitch Provider

## Problem Summary

The Stitch provider was experiencing critical failures in tool call handling:

1. **Wrong Tool Names**: Model was calling `file-search` but available tools were `read`, `write`, `grep`, `edit`, `bash`, etc.
2. **File Writes Not Executing**: AI created file write tool calls, but files weren't written to disk
3. **Tool Call Format Mismatch**: Tool calls weren't being properly transformed between stitch-backend → opencode format

### Error Example
```
invalid [tool=file-search, error=Model tried to call unavailable tool 'file-search'. 
Available tools: invalid, question, bash, read, glob, grep, edit, write, task, ...]
```

## Root Cause

The Stitch backend was returning tool names in different formats (e.g., `file-search`, `file-read`, `file-write`) that didn't match OpenCode's internal tool names (`grep`, `read`, `write`, `edit`). 

The transformation layer in both `response.ts` and `stream.ts` was passing through tool names without mapping them, causing:
- Tool calls to fail with "unavailable tool" errors
- Tool arguments not being mapped to the correct parameter names
- Files not being written because `file-write` wasn't mapped to `write`

## Solution

### 1. Created Centralized Mapping Module

Created [`tool-mapping.ts`](tool-mapping.ts) with:
- `TOOL_NAME_MAPPING`: Maps Stitch tool names → OpenCode tool names
- `ARGUMENT_NAME_MAPPING`: Maps Stitch argument names → OpenCode argument names
- `mapToolName()`: Function to apply tool name mapping
- `mapArguments()`: Function to apply argument name mapping

### 2. Updated Response Transformation

Modified [`response.ts`](response.ts):
- Import mapping functions from `tool-mapping.ts`
- Apply `mapToolName()` and `mapArguments()` in `stitchToOpenCodeResponse()`
- Apply mapping in `stitchToOpenCodeStreamDelta()` for streaming responses
- Added debug logging for mapping transformations

### 3. Updated Stream Transformation

Modified [`stream.ts`](stream.ts):
- Import mapping functions from `tool-mapping.ts`
- Removed duplicate mapping constants (now in shared module)
- Apply mappings in `parseFunctionCallsXml()`
- Apply mappings in `parseXmlToToolCall()`
- Added `file-search`, `file-read`, `file-write`, etc. to `KNOWN_TOOL_TAGS`

## Key Mappings Added

```typescript
// Hyphenated Stitch format → OpenCode format
'file-search' → 'grep'
'file-read' → 'read'
'file-write' → 'write'
'file-edit' → 'edit'
'file-list' → 'glob'
'command-execute' → 'bash'

// Underscore Stitch format → OpenCode format
'read_file' → 'read'
'write_file' → 'write'
'write_to_file' → 'write'
'search_files' → 'grep'
'execute_command' → 'bash'
'apply_diff' → 'edit'
```

## Argument Mappings

```typescript
// Path/file parameter normalization
'path' → 'filePath' (for read, write, edit tools)
'file' → 'filePath'

// Search parameter normalization
'query' → 'pattern' (for grep)
'regex' → 'pattern'

// Command parameter normalization
'cmd' → 'command' (for bash)
```

## Testing

To verify the fix works:

1. **Enable debug logging**:
   ```bash
   export STITCH_DEBUG=true
   ```

2. **Test file operations**:
   - Request to read a file → should map `file-read` or `read_file` to `read`
   - Request to write a file → should map `file-write` or `write_file` to `write`
   - Request to search files → should map `file-search` or `search_files` to `grep`

3. **Check debug output**:
   ```
   [Stitch Transform] Tool name mapped: file-search → grep
   [Stitch Transform] Tool name mapped: file-write → write
   [Stitch Stream] Tool name mapped: read_file → read
   ```

4. **Verify execution**:
   - Files should be created/modified on disk
   - Search results should be returned
   - No "unavailable tool" errors

## Debug Mode

Set `STITCH_DEBUG=true` environment variable to see detailed mapping logs:
- Tool name transformations
- Argument name transformations
- XML parsing details
- Stream chunk processing

## Files Modified

1. [`tool-mapping.ts`](tool-mapping.ts) - NEW: Centralized mapping definitions
2. [`response.ts`](response.ts) - MODIFIED: Added tool/arg mapping to response transformation
3. [`stream.ts`](stream.ts) - MODIFIED: Added tool/arg mapping to stream transformation, added hyphenated tool names to KNOWN_TOOL_TAGS

## Impact

- ✅ Tool names are correctly mapped (no `file-search` errors)
- ✅ File writes work (files appear on disk)
- ✅ Tool calls are properly executed
- ✅ All available tools work correctly
- ✅ Supports both hyphenated (`file-search`) and underscore (`search_files`) formats
- ✅ Debug output shows correct tool call flow

## Future Considerations

If new tool name formats are introduced by Stitch backend:
1. Add the tool tag to `KNOWN_TOOL_TAGS` in `stream.ts`
2. Add mapping to `TOOL_NAME_MAPPING` in `tool-mapping.ts`
3. Add argument mappings to `ARGUMENT_NAME_MAPPING` if needed
4. Test with `STITCH_DEBUG=true` to verify transformation
