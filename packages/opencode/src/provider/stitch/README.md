# Stitch ↔ OpenCode Transformer Module

A production-ready bidirectional transformer for converting between Stitch backend format and OpenCode CLI format (OpenAI-style chat completions).

## Features

- ✅ **Bidirectional Transformations**: Convert requests and responses in both directions
- ✅ **Streaming Support**: Transform NDJSON streams from Stitch to SSE format for OpenCode
- ✅ **XML Tool Call Interceptor**: Detects and converts XML tool calls to OpenAI format
- ✅ **Type Safety**: Strict TypeScript definitions with comprehensive type guards
- ✅ **Validation**: Input validation and error handling with descriptive messages
- ✅ **Production Ready**: Buffer management, error recovery, and graceful degradation

## Installation

The module is part of the OpenCode provider system and doesn't require separate installation.

```typescript
import * as StitchTransformer from '@/provider/stitch';
```

## Key Differences from Gemini

| Aspect | Gemini | Stitch |
|--------|--------|--------|
| **Streaming Format** | SSE from API | NDJSON from API |
| **Role Mapping** | `assistant` → `model` | `assistant` → `MESSAGE_ROLE_ASSISTANT` |
| **Content Path** | `candidates[0].content.parts[0].text` | `result.response.choices[0].content[0].data` |
| **Reasoning** | Not supported | Supports reasoning tokens |
| **Caching** | Basic | Supports cache creation and read tokens |

## Environment Variables

```bash
# Stitch API endpoint (used by provider.ts)
STITCH_ENDPOINT=https://your-stitch-backend.com/inference-service

# Enable debug logging
STITCH_DEBUG=true
```

## Usage Examples

### Basic Request Transformation

```typescript
import { openCodeToStitchRequest } from '@/provider/stitch';

const openCodeReq = {
  model: 'claude-4-5-sonnet',
  messages: [
    { role: 'user', content: 'Hello, world!' }
  ],
  temperature: 0.7,
  max_tokens: 1024
};

const stitchReq = openCodeToStitchRequest(openCodeReq);
// Now ready to send to Stitch API
```

### Response Transformation

```typescript
import { stitchToOpenCodeResponse } from '@/provider/stitch';

// Stitch API response
const stitchRes = {
  result: {
    response: {
      model: 'claude-4-5-sonnet',
      choices: [{
        index: 0,
        content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hi there!' }],
        finish_reason: 'FINISH_REASON_STOP'
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      }
    }
  }
};

const openCodeRes = stitchToOpenCodeResponse(stitchRes);
// Returns OpenAI-compatible format
```

### Streaming Transformation

```typescript
import { createStitchStreamTransformer } from '@/provider/stitch';

// Get NDJSON stream from Stitch API
const stitchStream = await fetch(stitchEndpoint, {
  method: 'POST',
  body: JSON.stringify(stitchRequest)
});

// Transform to SSE format
const sseStream = stitchStream.body!.pipeThrough(
  createStitchStreamTransformer()
);

// Return as SSE response
return new Response(sseStream, {
  headers: { 'Content-Type': 'text/event-stream' }
});
```

### XML Tool Call Interception

The transformer automatically detects and converts XML tool calls to OpenAI format:

```typescript
// Input: Stitch emits XML tool calls in text stream
const inputText = `I'll search for that.

<grep>
<search_term>activity.*list</search_term>
<case_sensitive>false</case_sensitive>
</grep>

Found it!`;

// Output: Converted to OpenAI tool_calls format
// 1. Regular text: "I'll search for that.\n\n"
// 2. Tool call: {"name":"grep","arguments":"{\"search_term\":\"activity.*list\",\"case_sensitive\":false}"}
// 3. Regular text: "\n\nFound it!"
```

**Supported tool tags**: `explore`, `grep`, `read`, `ast_grep`, `write`, `search`, `list_files`, `execute`, `vector_query`, `read_file`, `search_files`, `apply_diff`, `write_to_file`, and more.

**See**: [XML_TOOL_CALLS.md](XML_TOOL_CALLS.md) for detailed documentation.

