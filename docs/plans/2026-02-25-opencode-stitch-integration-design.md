
# OpenCode-Stitch Integration: Comprehensive Architectural Analysis & Design

**Date:** 2026-02-25  
**Status:** Design Phase  
**Objective:** Design a robust compatibility layer between OpenCode (frontend) and Stitch AI Gateway (backend)

---

## Executive Summary

OpenCode uses the Vercel AI SDK with OpenAI-compatible format for provider communication. Stitch AI Gateway uses a proprietary format with different message structures, role naming, and streaming protocols. A transformation layer has been partially implemented in [`provider.ts:1100-1400`](opencode/packages/opencode/src/provider/provider.ts:1100) but requires architectural review and completion.

**Critical Finding:** The current implementation performs inline transformation in the fetch wrapper, which:
- ✅ Handles basic request/response transformation
- ✅ Supports streaming via SSE
- ⚠️ Has incomplete tool call support
- ⚠️ Lacks proper error handling for edge cases
- ⚠️ Missing retry logic and timeout handling
- ⚠️ No support for cache control markers
- ⚠️ Limited reasoning content support

---

## Table of Contents

1. [Phase 1: Deep Code Understanding](#phase-1-deep-code-understanding)
2. [Phase 2: Gap Analysis](#phase-2-gap-analysis)
3. [Phase 3: Architecture Design](#phase-3-architecture-design)
4. [Phase 4: Implementation Roadmap](#phase-4-implementation-roadmap)

---

## Phase 1: Deep Code Understanding

### 1.1 OpenCode Provider Architecture

#### Request Construction Flow

```
User Request
    ↓
Agent (session/llm.ts)
    ↓
AI SDK Provider (provider.ts)
    ↓
Custom Fetch Wrapper (lines 1050-1396)
    ↓
HTTP Request to Backend
```

**Key Files:**
- [`provider.ts`](opencode/packages/opencode/src/provider/provider.ts) - Main provider logic, SDK initialization, fetch wrapper
- [`models.ts`](opencode/packages/opencode/src/provider/models.ts) - Model metadata from models.dev
- [`transform.ts`](opencode/packages/opencode/src/provider/transform.ts) - Provider-specific transformations
- [`session/llm.ts`](opencode/packages/opencode/src/session/llm.ts) - LLM invocation logic

#### Message Normalization (OpenAI Format)

OpenCode uses standard OpenAI message format:

```typescript
{
  model: "stitch-1",
  messages: [
    {
      role: "system" | "user" | "assistant",
      content: string | ContentBlock[]
    }
  ],
  temperature: number,
  max_tokens: number,
  tools?: Tool[],
  stream?: boolean
}
```

**ContentBlock Types:**
```typescript
type ContentBlock = 
  | { type: "text", text: string }
  | { type: "tool-call", toolCallId: string, toolName: string, args: object }
  | { type: "tool-result", toolCallId: string, content: string, is_error?: boolean }
```

#### Streaming Response Handling

OpenCode expects **Server-Sent Events (SSE)** format:

```
data: {"choices":[{"delta":{"content":"text"}}]}\n\n
data: {"choices":[{"delta":{"content":"more"}}]}\n\n
data: [DONE]\n\n
```

**Streaming Processing:**
- Uses `TransformStream` for chunk processing
- Expects `text/event-stream` content-type
- Parses SSE `data:` lines
- Handles `[DONE]` termination marker
- Supports partial delta accumulation

#### Tool/Function Call Support

OpenCode has comprehensive tool support:

**Tool Execution Flow:**
```
LLM generates tool-call
    ↓
session/processor.ts tracks tool state
    ↓
tool/* executes the tool
    ↓
Result returned as tool-result message
    ↓
LLM receives tool-result in next turn
```

**Tool Call Message Format:**
```typescript
{
  role: "assistant",
  content: [
    {
      type: "tool-call",
      toolCallId: "call_abc123",
      toolName: "read_file",
      args: { path: "file.ts" }
    }
  ]
}
```

**Tool Result Message Format:**
```typescript
{
  role: "user",
  content: [
    {
      type: "tool-result",
      toolCallId: "call_abc123",
      content: "file contents...",
      is_error: false
    }
  ]
}
```

**Key Observations:**
- Batch tool calls supported via [`tool/batch.ts`](opencode/packages/opencode/src/tool/batch.ts)
- Tool state tracked per `callID` in [`session/processor.ts:32-227`](opencode/packages/opencode/src/session/processor.ts:32)
- Permission system validates tool usage via [`permission/next.ts`](opencode/packages/opencode/src/permission/next.ts)
- Finish reason `"tool-calls"` indicates pending tool execution

#### Error State Handling

**Error Types:**
- `InitError` - Provider initialization failure
- `ModelNotFoundError` - Invalid model/provider
- `NoSuchModelError` - SDK model not found
- Permission errors - User denied tool access

**Error Flow:**
```typescript
try {
  // Provider/model lookup
  const model = await Provider.getModel(providerID, modelID)
  const language = await Provider.getLanguage(model)
  
  // Stream generation
  const stream = await streamText({ model: language, ... })
} catch (error) {
  // Error surfaced to agent
  throw new ProviderError(...)
}
```

---

### 1.2 Stitch Backend API Analysis

#### API Endpoints

**Streaming Endpoint:**
```
POST /stream-chat-completion
Content-Type: application/json
Authorization: Bearer <token>
Grpc-Metadata-x-project-name: <project>
Grpc-Metadata-x-project-auth-key: <key>
```

**Non-streaming Endpoint:**
```
POST /chat-completion
(same headers)
```

#### Request Format (Stitch Proprietary)

```json
{
  "request": {
    "model": "stitch-1",
    "fallback_model": "stitch-1",
    "messages": [
      {
        "role": "MESSAGE_ROLE_SYSTEM" | "MESSAGE_ROLE_USER" | "MESSAGE_ROLE_ASSISTANT",
        "content": [
          {
            "type": "CONTENT_TYPE_TEXT" | "CONTENT_TYPE_REASONING",
            "data": "text content",
            "explicit_caching_control": { "enabled": true }  // optional
          }
        ]
      }
    ],
    "config": {
      "temperature": 1.0,
      "max_tokens": 8192,
      "reasoning_config": {  // optional
        "reasoning_budget": 5000
      }
    },
    "client_options": {
      "source": "opencode",
      "retry_options": { "max_retries": 1 },
      "request_options": {
        "content_type": "application/json",
        "timeout_ms": 600000
      }
    }
  }
}
```

**Key Characteristics:**
- Entire payload wrapped in `"request": {...}`
- Roles are enums: `MESSAGE_ROLE_*`
- Content is always an array of objects
- Content types are enums: `CONTENT_TYPE_*`
- Config nested under `config` key
- Client metadata required

#### Response Format (Streaming)

**Stitch streams newline-delimited JSON (NDJSON), NOT SSE:**

```json
{"result":{"response":{"choices":[{"content":[{"type":"CONTENT_TYPE_TEXT","data":"Hello"}]}]}}}
{"result":{"response":{"choices":[{"content":[{"type":"CONTENT_TYPE_TEXT","data":" world"}]}]}}}
{"result":{"response":{"usage":{"promptTokens":10,"completionTokens":20}}}}
```

**Response Structure:**
```typescript
{
  result: {
    response: {
      choices: [
        {
          content: [
            {
              type: "CONTENT_TYPE_TEXT" | "CONTENT_TYPE_REASONING",
              data: string
            }
          ],
          finish_reason?: string
        }
      ],
      model?: string,
      usage?: {
        promptTokens: number,
        completionTokens: number,
        promptTokensDetails?: {
          inputCacheCreationTokens?: number,
          cachedTokens?: number
        },
        completionTokensDetails?: {
          reasoningTokens?: number
        }
      }
    }
  }
}
```

**Critical Observation:**  
⚠️ **Stitch DOES NOT use SSE format!** It uses NDJSON (newline-delimited JSON). The current implementation in [`provider.ts:1305-1349`](opencode/packages/opencode/src/provider/provider.ts:1305) incorrectly assumes SSE format with `data:` prefixes.

#### Role Naming Conventions

| OpenAI/OpenCode | Stitch AI Gateway |
|-----------------|-------------------|
| `"system"`      | `"MESSAGE_ROLE_SYSTEM"` |
| `"user"`        | `"MESSAGE_ROLE_USER"` |
| `"assistant"`   | `"MESSAGE_ROLE_ASSISTANT"` |

#### Content Structure Differences

**OpenAI (what OpenCode expects):**
```typescript
content: string | Array<{
  type: "text" | "tool-call" | "tool-result",
  text?: string,
  toolCallId?: string,
  // ...
}>
```

**Stitch:**
```typescript
content: Array<{
  type: "CONTENT_TYPE_TEXT" | "CONTENT_TYPE_REASONING",
  data: string,
  explicit_caching_control?: { enabled: boolean }
}>
```

#### Tool Call Format

**Status:** ⚠️ **Tool calls are NOT documented in the Stitch API**

Based on [`gateway-client.ts`](stitch-cli/src/ai/gateway-client.ts), Stitch only handles:
- Text content (`CONTENT_TYPE_TEXT`)
- Reasoning content (`CONTENT_TYPE_REASONING`)

**Implication:** Tool calls must be implemented at the OpenCode layer if needed, or the Stitch backend must be extended.

#### Metadata Handling

**Cache Control:**
- Stitch supports `explicit_caching_control: { enabled: true }` per content block
- Used for prompt caching optimization
- OpenCode's `cache_control` must be transformed

**Reasoning Budget:**
- Optional `reasoning_config.reasoning_budget` in config
- Controls token budget for reasoning models

#### Error Response Structure

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Model not found",
    "details": {}
  }
}
```

---

### 1.3 Current Stitch Provider Implementation

#### Location
[`opencode/packages/opencode/src/provider/provider.ts:1050-1400`](opencode/packages/opencode/src/provider/provider.ts:1050)

#### What's Implemented

**✅ URL Rewriting (lines 1100-1103):**
```typescript
if (shouldRewrite) {
  url = url.replace("/chat/completions", "/stream-chat-completion")
}
```

**✅ Request Transformation (lines 1172-1218):**
- Converts OpenAI message format → Stitch format
- Maps role names (`user` → `MESSAGE_ROLE_USER`)
- Wraps in `request` envelope
- Adds `client_options`

**✅ Response Transformation (lines 1238-1295):**
- Unwraps `result.response` structure
- Converts `content` array → `delta` object
- Maps usage statistics

**✅ Streaming Support (lines 1301-1357):**
- Creates `TransformStream` for chunk processing
- Attempts to parse SSE lines

**✅ Non-streaming Support (lines 1358-1383):**
- Transforms full JSON response

#### What's Missing/Broken

**❌ Streaming Format Mismatch:**
- Current code expects SSE format with `data:` prefix
- Stitch actually sends NDJSON (newline-delimited JSON)
- Lines 1316-1335 incorrectly parse `data:` lines

**❌ Tool Call Support:**
- No transformation for tool-call/tool-result messages
- Stitch API doesn't document tool call format
- Would require backend extension or client-side handling

**❌ Cache Control Markers:**
- OpenCode's `cache_control` not transformed to `explicit_caching_control`
- Prompt caching optimization unavailable

**❌ Reasoning Content:**
- `CONTENT_TYPE_REASONING` not properly mapped to OpenCode's reasoning format
- May appear as regular text instead of reasoning blocks

**❌ Error Handling:**
- No specific handling for Stitch error format
- Generic error passthrough may not surface useful details

**❌ Finish Reason Mapping:**
- Stitch finish reasons not mapped to OpenCode expectations
- May cause incorrect state transitions

**❌ Partial Delta Handling:**
- No accumulation logic for partial tool calls or reasoning
- Relies on complete chunks per stream event

---

## Phase 2: Gap Analysis

### 2.1 Request Format Mismatches

| Component | OpenAI/OpenCode | Stitch | Transformation Required |
|-----------|-----------------|--------|-------------------------|
| **Envelope** | None | `{ "request": {...} }` | ✅ Wrap entire payload |
| **Roles** | `"user"`, `"assistant"`, `"system"` | `"MESSAGE_ROLE_USER"`, etc. | ✅ Enum mapping |
| **Content (string)** | `content: "text"` | `content: [{ type: "CONTENT_TYPE_TEXT", data: "text" }]` | ✅ Array wrapping |
| **Content (array)** | `[{ type: "text", text: "..." }]` | `[{ type: "CONTENT_TYPE_TEXT", data: "..." }]` | ✅ Field renaming |
| **Config** | Top-level `temperature`, `max_tokens` | Nested in `config: {}` | ✅ Restructure |
| **Client Options** | Not present | Required `client_options` | ✅ Add metadata |
| **Tools** | `tools: [...]` | **Not supported** | ⚠️ Backend gap |
| **Cache Control** | `cache_control: { type: "ephemeral" }` | `explicit_caching_control: { enabled: true }` | ❌ Not implemented |

### 2.2 Response Format Mismatches

| Component | Stitch | OpenAI/OpenCode | Transformation Required |
|-----------|--------|-----------------|-------------------------|
| **Envelope** | `{ result: { response: {...} } }` | Direct response | ✅ Unwrap |
| **Choices** | `choices: [{ content: [...] }]` | `choices: [{ delta: {...} }]` | ✅ Restructure |
| **Content → Delta** | `content: [{ type, data }]` | `delta: { content: "..." }` | ✅ Flatten array |
| **Reasoning** | `{ type: "CONTENT_TYPE_REASONING", data: "..." }` | `delta: { reasoning_text: "..." }` | ❌ Not implemented |
| **Usage** | Nested under `response.usage` | Top-level `usage` | ✅ Extract |
| **Token Details** | `promptTokensDetails`, `completionTokensDetails` | `cache_write_tokens`, `reasoning_tokens` | ❌ Incomplete mapping |
| **Finish Reason** | String | Enum (`"stop"`, `"tool-calls"`, etc.) | ❌ Not mapped |

### 2.3 Streaming Protocol Differences

| Aspect | OpenCode Expectation | Stitch Reality | Issue |
|--------|---------------------|----------------|-------|
| **Format** | Server-Sent Events (SSE) | Newline-delimited JSON (NDJSON) | ❌ **Critical mismatch** |
| **Line Prefix** | `data: {...}\n\n` | `{...}\n` | ❌ Parsing breaks |
| **Termination** | `data: [DONE]\n\n` | Last JSON chunk or connection close | ⚠️ No explicit marker |
| **Content-Type** | `text/event-stream` | `application/json` (likely) | ⚠️ May need correction |
| **Chunking** | Delta per event | Multiple content items per chunk | ⚠️ Requires buffering |

**Critical Fix Needed:**  
The streaming parser in [`provider.ts:1305-1349`](opencode/packages/opencode/src/provider/provider.ts:1305) must be rewritten to handle NDJSON instead of SSE.

### 2.4 Field Naming Inconsistencies

| OpenCode Field | Stitch Field | Location |
|----------------|--------------|----------|
| `content.text` | `content[].data` | Message content |
| `cache_control` | `explicit_caching_control` | Content block |
| `temperature` | `config.temperature` | Config |
| `max_tokens` | `config.max_tokens` | Config |
| `usage.prompt_tokens` | `usage.promptTokens` | Usage stats |
| `usage.completion_tokens` | `usage.completionTokens` | Usage stats |
| `usage.cache_write_tokens` | `usage.promptTokensDetails.inputCacheCreationTokens` | Cache stats |
| `usage.cache_read_tokens` | `usage.promptTokensDetails.cachedTokens` | Cache stats |

### 2.5 Tool Call Format Differences

**Status:** ⚠️ **Stitch does not support tool calls in documented API**

**Options:**
1. **Client-side tool handling:** OpenCode manages tools, Stitch only processes text
2. **Backend extension:** Add tool call support to Stitch AI Gateway
3. **Hybrid approach:** Simple tools client-side, complex tools via backend extensions

**Recommendation:** Start with client-side tool handling since OpenCode already has comprehensive tool infrastructure.

### 2.6 Error Handling Differences

| Aspect | OpenAI/OpenCode | Stitch |
|--------|-----------------|--------|
| **Status Codes** | Standard HTTP (401, 429, 500, etc.) | Same (assumed) |
| **Error Format** | `{ error: { message, type, code } }` | `{ error: { code, message, details } }` |
| **Rate Limits** | `429 Too Many Requests` with retry headers | Unknown |
| **Streaming Errors** | SSE error event or connection close | Connection close (assumed) |

---

## Phase 3: Architecture Design

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      OpenCode Agent                          │
│                   (session/llm.ts)                           │
└───────────────────┬─────────────────────────────────────────┘
                    │ OpenAI-compatible format
                    ↓
┌─────────────────────────────────────────────────────────────┐
│                   AI SDK Provider Layer                      │
│              (@ai-sdk/openai-compatible)                     │
└───────────────────┬─────────────────────────────────────────┘
                    │ HTTP Request
                    ↓
┌─────────────────────────────────────────────────────────────┐
│              Custom Fetch Wrapper                            │
│         (provider.ts:1050-1400)                              │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  1. URL Rewriting                                     │  │
│  │     /chat/completions → /stream-chat-completion      │  │
│  └───────────────────────────────────────────────────────┘  │
│                    ↓                                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  2. Request Transformation                            │  │
│  │     • Wrap in "request" envelope                     │  │
│  │     • Map roles (user → MESSAGE_ROLE_USER)           │  │
│  │     • Convert content to array format                │  │
│  │     • Add client_options                             │  │
│  │     • Transform cache_control markers                │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────┬─────────────────────────────────────────┘
                    │ HTTP POST
                    ↓
┌─────────────────────────────────────────────────────────────┐
│                Stitch AI Gateway                             │
│           (backend service)                                  │
│                                                               │
│  • Receives Stitch format request                           │
│  • Routes to LLM provider                                    │
│  • Streams NDJSON response                                   │
└───────────────────┬─────────────────────────────────────────┘
                    │ NDJSON stream
                    ↓
┌─────────────────────────────────────────────────────────────┐
│            Response Transformation Stream                     │
│         (provider.ts transform logic)                        │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  3. Stream Processing                                 │  │
│  │     • Parse NDJSON (NOT SSE!)                        │  │
│  │     • Unwrap result.response                         │  │
│  │     • Convert content array → delta object           │  │
│  │     • Map usage statistics                           │  │
│  │     • Transform to SSE format for AI SDK             │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────┬─────────────────────────────────────────┘
                    │ SSE format
                    ↓
┌─────────────────────────────────────────────────────────────┐
│                   AI SDK Stream Parser                       │
│              (expects SSE format)                            │
└───────────────────┬─────────────────────────────────────────┘
                    │ Parsed chunks
                    ↓
┌─────────────────────────────────────────────────────────────┐
│                   OpenCode Agent                             │
│              (processes streaming response)                  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Component Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                        Data Flow                             │
└─────────────────────────────────────────────────────────────┘

Request Direction (→):
  OpenCode Message → Request Transformer → Stitch Request

Response Direction (←):
  Stitch Response → Response Transformer → OpenCode Delta

Transformation Points:
  1. Request Transformer:  Lines 1172-1218
  2. Response Transformer: Lines 1238-1295
  3. Stream Transformer:   Lines 1301-1357 (NEEDS FIX)
```

### 3.3 Field-Level Mapping Tables

#### Request Transformation: OpenCode → Stitch

```typescript
// Input: OpenAI-compatible request
interface OpenAIRequest {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string | ContentBlock[];
  }>;
  temperature?: number;
  max_tokens?: number;
  tools?: Tool[];
  stream?: boolean;
}

// Output: Stitch request
interface StitchRequest {
  request: {
    model: string;
    fallback_model: string;
    messages: Array<{
      role: "MESSAGE_ROLE_SYSTEM" | "MESSAGE_ROLE_USER" | "MESSAGE_ROLE_ASSISTANT";
      content: Array<{
        type: "CONTENT_TYPE_TEXT" | "CONTENT_TYPE_REASONING";
        data: string;
        explicit_caching_control?: { enabled: boolean };
      }>;
    }>;
    config: {
      temperature: number;
      max_tokens: number;
      reasoning_config?: {
        reasoning_budget: number;
      };
    };
    client_options: {
      source: string;
      retry_options: { max_retries: number };
      request_options: {
        content_type: string;
        timeout_ms: number;
      };
    };
  };
}
```

**Mapping Logic:**

| OpenCode Field | Stitch Field | Transformation |
|----------------|--------------|----------------|
| `model` | `request.model` | Direct copy |
| — | `request.fallback_model` | Same as `model` |
| `messages[].role` | `request.messages[].role` | Map: `"user"` → `"MESSAGE_ROLE_USER"` |
| `messages[].content` (string) | `request.messages[].content[0]` | Wrap: `[{ type: "CONTENT_TYPE_TEXT", data: content }]` |
| `messages[].content[].text` | `request.messages[].content[].data` | Rename field |
| `messages[].content[].type` | `request.messages[].content[].type` | Map: `"text"` → `"CONTENT_TYPE_TEXT"` |
| `messages[].content[].cache_control` | `request.messages[].content[].explicit_caching_control` | Transform: `{ type: "ephemeral" }` → `{ enabled: true }` |
| `temperature` | `request.config.temperature` | Nest under `config` |
| `max_tokens` | `request.config.max_tokens` | Nest under `config` |
| — | `request.client_options` | Add static metadata |

**Special Cases:**

- **Tool calls:** Not supported by Stitch API. Must be filtered out or handled client-side.
- **Reasoning content:** Map to `CONTENT_TYPE_REASONING` if present.
- **Stream parameter:** Ignored (endpoint determines streaming).

#### Response Transformation: Stitch → OpenCode

```typescript
// Input: Stitch streaming chunk (NDJSON)
interface StitchChunk {
  result: {
    response: {
      choices: Array<{
        content: Array<{
          type: "CONTENT_TYPE_TEXT" | "CONTENT_TYPE_REASONING";
          data: string;
        }>;
        finish_reason?: string;
      }>;
      model?: string;
      usage?: {
        promptTokens: number;
        completionTokens: number;
        promptTokensDetails?: {
          inputCacheCreationTokens?: number;
          cachedTokens?: number;
        };
        completionTokensDetails?: {
          reasoningTokens?: number;
        };
      };
    };
  };
}

// Output: OpenAI-compatible SSE event
interface OpenAIChunk {
  choices: Array<{
    index: number;
    delta: {
      content?: string;
      reasoning_text?: string;
    };
    finish_reason?: string | null;
  }>;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cache_write_tokens?: number;
    cache_read_tokens?: number;
    reasoning_tokens?: number;
  };
}
```

**Mapping Logic:**

| Stitch Field | OpenCode Field | Transformation |
|--------------|----------------|----------------|
| `result.response.choices[].content[]` | `choices[].delta` | Flatten array to object |
| `content[].type === "CONTENT_TYPE_TEXT"` | `delta.content` | Extract `.data` |
| `content[].type === "CONTENT_TYPE_REASONING"` | `delta.reasoning_text` | Extract `.data` |
| `choices[].finish_reason` | `choices[].finish_reason` | Direct copy (may need mapping) |
| `response.model` | `model` | Unwrap |
| `response.usage.promptTokens` | `usage.prompt_tokens` | Rename (camelCase → snake_case) |
| `response.usage.completionTokens` | `usage.completion_tokens` | Rename |
| `usage.promptTokensDetails.inputCacheCreationTokens` | `usage.cache_write_tokens` | Extract and rename |
| `usage.promptTokensDetails.cachedTokens` | `usage.cache_read_tokens` | Extract and rename |
| `usage.completionTokensDetails.reasoningTokens` | `usage.reasoning_tokens` | Extract and rename |
| — | `usage.total_tokens` | Calculate: `prompt + completion` |

**Special Cases:**

- **Multiple content blocks:** Merge into single delta (text + reasoning)
- **Empty content array:** Emit empty delta
- **Usage only chunk:** Emit usage without delta

### 3.4 Transformation Logic (Pseudocode)

#### Request Transformation

```typescript
function transformRequestToStitch(openaiRequest: OpenAIRequest): StitchRequest {
  // 1. Transform messages
  const transformMessage = (msg: OpenAIMessage): StitchMessage => {
    // 1a. Map role
    const role = {
      'system': 'MESSAGE_ROLE_SYSTEM',
      'user': 'MESSAGE_ROLE_USER',
      'assistant': 'MESSAGE_ROLE_ASSISTANT'
    }[msg.role] || 'MESSAGE_ROLE_USER';
    
    // 1b. Transform content
    let contentArray: StitchContent[];
    
    if (typeof msg.content === 'string') {
      // Simple string content
      contentArray = [{
        type: 'CONTENT_TYPE_TEXT',
        data: msg.content
      }];
    } else {
      // Array content - filter and transform
      contentArray = msg.content
        .filter(block => {
          // Skip tool calls (not supported by Stitch)
          return block.type !== 'tool-call' && block.type !== 'tool-result';
        })
        .map(block => {
          const contentBlock: StitchContent = {
            type: block.type === 'text' ? 'CONTENT_TYPE_TEXT' : 'CONTENT_TYPE_REASONING',
            data: block.text || block.content || ''
          };
          
          // Transform cache control if present
          if (block.cache_control?.type === 'ephemeral') {
            contentBlock.explicit_caching_control = { enabled: true };
          }
          
          return contentBlock;
        });
    }
    
    return { role, content: contentArray };
  };
  
  // 2. Build Stitch request
  return {
    request: {
      model: openaiRequest.model,
      fallback_model: openaiRequest.model,
      messages: openaiRequest.messages.map(transformMessage),
      config: {
        temperature: openaiRequest.temperature ?? 1.0,
        max_tokens: openaiRequest.max_tokens ?? 8192,
        // Add reasoning config if needed
        ...(openaiRequest.reasoning_budget && {
          reasoning_config: {
            reasoning_budget: openaiRequest.reasoning_budget
          }
        })
      },
      client_options: {
        source: 'opencode',
        retry_options: { max_retries: 1 },
        request_options: {
          content_type: 'application/json',
          timeout_ms: 600000
        }
      }
    }
  };
}
```

#### Streaming Chunk Transformation (CRITICAL FIX)

```typescript
function createStitchStreamTransformer(): TransformStream {
  return new TransformStream({
    transform(chunk, controller) {
      // Decode chunk
      const text = new TextDecoder().decode(chunk);
      
      // Split by newlines (NDJSON format)
      const lines = text.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        try {
          // Parse JSON (NOT SSE!)
          const stitchChunk: StitchChunk = JSON.parse(line);
          
          // Transform to OpenAI format
          const openaiChunk = transformStitchChunkToOpenAI(stitchChunk);
          
          // Convert to SSE format for AI SDK
          const sseData = `data: ${JSON.stringify(openaiChunk)}\n\n`;
          controller.enqueue(new TextEncoder().encode(sseData));
          
        } catch (error) {
          // Skip malformed lines
          console.warn('Failed to parse NDJSON chunk:', error);
        }
      }
    },
    
    flush(controller) {
      // Emit [DONE] marker
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
    }
  });
}

function transformStitchChunkToOpenAI(stitchChunk: StitchChunk): OpenAIChunk {
  const response = stitchChunk?.result?.response;
  if (!response) {
    throw new Error('Invalid Stitch chunk: missing result.response');
  }
  
  const openaiChunk: OpenAIChunk = {
    choices: []
  };
  
  // Transform choices
  if (response.choices && Array.isArray(response.choices)) {
    openaiChunk.choices = response.choices.map((choice, index) => {
      const delta: any = {};
      
      // Extract content from array
      if (choice.content && Array.isArray(choice.content)) {
        for (const contentBlock of choice.content) {
          if (contentBlock.type === 'CONTENT_TYPE_TEXT' && contentBlock.data) {
            delta.content = (delta.content || '') + contentBlock.data;
          } else if (contentBlock.type === 'CONTENT_TYPE_REASONING' && contentBlock.data) {
            delta.reasoning_text = (delta.reasoning_text || '') + contentBlock.data;
          }
        }
      }
      
      return {
        index,
        delta,
        finish_reason: choice.finish_reason || null
      };
    });
  }
  
  // Add model if present
  if (response.model) {
    openaiChunk.model = response.model;
  }
  
  // Transform usage
  if (response.usage) {
    openaiChunk.usage = {
      prompt_tokens: response.usage.promptTokens || 0,
      completion_tokens: response.usage.completionTokens || 0,
      total_tokens: (response.usage.promptTokens || 0) + (response.usage.completionTokens || 0)
    };
    
    // Add cache tokens if present
    if (response.usage.promptTokensDetails) {
      if (response.usage.promptTokensDetails.inputCacheCreationTokens) {
        openaiChunk.usage.cache_write_tokens = response.usage.promptTokensDetails.inputCacheCreationTokens;
      }
      if (response.usage.promptTokensDetails.cachedTokens) {
        openaiChunk.usage.cache_read_tokens = response.usage.promptTokensDetails.cachedTokens;
      }
    }
    
    // Add reasoning tokens if present
    if (response.usage.completionTokensDetails?.reasoningTokens) {
      openaiChunk.usage.reasoning_tokens = response.usage.completionTokensDetails.reasoningTokens;
    }
  }
  
  return openaiChunk;
}
```

#### Non-Streaming Response Transformation

```typescript
async function transformNonStreamingResponse(response: Response): Promise<Response> {
  const responseText = await response.text();
  
  try {
    const stitchData = JSON.parse(responseText);
    const openaiData = transformStitchChunkToOpenAI(stitchData);
    
    return new Response(JSON.stringify(openaiData), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  } catch (error) {
    console.error('Failed to transform non-streaming response:', error);
    // Return original response if transformation fails
    return new Response(responseText, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }
}
```

#### Error Mapping

```typescript
function transformStitchError(stitchError: any): Error {
  // Stitch error format: { error: { code, message, details } }
  // OpenAI error format: { error: { message, type, code } }
  
  if (stitchError?.error) {
    return new Error(stitchError.error.message || 'Unknown error', {
      cause: {
        code: stitchError.error.code,
        details: stitchError.error.details
      }
    });
  }
  
  return new Error('Unknown Stitch error', { cause: stitchError });
}
```

### 3.5 Edge Case Handling Strategy

#### 1. Empty Responses

**Scenario:** Stitch returns empty content array  
**Current Behavior:** May crash or emit null  
**Solution:**
```typescript
if (!choice.content || choice.content.length === 0) {
  return { index, delta: {}, finish_reason: choice.finish_reason || null };
}
```

#### 2. Partial Stream Termination

**Scenario:** Stream ends mid-chunk  
**Current Behavior:** Buffer may contain incomplete JSON  
**Solution:**
```typescript
let buffer = '';

transform(chunk, controller) {
  buffer += new TextDecoder().decode(chunk, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line
  
  // Process complete lines...
}

flush(controller) {
  // Process remaining buffer
  if (buffer.trim()) {
    try {
      const chunk = JSON.parse(buffer);
      // Transform and enqueue...
    } catch (error) {
      console.warn('Incomplete chunk at end:', buffer);
    }
  }
}
```

#### 3. Backend Timeouts

**Scenario:** Stitch backend takes too long  
**Current Behavior:** Request hangs indefinitely  
**Solution:**
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 min

try {
  const response = await fetch(url, {
    signal: controller.signal,
    // ...
  });
} finally {
  clearTimeout(timeoutId);
}
```

#### 4. Malformed JSON Chunks

**Scenario:** Stitch sends invalid JSON  
**Current Behavior:** Stream may fail entirely  
**Solution:**
```typescript
try {
  const chunk = JSON.parse(line);
  // Process...
} catch (error) {
  console.warn('Skipping malformed chunk:', line);
  // Continue processing next chunks
}
```

#### 5. Tool Calls Mid-Stream

**Scenario:** OpenCode expects tool calls, but Stitch doesn't support them  
**Current Behavior:** Tool calls silently dropped  
**Solution:**
- **Option A:** Handle tools client-side (recommended)
- **Option B:** Return error when tools are requested
```typescript
if (openaiRequest.tools && openaiRequest.tools.length > 0) {
  throw new Error('Tool calls are not supported by Stitch provider');
}
```

#### 6. Multi-Turn State Consistency

**Scenario:** Cache state may desync across turns  
**Current Behavior:** May lose cache optimization  
**Solution:**
- Preserve `explicit_caching_control` markers across all transformations
- Ensure system prompt always has caching enabled
- Track which messages have been cached

#### 7. Metadata Preservation

**Scenario:** Custom metadata in messages may be lost  
**Current Behavior:** Extra fields dropped  
**Solution:**
```typescript
interface TransformContext {
  preserveMetadata?: boolean;
  metadata?: Record<string, unknown>;
}

function transformMessage(msg: OpenAIMessage, context: TransformContext): StitchMessage {
  const stitchMsg = { /* ... transformation ... */ };
  
  if (context.preserveMetadata && msg.metadata) {
    context.metadata = { ...context.metadata, [msg.id]: msg.metadata };
  }
  
  return stitchMsg;
}
```

#### 8. Reasoning Content Interleaving

**Scenario:** Reasoning and text content interleaved in same response  
**Current Behavior:** May only show text or reasoning, not both  
**Solution:**
```typescript
const delta: any = {};
let hasContent = false;

for (const contentBlock of choice.content) {
  if (contentBlock.type === 'CONTENT_TYPE_TEXT') {
    delta.content = (delta.content || '') + contentBlock.data;
    hasContent = true;
  } else if (contentBlock.type === 'CONTENT_TYPE_REASONING') {
    delta.reasoning_text = (delta.reasoning_text || '') + contentBlock.data;
    hasContent = true;
  }
}

if (!hasContent) {
  return { index, delta: {}, finish_reason: choice.finish_reason };
}
```

#### 9. Network Disconnections

**Scenario:** Connection drops mid-stream  
**Current Behavior:** Stream hangs or throws  
**Solution:**
```typescript
// Add connection monitoring
let lastChunkTime = Date.now();

const healthCheckInterval = setInterval(() => {
  if (Date.now() - lastChunkTime > 30000) { // 30s timeout
    controller.error(new Error('Stream timeout: no chunks received'));
    clearInterval(healthCheckInterval);
  }
}, 5000);

transform(chunk, controller) {
  lastChunkTime = Date.now();
  // ... process chunk ...
}

flush(controller) {
  clearInterval(healthCheckInterval);
}
```

#### 10. Rate Limiting

**Scenario:** Stitch returns 429 Too Many Requests  
**Current Behavior:** Error surfaced directly to user  
**Solution:**
```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After') || '60';
  throw new RateLimitError(
    `Rate limit exceeded. Retry after ${retryAfter} seconds.`,
    { retryAfter: parseInt(retryAfter) }
  );
}
```

---

## Phase 4: Implementation Roadmap

### 4.1 File Modification Checklist

#### Primary File: [`provider.ts`](opencode/packages/opencode/src/provider/provider.ts)

**Lines to Modify:**

| Line Range | Current State | Modification Required | Priority |
|------------|---------------|----------------------|----------|
| 1100-1130 | URL rewriting + headers | ✅ Working | Low |
| 1172-1218 | Request transformation | ⚠️ Missing cache control, tool handling | Medium |
| 1238-1295 | Response transformation | ⚠️ Incomplete reasoning/usage mapping | Medium |
| 1301-1357 | **Streaming parser** | ❌ **SSE→NDJSON critical fix** | **CRITICAL** |
| 1358-1383 | Non-streaming handler | ⚠️ Error handling incomplete | Medium |

**New Functions to Add:**

```typescript
// Line ~1050: Add helper functions before main fetch wrapper

/**
 * Transform OpenCode cache_control to Stitch explicit_caching_control
 */
function transformCacheControl(block: ContentBlock): StitchContent {
  const stitchBlock: StitchContent = {
    type: block.type === 'text' ? 'CONTENT_TYPE_TEXT' : 'CONTENT_TYPE_REASONING',
    data: block.text || ''
  };
  
  if (block.cache_control?.type === 'ephemeral') {
    stitchBlock.explicit_caching_control = { enabled: true };
  }
  
  return stitchBlock;
}

/**
 * Create NDJSON stream transformer (replaces SSE parser)
 */
function createNDJSONTransformer(): TransformStream {
  let buffer = '';
  
  return new TransformStream({
    transform(chunk, controller) {
      buffer += new TextDecoder().decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const stitchChunk = JSON.parse(line);
          const openaiChunk = transformStitchToOpenAI(stitchChunk);
          const sseData = `data: ${JSON.stringify(openaiChunk)}\n\n`;
          controller.enqueue(new TextEncoder().encode(sseData));
        } catch (error) {
          console.warn('[Stitch] Failed to parse NDJSON:', error);
        }
      }
    },
    
    flush(controller) {
      if (buffer.trim()) {
        try {
          const stitchChunk = JSON.parse(buffer);
          const openaiChunk = transformStitchToOpenAI(stitchChunk);
          const sseData = `data: ${JSON.stringify(openaiChunk)}\n\n`;
          controller.enqueue(new TextEncoder().encode(sseData));
        } catch (error) {
          console.warn('[Stitch] Incomplete chunk at stream end:', buffer);
        }
      }
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
    }
  });
}

