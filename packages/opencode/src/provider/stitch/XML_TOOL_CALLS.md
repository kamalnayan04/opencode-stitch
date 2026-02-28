
# XML-to-JSON Tool Call Interceptor

## Overview

The Stitch stream transformer now includes an XML-to-JSON tool call interceptor that detects XML tool calls in the streaming text and converts them to OpenAI-compatible `tool_calls` format.

## Problem

The Stitch model emits tool calls as plain-text XML embedded in the standard text stream:

```xml
<explore>
<info>Exploring the project structure</info>
<search_dir>/Users/demo/project</search_dir>
</explore>
```

However, the Vercel AI SDK expects native OpenAI JSON `tool_calls` format:

```json
{
  "choices": [{
    "delta": {
      "tool_calls": [{
        "index": 0,
        "id": "call_123456",
        "type": "function",
        "function": {
          "name": "explore",
          "arguments": "{\"info\":\"Exploring the project structure\",\"search_dir\":\"/Users/demo/project\"}"
        }
      }]
    }
  }]
}
```

## Solution

The interceptor works by:

1. **Detecting XML tags** - Monitors streaming text for known tool tag openings
2. **Buffering XML content** - Accumulates complete XML blocks across chunk boundaries
3. **Parsing XML** - Converts XML structure to JSON object
4. **Emitting tool calls** - Outputs as OpenAI SSE format
5. **Filtering XML from text** - Prevents XML from appearing in regular content deltas

## Supported Tool Tags

The interceptor recognizes these tool tags (from `KNOWN_TOOL_TAGS`):

- `explore`, `grep`, `read`, `ast_grep`, `write`, `search`
- `list_files`, `execute`, `vector_query`, `read_file`
- `search_files`, `list_code_definition_names`, `apply_diff`
- `write_to_file`, `insert_content`, `search_and_replace`
- `perform_file_operation`, `browser_action`, `execute_command`
- `use_mcp_tool`, `access_mcp_resource`, `ask_followup_question`
- `attempt_completion`, `switch_mode`, `new_task`, `update_todo_list`
- `fetch_instructions`, `search_org`, `lsp`, `web_search`, `github`
- `fetch_prs`, `debug`

## Implementation Details

### State Tracking

```typescript
interface XmlState {
  inToolCall: boolean;      // Currently parsing XML?
  currentToolName: string;  // Name of tool being parsed
  xmlBuffer: string;        // Accumulated XML content
}
```

### XML Detection

The system processes content character-by-character:

1. **Opening tag detection**: `detectToolTagOpening()` scans for `<toolname>`
2. **Content buffering**: All characters accumulated while `inToolCall = true`
3. **Closing tag detection**: `detectToolTagClosing()` finds `</toolname>`
4. **Parse & emit**: `parseXmlToToolCall()` converts to JSON, then emits as SSE

### XML Parser

The `parseXmlToToolCall()` function:

- Extracts outer tag as tool name
- Parses inner tags as arguments
- Converts values: `"true"` → `true`, `"123"` → `123`
- Returns `{ name: string, arguments: Record<string, any> }`

### Fragmented XML Handling

The interceptor handles XML split across multiple chunks:

```typescript
// Chunk 1: "<explor"
// Chunk 2: "e>\n<path>/test</path>\n</explore>"
// Result: Successfully parsed as one tool call
```

### Error Handling

- **Malformed XML**: Logs warning, continues processing
- **Incomplete XML at stream end**: Attempts parsing in `flush()` handler
- **Unknown tags**: Ignored, passed through as regular text
- **Parse failures**: Logged but don't break stream

## Usage Example

### Input Stream (NDJSON from Stitch)

```json
{"result":{"response":{"choices":[{"index":0,"content":[{"type":"CONTENT_TYPE_TEXT","data":"I'll search for that.\n\n<grep>\n<search_term>activity.*list</search_term>\n<case_sensitive>false</case_sensitive>\n</grep>\n\nFound it!"}]}]}}}
```

### Output Stream (SSE for OpenCode)

```
data: {"id":"chatcmpl-1234","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"I'll search for that.\n\n"},"finish_reason":null}]}

data: {"id":"chatcmpl-1235","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_5678","type":"function","function":{"name":"grep","arguments":"{\"search_term\":\"activity.*list\",\"case_sensitive\":false}"}}]},"finish_reason":null}]}

data: {"id":"chatcmpl-1236","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"\n\nFound it!"},"finish_reason":null}]}

data: [DONE]
```

## API Changes

No API changes required. The interceptor is automatically active in `createStitchStreamTransformer()`.

### Debug Logging

Enable debug logging to see XML detection in action:

```bash
export STITCH_DEBUG=true
```

Output:
```
[Stitch Stream] XML tool call detected: grep
[Stitch Stream] XML parsed to tool call: grep { search_term: 'activity.*list', case_sensitive: false }
```

## Performance

- **Overhead**: Minimal - character-by-character processing only when content exists
- **Memory**: XML buffer cleared after each tool call
- **Latency**: No additional latency - processes as chunks arrive

## Testing

Run the test suite:

```bash
bun test src/provider/stitch/__tests__/xml-tool-calls.test.ts
```

Test coverage includes:
- ✅ Simple XML tool calls
- ✅ Multiple sequential tool calls
- ✅ Mixed text and XML content
- ✅ Boolean/number type conversion
- ✅ Fragmented XML across chunks
- ✅ XML filtering from text content
- ✅ Malformed XML handling

## Limitations

1. **Nested XML**: Does not support nested tool calls (e.g., tool within tool)
2. **Attributes**: XML attributes are not parsed (only tag content)
3. **CDATA sections**: Not supported
4. **Namespaces**: Not supported

## Future Enhancements

Potential improvements:

1. **Tool call streaming**: Stream tool call arguments as they arrive
2. **Parallel tool calls**: Support multiple simultaneous tool invocations
3. **Tool results**: Handle tool result responses
4. **Schema validation**: Validate arguments against tool schemas
5. **Error recovery**: More intelligent recovery from malformed XML

## References

- Main implementation: [`stream.ts:27-179`](stream.ts#L27-L179)
- Test suite: [`__tests__/xml-tool-calls.test.ts`](__tests__/xml-tool-calls.test.ts)
- Type definitions: [`types.ts:192-199`](types.ts#L192-L199)

## Contributing

When adding new tool tags:

1. Add tag name to `KNOWN_TOOL_TAGS` array
2. Add test case in `xml-tool-calls.test.ts`
3. Verify XML parsing handles tool's argument structure
4. Update this documentation

## License

Part of the OpenCode Stitch provider package.