### Multi-Turn Conversation

```typescript
import { openCodeToStitchRequest } from '@/provider/stitch';

const conversation = {
  model: 'claude-4-5-sonnet',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is TypeScript?' },
    { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript...' },
    { role: 'user', content: 'Show me an example.' }
  ],
  temperature: 0.8
};

const stitchReq = openCodeToStitchRequest(conversation);
```

### Reasoning Models

```typescript
import { openCodeToStitchRequest } from '@/provider/stitch';

const reasoningReq = {
  model: 'claude-4-5-sonnet',
  messages: [
    { role: 'user', content: 'Solve this complex problem...' }
  ],
  reasoning_budget: 10000, // Allocate tokens for reasoning
  max_tokens: 4096
};

const stitchReq = openCodeToStitchRequest(reasoningReq);
// reasoning_budget → config.reasoning_config.reasoning_budget
```

### Validation

```typescript
import {
  validateStitchRequest,
  validateOpenCodeRequest,
  isStitchResponse,
  StitchTransformError
} from '@/provider/stitch';

try {
  validateOpenCodeRequest(userRequest);
  const stitchReq = openCodeToStitchRequest(userRequest);
  
  // Make API call...
  
  if (!isStitchResponse(apiResponse)) {
    throw new Error('Invalid Stitch response');
  }
  
  const openCodeRes = stitchToOpenCodeResponse(apiResponse);
} catch (error) {
  if (error instanceof StitchTransformError) {
    console.error('Transformation error:', error.message);
  }
}
```

## API Reference

### Request Transformations

#### `openCodeToStitchRequest(req: OpenCodeRequest): StitchRequest`

Transforms OpenCode format to Stitch format.

**Transformations:**
- `role: "user"` → `MESSAGE_ROLE_USER`
- `role: "assistant"` → `MESSAGE_ROLE_ASSISTANT`
- `role: "system"` → `MESSAGE_ROLE_SYSTEM`
- `content: string` → `content: [{ type: 'CONTENT_TYPE_TEXT', data: string }]`
- `temperature` → `config.temperature`
- `max_tokens` → `config.max_tokens`
- `reasoning_budget` → `config.reasoning_config.reasoning_budget`

#### `stitchToOpenCodeRequest(req: StitchRequest): OpenCodeRequest`

Reverse transformation from Stitch to OpenCode format.

### Response Transformations

#### `stitchToOpenCodeResponse(res: StitchResponse): OpenCodeResponse`

Transforms Stitch response to OpenCode format.

**Extracts:**
- Content from `result.response.choices[0].content[0].data`
- Finish reason: `FINISH_REASON_STOP` → `stop`, etc.
- Usage stats including cache and reasoning tokens

#### `stitchToOpenCodeStreamDelta(chunk: StitchStreamChunk): OpenCodeStreamDelta`

Transforms individual stream chunk to OpenCode delta format.

#### `openCodeToStitchResponse(res: OpenCodeResponse): StitchResponse`

Reverse transformation from OpenCode to Stitch format.

### Streaming Transformations

#### `createStitchStreamTransformer(): TransformStream<Uint8Array, Uint8Array>`

Creates a TransformStream for NDJSON → SSE conversion.

**Features:**
- Buffers incomplete JSON lines across boundaries
- Handles errors gracefully
- Outputs SSE format with `data: [DONE]` marker
- Recovers from malformed chunks

### Validation

#### `validateStitchRequest(req: unknown): asserts req is StitchRequest`

Validates Stitch request structure. Throws `StitchTransformError` on failure.

#### `validateOpenCodeRequest(req: unknown): asserts req is OpenCodeRequest`

Validates OpenCode request structure. Throws `StitchTransformError` on failure.

#### Type Guards

- `isStitchRequest(value: unknown): value is StitchRequest`
- `isOpenCodeRequest(value: unknown): value is OpenCodeRequest`
- `isStitchResponse(value: unknown): value is StitchResponse`
- `isOpenCodeResponse(value: unknown): value is OpenCodeResponse`
- `isStitchStreamChunk(value: unknown): value is StitchStreamChunk`