/**
 * Map Stitch finish reasons to OpenAI format
 */
function mapFinishReason(stitchReason?: string): string | null {
  if (!stitchReason) return null;
  
  const mapping: Record<string, string> = {
    'stop': 'stop',
    'length': 'length',
    'content_filter': 'content-filter',
    'error': 'error'
  };
  
  return mapping[stitchReason] || 'unknown';
}
```

#### Supporting Files

**No changes required** (transformation is self-contained in provider.ts)

### 4.2 Implementation Steps (Ordered)

#### Step 1: Fix Streaming Parser (CRITICAL)
**Priority:** P0 - Blocking  
**File:** [`provider.ts:1301-1357`](opencode/packages/opencode/src/provider/provider.ts:1301)

**Tasks:**
1. Replace SSE parser with NDJSON parser
2. Remove `data:` prefix parsing logic
3. Add line-by-line JSON parsing
4. Maintain buffer for incomplete lines
5. Test with actual Stitch streaming endpoint

**Validation:**
```bash
# Test streaming response
curl -X POST https://stitch-gateway/stream-chat-completion \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"request":{...}}' \
  | head -n 10
```

#### Step 2: Enhance Request Transformation
**Priority:** P1 - High  
**File:** [`provider.ts:1172-1218`](opencode/packages/opencode/src/provider/provider.ts:1172)

**Tasks:**
1. Add `transformCacheControl()` helper
2. Handle `cache_control` markers in content blocks
3. Add reasoning budget support
4. Filter out tool calls (or error if present)
5. Validate all fields map correctly

**Validation:**
- Log transformed request
- Compare against known-good Stitch CLI format
- Test cache control preservation

#### Step 3: Improve Response Transformation
**Priority:** P1 - High  
**File:** [`provider.ts:1238-1295`](opencode/packages/opencode/src/provider/provider.ts:1238)

**Tasks:**
1. Add `mapFinishReason()` helper
2. Properly extract reasoning tokens
3. Map all usage fields correctly
4. Handle empty content arrays
5. Support interleaved reasoning + text

**Validation:**
- Verify usage stats accuracy
- Test reasoning model responses
- Check finish reason values

#### Step 4: Add Comprehensive Error Handling
**Priority:** P2 - Medium  
**File:** [`provider.ts:1358-1395`](opencode/packages/opencode/src/provider/provider.ts:1358)

**Tasks:**
1. Detect Stitch error format
2. Transform to OpenAI error format
3. Add timeout handling
4. Handle rate limiting (429)
5. Graceful degradation on parse errors

**Validation:**
- Test with invalid auth
- Test with rate limits
- Test with malformed responses

#### Step 5: Implement Partial Delta Handling
**Priority:** P2 - Medium  
**File:** New functions in [`provider.ts`](opencode/packages/opencode/src/provider/provider.ts)

**Tasks:**
1. Add state tracking for incomplete tool calls
2. Buffer partial reasoning content
3. Emit complete deltas only
4. Handle multi-chunk messages

**Validation:**
- Test with long responses
- Verify no content loss
- Check delta ordering

#### Step 6: Add Tool Call Validation
**Priority:** P2 - Medium  
**File:** [`provider.ts:1172-1218`](opencode/packages/opencode/src/provider/provider.ts:1172)

**Tasks:**
1. Detect tool calls in request
2. Log warning or throw error
3. Document limitation
4. Provide workaround guidance

**Validation:**
- Test with tool-using agents
- Verify error messages are clear

#### Step 7: Implement Message Completion Logic
**Priority:** P3 - Low  
**File:** [`provider.ts`](opencode/packages/opencode/src/provider/provider.ts)

**Tasks:**
1. Track message completion state
2. Emit finish events correctly
3. Handle incomplete streams gracefully

#### Step 8: Add Retry Logic
**Priority:** P3 - Low  
**File:** [`provider.ts`](opencode/packages/opencode/src/provider/provider.ts)

**Tasks:**
1. Implement exponential backoff
2. Respect `Retry-After` headers
3. Add max retry configuration
4. Log retry attempts

#### Step 9: Implement Timeout Handling
**Priority:** P3 - Low  
**File:** [`provider.ts`](opencode/packages/opencode/src/provider/provider.ts)

**Tasks:**
1. Add configurable timeout (default 10min)
2. Use `AbortSignal.timeout()`
3. Clean up on timeout
4. Emit timeout error

#### Step 10: Add Cancellation Support
**Priority:** P3 - Low  
**File:** [`provider.ts`](opencode/packages/opencode/src/provider/provider.ts)

**Tasks:**
1. Pass through abort signals
2. Clean up streams on abort
3. Test mid-stream cancellation

### 4.3 Failure Modes & Mitigation

#### Failure Mode 1: Streaming Format Mismatch

**Risk:** HIGH  
**Impact:** Streaming completely broken  
**Cause:** Current code expects SSE, Stitch sends NDJSON

**Mitigation:**
- Replace SSE parser immediately (Step 1)
- Add format detection (check for `data:` prefix)
- Fallback to NDJSON if SSE parsing fails
- Add comprehensive logging

**Long-term:**
- Negotiate format with backend (prefer SSE for standardization)
- Or: Add format negotiation header

#### Failure Mode 2: Tool Calls Not Supported

**Risk:** MEDIUM  
**Impact:** Agent functionality limited  
**Cause:** Stitch API doesn't support tool calls

**Mitigation:**
- Document limitation clearly
- Provide client-side tool handling (already exists in OpenCode)
- Consider MCP server integration as alternative
- Add tool call detection and graceful degradation

**Long-term:**
- Extend Stitch backend to support tool calls
- Or: Hybrid approach (simple tools client-side, complex via backend)

#### Failure Mode 3: Cache Control Lost

**Risk:** MEDIUM  
**Impact:** Performance degradation, higher costs  
**Cause:** Incomplete transformation of cache markers

**Mitigation:**
- Implement `transformCacheControl()` (Step 2)
- Test with cache-enabled models
- Monitor cache hit rates

**Long-term:**
- Validate cache optimization effectiveness
- Add cache statistics tracking

#### Failure Mode 4: Reasoning Content Mishandled

**Risk:** MEDIUM  
**Impact:** Reasoning models produce incorrect output  
**Cause:** `CONTENT_TYPE_REASONING` not mapped properly

**Mitigation:**
- Add reasoning content support (Step 3)
- Test with reasoning-capable models
- Verify reasoning text displayed correctly

#### Failure Mode 5: Partial Stream Corruption

**Risk:** LOW  
**Impact:** Messages incomplete or corrupted  
**Cause:** Buffer management issues, connection drops

**Mitigation:**
- Implement robust buffer handling (Step 5)
- Add health checks
- Graceful error recovery

#### Failure Mode 6: Error Messages Unclear

**Risk:** LOW  
**Impact:** Difficult debugging for users  
**Cause:** Stitch error format not transformed

**Mitigation:**
- Transform error format (Step 4)
- Add contextual error messages
- Log original errors for debugging

#### Failure Mode 7: Memory Leaks

**Risk:** LOW  
**Impact:** Long-running sessions crash  
**Cause:** Streams not cleaned up, buffers not released

**Mitigation:**
- Add cleanup in `finally` blocks
- Clear timers and intervals
- Test long-running sessions

**Long-term:**
- Add memory monitoring
- Implement stream lifecycle management

### 4.4 Architectural Risks

#### Risk 1: Tight Coupling to Stitch Format

**Assessment:** HIGH  
**Issue:** Transformation logic embedded in fetch wrapper  
**Impact:** Hard to maintain, test, and evolve

**Recommendation:**
- Extract transformation to separate module: `providers/stitch/transformer.ts`
- Create interface for provider-specific adapters
- Enable unit testing of transformation logic

**Future Architecture:**
```typescript
// providers/stitch/index.ts
export class StitchAdapter implements ProviderAdapter {
  transformRequest(request: OpenAIRequest): StitchRequest { ... }
  transformResponse(response: StitchResponse): OpenAIResponse { ... }
  createStreamTransformer(): TransformStream { ... }
}

