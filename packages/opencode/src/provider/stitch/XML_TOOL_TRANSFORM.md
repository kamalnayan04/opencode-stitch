
# XML ↔ JSON Tool Calling Adapter

**Status:** ✅ Implemented  
**Date:** 2026-02-26  
**File:** [`transform.ts`](./transform.ts)

## Overview

This module provides robust bidirectional transformation between Stitch's XML tool call format and OpenAI's JSON `tool_calls` format. It solves the critical issue where XML tool calls from Stitch were appearing as plain text instead of being executed.

## Problem Solved

### Before
```
User: Search for "foo" in the codebase
Assistant: <grep><search_term>foo</search_term></grep>  ← Printed as text, not executed
```

### After
```
User: Search for "foo" in the codebase
Assistant: [Tool call executed: grep with arguments {"search_term":"foo"}]
Result: Found 3 matches in 2 files
```

## Architecture

### Components

1. **`KNOWN_TOOLS`** - Array of recognized tool names
2. **`XmlToolParser`** - Streaming parser for XML → JSON conversion
3. **`openCodeToStitchMessages()`** - JSON → XML bidirectional transformation

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Stitch Model Response                    │
│              (XML format in NDJSON stream)                   │
└──────────────────────┬──────────────────────────────────────┘
                       │ NDJSON chunks
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              createStitchStreamTransformer()                 │
│         (stream.ts - processes NDJSON → SSE)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ Extracts text content
                       ↓
┌─────────────────────────────────────────────────────────────┐
│                    XmlToolParser                             │
│              (transform.ts - detects XML)                    │
│                                                              │
│  • Buffers text character by character                      │
│  • Detects <tool_name> opening tags                         │
│  • Extracts complete XML between tags                       │
│  • Parses inner <arg>value</arg> tags to JSON               │
│  • Generates unique tool_call IDs                           │
└──────────────────────┬──────────────────────────────────────┘
                       │ Returns { content, toolCalls }
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              SSE Output (OpenAI format)                      │
│                                                              │
│  data: {"choices":[{"delta":{"tool_calls":[{               │
│    "id": "call_1234567890_abc123",                          │
│    "type": "function",                                       │
│    "function": {                                             │
│      "name": "grep",                                         │
│      "arguments": "{\"search_term\":\"foo\"}"               │
│    }                                                         │
│  }]}}]}                                                      │
│                                                              │
│  data: [DONE]                                                │
└─────────────────────────────────────────────────────────────┘
```

## XmlToolParser Class

### Streaming Parser Design

The parser handles **partial XML tags across chunk boundaries** by maintaining internal state:

```typescript
class XmlToolParser {
  private buffer: string = '';           // Accumulates partial tags
  private currentTool: string | null;    // Current tool being parsed
  private toolContent: string = '';      // Buffered XML content
  
  parseStreamChunk(text: string): { content: string; toolCalls: any[] }
  flush(): { content: string; toolCalls: any[] }
}
```

### Key Features

1. **Stateful Buffering**: Maintains buffer for incomplete tags
2. **Character-by-Character Processing**: Detects tag boundaries precisely
3. **Multiple Formats Supported**:
   - Legacy: `<tool_name><arg>value</arg></tool_name>`
   - New: `<function_calls><invoke name="tool"><parameter name="arg">val</parameter></invoke></function_calls>`
4. **Type Inference**: Parses `true`/`false` → boolean, numbers → number
5. **Unique ID Generation**: `call_${timestamp}_${random}`

### Example Usage

```typescript
const parser = new XmlToolParser();

// Process chunks as they arrive
const result1 = parser.parseStreamChunk('Some text <grep><search_');
// result1 = { content: 'Some text ', toolCalls: [] }
// Parser buffers '<grep><search_'

const result2 = parser.parseStreamChunk('term>foo</search_term></grep>');
// result2 = { content: '', toolCalls: [{ 
//   id: 'call_1234567890_abc123',
//   type: 'function',
//   function: { name: 'grep', arguments: '{"search_term":"foo"}' }
// }]}

// At stream end
const final = parser.flush();
// Returns any remaining buffered content
```

## Bidirectional Transformation

### OpenAI → Stitch (Request)

The `openCodeToStitchMessages()` function converts OpenAI-style messages to Stitch XML format:

```typescript
// Input: OpenAI format
{
  role: 'assistant',
  tool_calls: [{
    id: 'call_123',
    type: 'function',
    function: {
      name: 'grep',
      arguments: '{"search_term":"foo","case_sensitive":false}'
    }
  }]
}

// Output: Stitch XML format
{
  role: 'assistant',
  content: '<grep><search_term>foo</search_term><case_sensitive>false</case_sensitive></grep>'
}
```

### Tool Results

Tool results are also converted to XML:

```typescript
// Input: OpenAI tool result
{
  role: 'tool',
  tool_call_id: 'call_123',
  name: 'grep',
  content: 'Found 3 matches'
}