## Type Definitions

### OpenCode Types (OpenAI-style)

```typescript
interface OpenCodeRequest {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  reasoning_budget?: number;
}

interface OpenCodeResponse {
  id: string;
  object: "chat.completion";
  model?: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cache_write_tokens?: number;
    cache_read_tokens?: number;
    reasoning_tokens?: number;
  };
}
```

### Stitch Types

```typescript
interface StitchRequest {
  request: {
    model: string;
    fallback_model: string;
    messages: Array<{
      role: 'MESSAGE_ROLE_USER' | 'MESSAGE_ROLE_ASSISTANT' | 'MESSAGE_ROLE_SYSTEM';
      content: Array<{
        type: 'CONTENT_TYPE_TEXT' | 'CONTENT_TYPE_REASONING';
        data: string;
      }>;
    }>;
    config: {
      temperature?: number;
      max_tokens?: number;
      reasoning_config?: {
        reasoning_budget?: number;
      };
    };
    client_options: {
      source: string;
      retry_options: { max_retries: number };
      request_options: { content_type: string; timeout_ms: number };
    };
  };
}

interface StitchResponse {
  result: {
    response: {
      model?: string;
      choices: Array<{
        index: number;
        content?: Array<{
          type: 'CONTENT_TYPE_TEXT' | 'CONTENT_TYPE_REASONING';
          data: string;
        }>;
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: {
          input_cache_creation_tokens?: number;
          cached_tokens?: number;
        };
        completion_tokens_details?: {
          reasoning_tokens?: number;
        };
      };
    };
  };
}
```

## Error Handling

The module uses `StitchTransformError` for transformation failures:

```typescript
try {
  const stitchReq = openCodeToStitchRequest(userRequest);
} catch (error) {
  if (error instanceof StitchTransformError) {
    console.error('Validation failed:', error.message);
    // error.cause contains the underlying error if available
  }
}
```

## Testing

Run the test suite:

```bash
# Unit tests
bun test src/provider/stitch/__tests__/stitch.test.ts

# Integration tests
bun test src/provider/stitch/__tests__/integration.test.ts

# All tests
bun test src/provider/stitch/__tests__/
```

## Architecture

The module is organized into focused files:

```
stitch/
├── index.ts           # Main entry point and exports
├── types.ts           # TypeScript type definitions
├── request.ts         # Request transformations
├── response.ts        # Response transformations
├── stream.ts          # Streaming transformations
├── validation.ts      # Validation and type guards
├── README.md          # This file
└── __tests__/
    ├── stitch.test.ts      # Unit tests
    └── integration.test.ts # Integration tests
```

## Integration with Provider System

The Stitch transformer is integrated into [`provider.ts`](../provider.ts):

```typescript
import * as StitchTransformer from './stitch';

// Detect Stitch endpoint
const shouldRewrite = url.includes("/inference-service") && 
                      url.endsWith("/chat/completions");

if (shouldRewrite) {
  // Transform request
  const stitchRequest = StitchTransformer.openCodeToStitchRequest(bodyObj);
  
  // ... make API call ...
  
  // Transform response
  if (isStreaming) {
    const transformStream = StitchTransformer.createStitchStreamTransformer();
    return response.body.pipeThrough(transformStream);
  } else {
    const transformed = StitchTransformer.stitchToOpenCodeResponse(parsed);
    return new Response(JSON.stringify(transformed));
  }
}
```

## Performance

- **Request transformation**: < 1ms per request
- **Response transformation**: < 1ms per response
- **Streaming**: Real-time with minimal overhead
- **Batch operations**: 100 transformations in < 1 second

## Version History

### 1.0.0 (Current)
- Initial release
- Bidirectional request/response transformations
- NDJSON → SSE streaming support
- Comprehensive validation
- Production-ready error handling

## Contributing

When modifying the transformer:

1. Update type definitions in `types.ts`
2. Add/update transformations in respective files
3. Add comprehensive tests
4. Update this README
5. Run test suite to verify

## License

Part of the OpenCode project.
