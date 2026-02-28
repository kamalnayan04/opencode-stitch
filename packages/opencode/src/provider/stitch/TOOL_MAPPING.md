
# Stitch/Gemini-CLI to OpenCode Tool Name Mapping

This document describes the tool name mapping used to translate XML tool calls from Stitch/gemini-cli format to OpenCode's internal tool names.

## Problem

The error shows the model calls `read_file` but opencode only recognizes `read`:
```
invalid [tool=read_file, error=Model tried to call unavailable tool 'read_file'. 
Available tools: read, glob, grep, edit, write, task, ...
```

## Solution

A comprehensive mapping has been implemented in `stream.ts` that translates Stitch/gemini-cli tool names to OpenCode tool names before emitting tool calls.

## Complete Tool Name Mapping

| Stitch/Gemini-CLI Tool Name | OpenCode Tool Name | Category |
|----------------------------|-------------------|----------|
| `read_file` | `read` | File Operations |
| `write_to_file` | `write` | File Operations |
| `apply_diff` | `edit` | File Operations |
| `insert_content` | `edit` | File Operations |
| `search_and_replace` | `edit` | File Operations |
| `perform_file_operation` | `edit` | File Operations |
| `list_files` | `glob` | File Operations |
| `search_files` | `grep` | Search Operations |
| `vector_query` | `grep` | Search Operations |
| `search_org` | `grep_app_searchGitHub` | Search Operations |
| `execute_command` | `bash` | Command Execution |
| `execute` | `bash` | Command Execution |
| `update_todo_list` | `todowrite` | Todo Operations |
| `new_task` | `task` | Task Operations |
| `switch_mode` | `task` | Task Operations |
| `attempt_completion` | `task` | Task Operations |
| `ask_followup_question` | `question` | Question Operations |
| `use_mcp_tool` | `skill_mcp` | MCP Operations |
| `access_mcp_resource` | `skill_mcp` | MCP Operations |
| `web_search` | `google_search` | Web Operations |
| `browser_action` | `look_at` | Web Operations |
| `github` | `grep_app_searchGitHub` | GitHub Operations |
| `fetch_prs` | `grep_app_searchGitHub` | GitHub Operations |
| `fetch_instructions` | `read` | Special Operations |
| `debug` | `bash` | Special Operations |
| `list_code_definition_names` | `ast_grep_search` | AST Operations |
| `ast_grep` | `ast_grep_search` | AST Operations |

### Tools That Map to Themselves

The following tools already use OpenCode's naming convention and don't need mapping:

- `read` → `read`
- `write` → `write`
- `edit` → `edit`
- `grep` → `grep`
- `glob` → `glob`
- `bash` → `bash`
- `task` → `task`
- `question` → `question`
- `webfetch` → `webfetch`
- `todowrite` → `todowrite`
- `todoread` → `todoread`
- `look_at` → `look_at`
- `skill_mcp` → `skill_mcp`

### LSP Operations

LSP tools already match OpenCode names and don't need mapping:

- `lsp` → `lsp`
- `lsp_goto_definition` → `lsp_goto_definition`
- `lsp_find_references` → `lsp_find_references`
- `lsp_symbols` → `lsp_symbols`
- `lsp_diagnostics` → `lsp_diagnostics`
- `lsp_prepare_rename` → `lsp_prepare_rename`
- `lsp_rename` → `lsp_rename`

### AST Operations

AST operations map to OpenCode's AST tool names:

- `ast_grep_search` → `ast_grep_search`
- `ast_grep_replace` → `ast_grep_replace`

## Available OpenCode Tools

From the error message, these are the tools available in OpenCode:

**Core Tools:**
- `invalid`, `question`, `bash`, `read`, `glob`, `grep`, `edit`, `write`, `task`

**Extended Tools:**
- `webfetch`, `todowrite`, `skill`, `look_at`, `skill_mcp`, `interactive_bash`

**Search Tools:**
- `google_search`, `websearch_web_search_exa`, `grep_app_searchGitHub`

**LSP Tools:**
- `lsp_goto_definition`, `lsp_find_references`, `lsp_symbols`, `lsp_diagnostics`
- `lsp_prepare_rename`, `lsp_rename`

**AST Tools:**
- `ast_grep_search`, `ast_grep_replace`

**Session Tools:**
- `session_list`, `session_read`, `session_search`, `session_info`

**Background Tools:**
- `background_output`, `background_cancel`

**Context7 Tools:**
- `context7_resolve-library-id`, `context7_query-docs`

## Implementation Details

### Location

The mapping is implemented in:
- File: `packages/opencode/src/provider/stitch/stream.ts`
- Constant: `TOOL_NAME_MAPPING`
- Function: `parseXmlToToolCall()`

### How It Works

1. When XML tool calls are detected in the stream, they are parsed by `parseXmlToToolCall()`
2. The original tool name is extracted from the XML outer tag
3. The tool name is looked up in `TOOL_NAME_MAPPING`
4. If a mapping exists, the mapped name is used; otherwise, the original name is kept
5. The tool call is emitted with the correct OpenCode tool name

### Debug Logging

When `STITCH_DEBUG=true` environment variable is set, the mapping logs transformations:

```
[Stitch Stream] Tool name mapped: read_file → read
[Stitch Stream] Tool name mapped: execute_command → bash
```

## Testing

Comprehensive test cases have been added in `__tests__/xml-tool-calls.test.ts` to verify:

- `read_file` → `read` mapping
- `search_files` → `grep` mapping
- `execute_command` → `bash` mapping
- `write_to_file` → `write` mapping
- `apply_diff` → `edit` mapping

Run tests with:
```bash
bun test packages/opencode/src/provider/stitch/__tests__/xml-tool-calls.test.ts
```

## Future Considerations

### Parameter Mapping

Currently, only tool names are mapped. If parameter names also differ between Stitch and OpenCode, an additional parameter mapping layer can be added:

```typescript
const ARGUMENT_NAME_MAPPING: Record<string, Record<string, string>> = {
  'read_file': {
    'path': 'file',  // if opencode uses 'file' instead of 'path'
  },
  // ... other mappings
};
```

### Dynamic Tool Discovery

For a more robust solution, consider:
1. Querying OpenCode's available tools at runtime
2. Building the mapping dynamically based on tool schemas
3. Providing warnings for unmapped tools

## Troubleshooting

### Tool Not Found Errors

If you see errors like:
```
Model tried to call unavailable tool 'xyz'
```

1. Check if the tool name exists in `KNOWN_TOOL_TAGS` array
2. Verify the mapping in `TOOL_NAME_MAPPING`
3. Confirm the OpenCode tool name in the error message's available tools list
4. Add the mapping if missing

### Mapping Not Applied

If a tool mapping isn't working:

1. Enable debug logging: `STITCH_DEBUG=true`
2. Check console logs for "Tool name mapped:" messages
3. Verify the XML is being detected correctly
4. Check if the tool tag is in `KNOWN_TOOL_TAGS`

## Related Files

- `stream.ts` - Main implementation
- `__tests__/xml-tool-calls.test.ts` - Test cases
- `types.ts` - Type definitions
- `request.ts` - Request transformation
- `response.ts` - Response transformation