// Output: Stitch format
{
  role: 'user',
  content: '<tool_result name="grep">Found 3 matches</tool_result>'
}
```

## System Tags Exclusion

**Critical:** The parser does NOT intercept system/formatting tags:

```typescript
const SYSTEM_TAGS = new Set([
  'thinking',           // Claude's reasoning
  'attempt_completion', // Completion marker (was causing spinner hang!)
  'result', 'feedback', 'error', 'response', 'message', 'content',
  'antml:thinking', 'antml:invoke'
]);
```

These pass through as regular content, preventing false positives.

## Known Tools

The parser recognizes 50+ tool names including:

- **File Operations**: `read`, `write`, `edit`, `grep`, `glob`
- **Code Analysis**: `ast_grep`, `lsp_goto_definition`, `lsp_find_references`
- **Execution**: `bash`, `execute_command`, `interactive_bash`
- **Web**: `web_search`, `browser_action`, `fetch_prs`
- **Task Management**: `task`, `new_task`, `update_todo_list`
- **Questions**: `question`, `ask_followup_question`

See [`KNOWN_TOOLS`](./transform.ts#L17-L46) for complete list.

## Integration with Stream Transformer

The `createStitchStreamTransformer()` in [`stream.ts`](./stream.ts) uses `XmlToolParser`:

```typescript
export function createStitchStreamTransformer() {
  const xmlParser = new XmlToolParser();
  
  return new TransformStream({
    async transform(chunk, controller) {
      // 1. Parse NDJSON
      const parsed = JSON.parse(line);
      
      // 2. Extract text content
      const contentText = parsed?.result?.response?.choices?.[0]?.content?.[0]?.data;
      
      // 3. Feed to XML parser
      const { content, toolCalls } = xmlParser.parseStreamChunk(contentText);
      
      // 4. Emit content delta
      if (content) {
        controller.enqueue(createContentDelta(content));
      }
      
      // 5. Emit tool call deltas
      for (const toolCall of toolCalls) {
        controller.enqueue(createToolCallDelta(toolCall));
      }
    },
    
    flush(controller) {
      // 6. Flush any remaining content
      const { content } = xmlParser.flush();
      if (content) {
        controller.enqueue(createContentDelta(content));
      }
      
      // 7. Always emit [DONE]
      controller.enqueue('data: [DONE]\n\n');
    }
  });
}
```

## Testing

Comprehensive test suite in [`__tests__/transform.test.ts`](./__tests__/transform.test.ts):

- ✅ Simple XML tool calls
- ✅ Multiple arguments
- ✅ Boolean/number type conversion
- ✅ Partial tags across chunks
- ✅ Multiple sequential tool calls
- ✅ function_calls format
- ✅ System tag exclusion
- ✅ Malformed XML handling
- ✅ Bidirectional message transformation

Run tests:
```bash
bun test src/provider/stitch/__tests__/transform.test.ts
```

## Performance

- **Memory**: O(n) for buffering, cleared after each tool call
- **Latency**: Near-zero - processes as chunks arrive
- **Overhead**: Character-by-character only when content exists

## Debugging

Enable debug logging:

```bash
export STITCH_DEBUG=true
```

Look for logs:
```
[XmlToolParser] Tool opening detected: grep
[XmlToolParser] Tool call parsed: grep {"search_term":"foo"}
[Stitch Stream] Emitted tool call: grep
```

## Error Handling

- **Malformed XML**: Logged, buffered, doesn't crash stream
- **Partial tags at stream end**: Flushed as regular content
- **Unknown tool names**: Pass through as content (not intercepted)
- **Parse failures**: Gracefully degraded, partial results preserved

## Finish Reason Mapping

When tool calls are detected, the finish reason is properly mapped:

```typescript
const FINISH_REASON_MAP = {
  'FINISH_REASON_STOP': 'stop',
  'FINISH_REASON_FUNCTION_CALL': 'tool_calls',  // ← Tool calls
  'FINISH_REASON_MAX_TOKENS': 'length',
  // ... more mappings
};
```

## Critical Fixes Applied

1. **Spinner Hang Fix**: Always emit `data: [DONE]\n\n` at stream end
2. **System Tag Exclusion**: `<attempt_completion>` no longer intercepted
3. **Finish Reason**: Properly mapped to `tool_calls` when tools detected
4. **Partial Tags**: Buffered across chunk boundaries
5. **Type Inference**: Boolean/number values correctly typed

## Future Enhancements

Potential improvements:

1. **Streaming Arguments**: Stream tool call arguments as they arrive
2. **Parallel Tool Calls**: Support multiple simultaneous invocations
3. **Schema Validation**: Validate arguments against tool schemas
4. **Nested XML**: Support nested tool calls (currently flat only)
5. **Error Recovery**: More intelligent recovery from malformed XML

## References

- Main implementation: [`transform.ts`](./transform.ts)
- Stream integration: [`stream.ts`](./stream.ts)
- Test suite: [`__tests__/transform.test.ts`](./__tests__/transform.test.ts)
- Type definitions: [`types.ts`](./types.ts)
- Provider integration: [`../provider.ts`](../provider.ts#L1380)

---

**Implementation Status**: ✅ Complete  
**Tests**: ✅ 20+ tests passing  
**Integration**: ✅ Used in production stream transformer  
**Documentation**: ✅ Comprehensive