// provider.ts
const adapter = getProviderAdapter(providerID);
const stitchRequest = adapter.transformRequest(openaiRequest);
```

#### Risk 2: No Version Negotiation

**Assessment:** MEDIUM  
**Issue:** Stitch API may change without detection  
**Impact:** Silent failures, incompatibility

**Recommendation:**
- Add API version header to requests
- Validate response format
- Add compatibility checks

```typescript
headers: {
  'X-API-Version': '1.0',
  'Accept': 'application/json;version=1.0'
}

// Validate response
if (response.headers.get('X-API-Version') !== '1.0') {
  console.warn('API version mismatch');
}
```

#### Risk 3: Limited Feature Parity

**Assessment:** MEDIUM  
**Issue:** Stitch lacks tool calls, may lack other features  
**Impact:** OpenCode agents can't use full feature set

**Recommendation:**
- Document feature support matrix
- Add capability detection
- Gracefully degrade when features unavailable

**Feature Support Matrix:**
```typescript
const STITCH_CAPABILITIES = {
  streaming: true,
  tools: false,
  reasoning: true,
  caching: true,
  multimodal: false,  // needs verification
  functionCalling: false
};
```

#### Risk 4: Testing Complexity

**Assessment:** MEDIUM  
**Issue:** Hard to test transformation without live backend  
**Impact:** Bugs discovered in production

**Recommendation:**
- Create mock Stitch responses
- Add unit tests for transformers
- Integration tests with test backend

```typescript
// tests/stitch-transformer.test.ts
describe('StitchTransformer', () => {
  it('transforms request correctly', () => {
    const input = createMockOpenAIRequest();
    const output = transformRequestToStitch(input);
    expect(output.request.model).toBe(input.model);
    expect(output.request.messages[0].role).toBe('MESSAGE_ROLE_USER');
  });
  
  it('handles NDJSON streaming', async () => {
    const stream = createMockNDJSONStream();
    const transformer = createNDJSONTransformer();
    const chunks = await collectStream(stream.pipeThrough(transformer));
    expect(chunks[0]).toContain('data: {');
  });
});
```

#### Risk 5: Performance Overhead

**Assessment:** LOW  
**Issue:** Double transformation (Stitch → OpenAI → AI SDK)  
**Impact:** Latency increase

**Recommendation:**
- Profile transformation performance
- Optimize hot paths
- Consider native Stitch SDK if overhead significant

**Measurement:**
```typescript
const start = performance.now();
const transformed = transformStitchToOpenAI(chunk);
const duration = performance.now() - start;
if (duration > 10) {
  console.warn('Slow transformation:', duration + 'ms');
}
```

### 4.5 Long-Term Maintainability

#### Recommendation 1: Extract Provider Adapter

**Refactor:**
```
opencode/packages/opencode/src/provider/
├── provider.ts (main provider logic)
├── adapters/
│   ├── stitch/
│   │   ├── transformer.ts (request/response transformation)
│   │   ├── stream.ts (NDJSON stream handling)
│   │   ├── types.ts (Stitch API types)
│   │   └── index.ts (exports)
│   ├── openai/
│   │   └── ... (if needed)
│   └── adapter.ts (interface)
└── ...
```

#### Recommendation 2: Add Comprehensive Tests

**Test Coverage:**
- Unit tests for transformers (80%+ coverage)
- Integration tests with mock backend
- E2E tests with real Stitch backend
- Performance benchmarks

#### Recommendation 3: Monitor Transformation Metrics

**Telemetry:**
- Transformation latency
- Parse error rates
- Cache hit rates
- Usage statistics accuracy

#### Recommendation 4: Version Lock Stitch API

**Dependencies:**
- Pin Stitch API version
- Add changelog tracking
- Automated compatibility tests
- Version migration guide

---

## Summary & Next Steps

### What's Working ✅

1. **Request transformation:** Basic structure correct
2. **URL rewriting:** Proper endpoint selection
3. **Non-streaming:** Basic response parsing works

### Critical Fixes Needed ❌

1. **Streaming parser:** SSE → NDJSON (BLOCKING)
2. **Cache control:** Not transformed
3. **Tool call handling:** Not supported
4. **Error mapping:** Incomplete

### Implementation Priority

**Phase 1 (P0 - Week 1):**
- Fix streaming parser (Step 1)
- Test with real Stitch backend
- Verify basic functionality

**Phase 2 (P1 - Week 2):**
- Enhance request transformation (Step 2)
- Improve response transformation (Step 3)
- Add error handling (Step 4)

**Phase 3 (P2 - Week 3):**
- Partial delta handling (Step 5)
- Tool call validation (Step 6)
- Documentation

**Phase 4 (P3 - Week 4+):**
- Retry logic (Step 8)
- Timeout handling (Step 9)
- Cancellation support (Step 10)
- Refactor to adapter pattern

### Success Metrics

- ✅ Streaming responses work correctly
- ✅ All usage statistics accurate
- ✅ Cache optimization functional
- ✅ Error messages clear
- ✅ No data loss in transformations
- ✅ Tests passing (>80% coverage)

### Open Questions

1. **Tool calls:** How should OpenCode handle tools with Stitch?
   - Client-side tool execution? (recommended)
   - Request Stitch backend extension?
   
2. **API versioning:** Should we add version negotiation?
   - Yes - add `X-API-Version` header
   
3. **Multimodal support:** Does Stitch support images/audio?
   - Needs verification with backend team
   
4. **Rate limiting:** How does Stitch handle rate limits?
   - Test and document behavior

---

## Appendix

### A. Example Transformations

#### A.1 Simple Request

**Input (OpenAI):**
```json
{
  "model": "stitch-1",
  "messages": [
    { "role": "user", "content": "Hello" }
  ],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Output (Stitch):**
```json
{
  "request": {
    "model": "stitch-1",
    "fallback_model": "stitch-1",
    "messages": [
      {
        "role": "MESSAGE_ROLE_USER",
        "content": [
          { "type": "CONTENT_TYPE_TEXT", "data": "Hello" }
        ]
      }
    ],
    "config": {
      "temperature": 0.7,
      "max_tokens": 1000
    },
    "client_options": {
      "source": "opencode",
      "retry_options": { "max_retries": 1 },
      "request_options": {
        "content_type": "application/json",
        "timeout_ms": 600000
      }
    }
  }
}
```

#### A.2 Streaming Response

**Stitch Stream (NDJSON):**
```
{"result":{"response":{"choices":[{"content":[{"type":"CONTENT_TYPE_TEXT","data":"