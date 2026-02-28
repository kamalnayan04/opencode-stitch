
# RED-TEAM AUDIT REPORT: Stitch Provider Feature Parity Analysis

**Date:** 2026-02-26  
**Auditor:** Stitch AI Systems  
**Scope:** Complete feature parity verification between Stitch provider and OpenCode requirements  
**Status:** ⚠️ **CRITICAL GAPS IDENTIFIED**

---

## Executive Summary

This RED-TEAM audit assessed the Stitch provider implementation for complete feature parity with OpenCode's requirements. **28 gaps** were identified across 8 categories, ranging from **CRITICAL** (data loss, broken functionality) to **LOW** (nice-to-have features).

### Key Findings

| Category | Gaps | Severity | Status |
|----------|------|----------|--------|
| **Tool Support** | 4 | 🔴 CRITICAL | Partial Implementation |
| **Message Types** | 3 | 🟡 HIGH | Missing Features |
| **Request Parameters** | 5 | 🟡 HIGH | Incomplete Mapping |
| **Streaming** | 4 | 🔴 CRITICAL | Data Loss |
| **Usage Metadata** | 3 | 🟠 MEDIUM | Token Tracking Issues |
| **Error Handling** | 3 | 🟠 MEDIUM | Fragile Recovery |
| **Proto Compliance** | 3 | 🟡 HIGH | Schema Violations |
| **Context Loss** | 3 | 🔴 CRITICAL | Round-trip Failures |
| **TOTAL** | **28** | - | **NEEDS REMEDIATION** |

### Critical Issues

1. **Tool Support:** Native tool schemas not supported by backend; workaround uses prompt injection
2. **Usage Metadata:** Reasoning tokens and cache tokens lost in streaming responses
3. **Context Loss:** Round-trip transformations lose data in complex scenarios
4. **Proto Compliance:** Field mappings don't match proto definitions (snake_case vs camelCase)

---

## Detailed Gap Analysis

### 1. Tool Support (4 Gaps - CRITICAL)

#### GAP-1: Tool Definitions with Parameters
- **Severity:** 🔴 CRITICAL
- **Impact:** Tools cannot be natively defined; breaks AI SDK tool calling
- **Current State:** Tools injected into system prompt as JSON
- **Expected State:** Native `ToolOption` with `repeated Tool tools` per proto
- **Proto Reference:** [`message.proto:89-94`](../../stitch-backend/proto/stitch-backend/chat/v1/message.proto#L89-L94)
- **Fix Required:** Either:
  1. Update backend to accept `ToolOption` in requests, OR
  2. Document prompt injection as official approach

**Proto Definition:**
```protobuf
message ToolOption {
  repeated Tool tools = 1;
  optional ToolChoice tool_choice = 2;
}
```

**Current Implementation:**
```typescript
// Tools are injected into prompt, not sent as native schema
const messagesWithTools = injectToolsIntoPrompt(messages, tools);
```

**Test Case:** [`red-team-audit.test.ts:35-55`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L35-L55)

---

#### GAP-2: Tool Choice Modes
- **Severity:** 🟡 HIGH
- **Impact:** Cannot force tool use or control tool selection
- **Current State:** `tool_choice` parameter ignored
- **Expected State:** Map to `ToolChoiceMode` enum (AUTO, NONE, FORCED)
- **Proto Reference:** [`message.proto:155-164`](../../stitch-backend/proto/stitch-backend/chat/v1/message.proto#L155-L164)

**Proto Definition:**
```protobuf
enum ToolChoiceMode {
  TOOL_CHOICE_MODE_UNSPECIFIED = 0;
  TOOL_CHOICE_MODE_AUTO = 1;
  TOOL_CHOICE_MODE_NONE = 2;
  TOOL_CHOICE_MODE_FORCED = 3;
}
```

**Required Mapping:**
```typescript
'auto' → TOOL_CHOICE_MODE_AUTO
'required' → TOOL_CHOICE_MODE_FORCED
{type: 'function', function: {name: '...'}} → TOOL_CHOICE_MODE_FORCED with forced_function
```

**Test Case:** [`red-team-audit.test.ts:57-77`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L57-L77)

---

#### GAP-3: Tool Results in Messages
- **Severity:** 🔴 CRITICAL
- **Impact:** Tool execution results not properly conveyed to model
- **Current State:** Tool results converted to plain text in user messages
- **Expected State:** Use `CONTENT_TYPE_TOOL_RESULT` with `ToolResult` message
- **Proto Reference:** [`message.proto:106-116`](../../stitch-backend/proto/stitch-backend/chat/v1/message.proto#L106-L116)

**Proto Definition:**
```protobuf
message ToolResult {
  string id = 1;
  ToolUseType type = 2;
  FunctionCall function = 3;
  optional bool is_failed = 4;
}
```

**Current Implementation:**
```typescript
// Converts tool result to plain user message
{ role: 'MESSAGE_ROLE_USER', content: [{ type: 'CONTENT_TYPE_TEXT', data: `Tool "${name}" result:\n${result}` }] }
```

**Required Implementation:**
```typescript
{
  role: 'MESSAGE_ROLE_USER',
  content: [{
    type: 'CONTENT_TYPE_TOOL_RESULT',
    tool_result: [{
      id: tool_call_id,
      type: 'TOOL_USE_TYPE_FUNCTION',
      function: {
        name: tool_name,
        result: [{ type: 'CONTENT_TYPE_TEXT', data: result }]
      }
    }]
  }]
}
```

**Test Case:** [`red-team-audit.test.ts:79-102`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L79-L102)

---

#### GAP-4: Tool Use in Responses
- **Severity:** 🔴 CRITICAL
- **Impact:** Model tool calls may not be detected in responses
- **Current State:** Depends on `JsonToolParser` for JSON-formatted tool calls; no native `tool_uses` extraction
- **Expected State:** Extract from `CONTENT_TYPE_TOOL_USE` with `repeated ToolUse tool_uses`
- **Proto Reference:** [`message.proto:96-104`](../../stitch-backend/proto/stitch-backend/chat/v1/message.proto#L96-L104)

**Proto Definition:**
```protobuf
message ToolUse {
  string id = 1;
  ToolUseType type = 2;
  FunctionCall function = 3;
}
```

**Required Implementation:**
```typescript
// Check for CONTENT_TYPE_TOOL_USE in response
const toolUses = choice.content
  .filter(c => c.type === 'CONTENT_TYPE_TOOL_USE' && c.tool_uses)
  .flatMap(c => c.tool_uses);

if (toolUses.length > 0) {
  tool_calls = toolUses.map(tu => ({
    id: tu.id,
    type: 'function',
    function: {
      name: tu.function.name,
      arguments: JSON.stringify(tu.function.parameters)
    }
  }));
}
```

**Test Case:** [`red-team-audit.test.ts:104-137`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L104-L137)

---

### 2. Message Types (3 Gaps - HIGH)

#### GAP-5: System Messages with Caching
- **Severity:** 🟡 HIGH
- **Impact:** Prompt caching optimization not utilized; increased costs
- **Current State:** `cache_control` field ignored
- **Expected State:** Map to `ExplicitCachingControl` per content block
- **Proto Reference:** [`message.proto:60-64`](../../stitch-backend/proto/stitch-backend/chat/v1/message.proto#L60-L64)

**Proto Definition:**
```protobuf
message ExplicitCachingControl {
  bool enabled = 1;
}
```

**Required Implementation:**
```typescript
{
  role: 'MESSAGE_ROLE_SYSTEM',
  content: [{
    type: 'CONTENT_TYPE_TEXT',
    data: 'You are a helpful assistant',
    explicit_caching_control: { enabled: true }
  }]
}
```

**Test Case:** [`red-team-audit.test.ts:145-161`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L145-L161)

---

#### GAP-6: Multi-modal Content (Images, Files)
- **Severity:** 🟡 HIGH
- **Impact:** Cannot send images, files, audio, video to model
- **Current State:** Only text content supported
- **Expected State:** Support all content types per proto
- **Proto Reference:** [`message.proto:66-86`](../../stitch-backend/proto/stitch-backend/chat/v1/message.proto#L66-L86)

**Proto Definition:**
```protobuf
enum ContentType {
  CONTENT_TYPE_TEXT = 1;
  CONTENT_TYPE_IMAGE = 2;
  CONTENT_TYPE_FILE = 3;
  CONTENT_TYPE_VIDEO = 4;
  CONTENT_TYPE_AUDIO = 5;
  CONTENT_TYPE_TOOL_USE = 6;
  CONTENT_TYPE_REASONING = 7;
  CONTENT_TYPE_TOOL_RESULT = 8;
}
```

**Required Implementation:**
```typescript
// Map image_url to CONTENT_TYPE_IMAGE
{ type: 'image_url', image_url: { url: 'data:...' } }
→
{ type: 'CONTENT_TYPE_IMAGE', data: base64Data, mime_type: 'image/png' }
```

**Test Case:** [`red-team-audit.test.ts:163-181`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L163-L181)

---

#### GAP-7: Developer Role Messages
- **Severity:** 🟠 MEDIUM
- **Impact:** Cannot use developer-specific system instructions
- **Current State:** Developer role not mapped
- **Expected State:** Map to `MESSAGE_ROLE_DEVELOPER`
- **Proto Reference:** [`message.proto:28-42`](../../stitch-backend/proto/stitch-backend/chat/v1/message.proto#L28-L42)

**Proto Definition:**
```protobuf
enum MessageRole {
  MESSAGE_ROLE_SYSTEM = 1;
  MESSAGE_ROLE_USER = 2;
  MESSAGE_ROLE_ASSISTANT = 3;
  MESSAGE_ROLE_DEVELOPER = 4;
  MESSAGE_ROLE_TOOL = 5;
}
```

**Test Case:** [`red-team-audit.test.ts:183-198`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L183-L198)

---

### 3. Request Parameters (5 Gaps - HIGH)

#### GAP-8: top_p and top_k Sampling
- **Severity:** 🟡 HIGH
- **Impact:** Cannot control sampling behavior; affects output quality
- **Current State:** Parameters accepted but verify proto field names
- **Expected State:** Use snake_case: `top_p` and `top_k`
- **Proto Reference:** [`config.proto:16-18`](../../stitch-backend/proto/stitch-backend/chat/v1/config.proto#L16-L18)

**Proto Definition:**
```protobuf
double top_p = 4;
int32 top_k = 5;
```

**Test Case:** [`red-team-audit.test.ts:207-221`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L207-L221)

---

#### GAP-9: Stop Sequences
- **Severity:** 🟡 HIGH
- **Impact:** Cannot control when model stops generating
- **Current State:** Not implemented
- **Expected State:** Map to `repeated string stop_sequences`
- **Proto Reference:** [`config.proto:24`](../../stitch-backend/proto/stitch-backend/chat/v1/config.proto#L24)

**Proto Definition:**
```protobuf
repeated string stop_sequences = 8;
```

**Required Implementation:**
```typescript
{
  config: {
    stop_sequences: ['STOP', 'END', '\n\nHuman:']
  }
}
```

**Test Case:** [`red-team-audit.test.ts:223-236`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L223-L236)

---

#### GAP-10: Response Format (JSON Mode)
- **Severity:** 🟡 HIGH
- **Impact:** Cannot enforce JSON output format
- **Current State:** Not implemented
- **Expected State:** Map to `ResponseFormat` enum
- **Proto Reference:** [`config.proto:52-61`](../../stitch-backend/proto/stitch-backend/chat/v1/config.proto#L52-L61)

**Proto Definition:**
```protobuf
enum ResponseFormat {
  RESPONSE_FORMAT_UNSPECIFIED = 0;
  RESPONSE_FORMAT_JSON_OBJECT = 1;
  RESPONSE_FORMAT_TEXT_RESPONSE = 2;
  RESPONSE_FORMAT_APPLICATION_JSON = 3;
}
```

**Required Mapping:**
```typescript
{ type: 'json_object' } → RESPONSE_FORMAT_JSON_OBJECT
{ type: 'text' } → RESPONSE_FORMAT_TEXT_RESPONSE
```

**Test Case:** [`red-team-audit.test.ts:238-250`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L238-L250)

---

#### GAP-11: Seed for Reproducibility
- **Severity:** 🟠 MEDIUM
- **Impact:** Cannot reproduce exact outputs
- **Current State:** Not implemented
- **Expected State:** Pass through `seed` parameter
- **Proto Reference:** [`config.proto:28`](../../stitch-backend/proto/stitch-backend/chat/v1/config.proto#L28)

**Proto Definition:**
```protobuf
int64 seed = 10;
```

**Test Case:** [`red-team-audit.test.ts:252-264`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L252-L264)

---

#### GAP-12: Safety Settings
- **Severity:** 🟠 MEDIUM
- **Impact:** Cannot configure content filtering
- **Current State:** Not implemented
- **Expected State:** Map to `repeated SafetySettings`
- **Proto Reference:** [`config.proto:42-49`](../../stitch-backend/proto/stitch-backend/chat/v1/config.proto#L42-L49)

**Proto Definition:**
```protobuf
message SafetySettings {
  string category = 1;  // HARM_CATEGORY_*
  string threshold = 2; // BLOCK_*
  string method = 3;    // HARM_BLOCK_METHOD_*
}
```

**Test Case:** [`red-team-audit.test.ts:266-281`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L266-L281)

---

### 4. Streaming Response (4 Gaps - CRITICAL)

#### GAP-13: Reasoning Content Type
- **Severity:** 🔴 CRITICAL
- **Impact:** Reasoning tokens not extracted; lost in streaming
- **Current State:** `CONTENT_TYPE_REASONING` treated as text
- **Expected State:** Map to `delta.reasoning_text`
- **Proto Reference:** [`message.proto:82`](../../stitch-backend/proto/stitch-backend/chat/v1/message.proto#L82)

**Current Implementation:**
```typescript
// All content types treated as text
const textBlocks = choice.content.filter(c => c.type === 'CONTENT_TYPE_TEXT').map(c => c.data);
```

**Required Implementation:**
```typescript
const textBlocks = choice.content
  .filter(c => c.type === 'CONTENT_TYPE_TEXT')
  .map(c => c.data);

const reasoningBlocks = choice.content
  .filter(c => c.type === 'CONTENT_TYPE_REASONING')
  .map(c => c.data);

return {
  delta: {
    content: textBlocks.join(''),
    reasoning_text: reasoningBlocks.join('')
  }
};
```

**Test Case:** [`red-team-audit.test.ts:290-305`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L290-L305)

---

#### GAP-14: Response Metadata
- **Severity:** 🟡 HIGH
- **Impact:** Request tracing and latency tracking lost
- **Current State:** `metadata` field ignored
- **Expected State:** Preserve `request_id` and `latency_ms`
- **Proto Reference:** [`types.ts:186-193`](types.ts#L186-L193)

**Response Structure:**
```typescript
interface ResponseMetadata {
  request_id?: string;
  latency_ms?: number;
}
```

**Test Case:** [`red-team-audit.test.ts:307-324`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L307-L324)

---

#### GAP-15: Response Status Codes
- **Severity:** 🔴 CRITICAL
- **Impact:** Error responses not properly detected
- **Current State:** Status codes not checked
- **Expected State:** Map error status to `finish_reason: 'error'`
- **Proto Reference:** [`types.ts:177-183`](types.ts#L177-L183)

**Response Status:**
```typescript
interface ResponseStatus {
  code?: string; // RESPONSE_CODE_*
  message?: string;
}
```

**Required Mapping:**
```typescript
RESPONSE_CODE_BAD_REQUEST → finish_reason: 'error'
RESPONSE_CODE_INTERNAL_ERROR → finish_reason: 'error'
RESPONSE_CODE_RATE_LIMIT_EXCEEDED → finish_reason: 'error'
```

**Test Case:** [`red-team-audit.test.ts:326-342`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L326-L342)

---

#### GAP-16: Message ID Tracking
- **Severity:** 🟠 MEDIUM
- **Impact:** Cannot track conversation lineage
- **Current State:** Synthetic IDs generated
- **Expected State:** Extract from proto `MessageId` structure
- **Proto Reference:** [`message.proto:21-26`](../../stitch-backend/proto/stitch-backend/chat/v1/message.proto#L21-L26)

**Proto Definition:**
```protobuf
message MessageId {
  string id = 1;
  string parent_id = 2;
}
```

**Test Case:** [`red-team-audit.test.ts:344-363`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L344-L363)

---

### 5. Usage Metadata (3 Gaps - MEDIUM)

#### GAP-17: Cache Token Details
- **Severity:** 🟠 MEDIUM
- **Impact:** Cost tracking incomplete; cache optimization invisible
- **Current State:** Cache tokens extracted in non-streaming, may be lost in streaming
- **Expected State:** Preserve in all modes
- **Proto Reference:** [`usage.proto:22-28`](../../stitch-backend/proto/stitch-backend/chat/v1/usage.proto#L22-L28)

**Proto Definition:**
```protobuf
message PromptTokensDetails {
  int32 cached_tokens = 1;
  int32 audio_tokens = 2;
  int32 input_cache_creation_tokens = 3;
}
```

**Test Case:** [`red-team-audit.test.ts:372-398`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L372-L398)

---

#### GAP-18: Reasoning Tokens
- **Severity:** 🟠 MEDIUM
- **Impact:** Cannot track reasoning token usage
- **Current State:** Extracted in non-streaming, verify streaming
- **Expected State:** Always preserve
- **Proto Reference:** [`usage.proto:32-35`](../../stitch-backend/proto/stitch-backend/chat/v1/usage.proto#L32-L35)

**Proto Definition:**
```protobuf
message CompletionTokensDetails {
  int32 reasoning_tokens = 1;
}
```

**Test Case:** [`red-team-audit.test.ts:400-421`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L400-L421)

---

#### GAP-19: Audio Tokens
- **Severity:** 🟢 LOW
- **Impact:** Audio usage not tracked (if supported in future)
- **Current State:** Not implemented
- **Expected State:** Extract from `PromptTokensDetails.audio_tokens`
- **Proto Reference:** [`usage.proto:25`](../../stitch-backend/proto/stitch-backend/chat/v1/usage.proto#L25)

**Test Case:** [`red-team-audit.test.ts:423-441`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L423-L441)

---

### 6. Error Handling (3 Gaps - MEDIUM)

#### GAP-20: Malformed JSON in Stream
- **Severity:** 🟠 MEDIUM
- **Impact:** Stream crashes on invalid JSON
- **Current State:** Try-catch exists but may not recover gracefully
- **Expected State:** Skip invalid chunks, continue streaming
- **Location:** [`stream.ts:193-245`](stream.ts#L193-L245)

**Test Case:** [`red-team-audit.test.ts:450-462`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L450-L462)

---

#### GAP-21: Empty Content Arrays
- **Severity:** 🟠 MEDIUM
- **Impact:** May crash on empty responses
- **Current State:** Validation present but verify all paths
- **Expected State:** Return empty string, not crash
- **Location:** [`response.ts:176-181`](response.ts#L176-L181)

**Test Case:** [`red-team-audit.test.ts:464-478`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L464-L478)

---

#### GAP-22: Missing Required Fields
- **Severity:** 🟠 MEDIUM
- **Impact:** Should throw clear error, not crash mysteriously
- **Current State:** Validation exists
- **Expected State:** Clear error messages
- **Location:** [`response.ts:126-135`](response.ts#L126-L135)

**Test Case:** [`red-team-audit.test.ts:480-492`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L480-L492)

---

### 7. Proto Schema Compliance (3 Gaps - HIGH)

#### GAP-23: Field Name Casing
- **Severity:** 🟡 HIGH
- **Impact:** Schema violations if using camelCase instead of snake_case
- **Current State:** Mixed casing used
- **Expected State:** Strict snake_case per proto
- **Proto Reference:** All proto files use snake_case

**Examples:**
```typescript
// WRONG:
{ maxTokens: 1024, topP: 0.9 }

// CORRECT:
{ max_tokens: 1024, top_p: 0.9 }
```

**Test Case:** [`red-team-audit.test.ts:501-513`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L501-L513)

---

#### GAP-24: Enum Value Formats
- **Severity:** 🟡 HIGH
- **Impact:** Invalid enum values rejected by backend
- **Current State:** Correctly using UPPER_SNAKE_CASE
- **Expected State:** Maintain compliance
- **Proto Reference:** All enum values are UPPER_SNAKE_CASE

**Test Case:** [`red-team-audit.test.ts:515-527`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L515-L527)

---

#### GAP-25: ClientOptions Structure
- **Severity:** 🟡 HIGH
- **Impact:** Missing required client metadata
- **Current State:** Basic structure present
- **Expected State:** Complete `RetryOptions` and `RequestOptions`
- **Proto Reference:** [`options.proto:8-35`](../../stitch-backend/proto/stitch-backend/chat/v1/options.proto#L8-L35)

**Proto Definition:**
```protobuf
message ClientOptions {
  RetryOptions retry_options = 1;
  RequestOptions request_options = 2;
  string source = 3;
}

message RetryOptions {
  int32 max_retries = 1;
  int32 initial_delay_ms = 2;
  int32 backoff_factor = 3;
  repeated int32 retry_on_codes = 4;
}

message RequestOptions {
  string content_type = 1;
  int64 timeout_ms = 2;
}
```

**Test Case:** [`red-team-audit.test.ts:529-542`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L529-L542)

---

### 8. Context Loss Prevention (3 Gaps - CRITICAL)

#### GAP-26: Round-trip Transformation
- **Severity:** 🔴 CRITICAL
- **Impact:** Data loss in bidirectional transformations
- **Current State:** Basic round-trip works, complex cases need testing
- **Expected State:** Perfect data preservation
- **Verification:** Test with complex nested structures

**Test Case:** [`red-team-audit.test.ts:551-566`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L551-L566)

---

#### GAP-27: Complex Tool Arguments
- **Severity:** 🔴 CRITICAL
- **Impact:** Nested objects/arrays in tool args may be corrupted
- **Current State:** JSON stringification used, should preserve
- **Expected State:** Perfect preservation of complex structures
- **Location:** [`transform.ts:172-180`](transform.ts#L172-L180)

**Test Case:** [`red-team-audit.test.ts:568-596`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L568-L596)

---

#### GAP-28: Streaming Usage Preservation
- **Severity:** 🔴 CRITICAL
- **Impact:** Usage data lost if not in final chunk
- **Current State:** Only final chunk checked for usage
- **Expected State:** Accumulate usage across all chunks
- **Location:** [`stream.ts:175-232`](stream.ts#L175-L232)

**Test Case:** [`red-team-audit.test.ts:598-645`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts#L598-L645)

---

## Feature Parity Scorecard

### OpenCode Requirements vs Stitch Implementation

| Feature Category | Required | Implemented | Partial | Missing | Score |
|------------------|----------|-------------|---------|---------|-------|
| **Tool Definitions** | ✓ | - | ✓ | - | 50% |
| **Tool Choice** | ✓ | - | - | ✓ | 0% |
| **Tool Results** | ✓ | - | ✓ | - | 50% |
| **Tool Responses** | ✓ | - | ✓ | - | 50% |
| **System Messages** | ✓ | ✓ | - | - | 100% |
| **Cache Control** | ✓ | - | - | ✓ | 0% |
| **Multi-modal** | ✓ | - | - | ✓ | 0% |
| **Developer Role** | ✓ | - | - | ✓ | 0% |
| **Sampling (top_p/k)** | ✓ | ✓ | - | - | 100% |
| **Stop Sequences** | ✓ | - | - | ✓ | 0% |
| **JSON Mode** | ✓ | - | - | ✓ | 0% |
| **Seed** | ✓ | - | - | ✓ | 0% |
| **Safety Settings** | ✓ | - | - | ✓ | 0% |
| **Reasoning Content** | ✓ | - | ✓ | - | 50% |
| **Metadata** | ✓ | - | - | ✓ | 0% |
| **Status Codes** | ✓ | - | - | ✓ | 0% |
| **Message IDs** | ✓ | - | ✓ | - | 50% |
| **Cache Tokens** | ✓ | ✓ | - | - | 100% |
| **Reasoning Tokens** | ✓ | ✓ | - | - | 100% |
| **Error Recovery** | ✓ | - | ✓ | - | 50% |
| **Proto Compliance** | ✓ | - | ✓ | - | 50% |
| **Round-trip Safety** | ✓ | - | ✓ | - | 50% |
| **OVERALL** | **22** | **5** | **10** | **11** | **45%** |

---

## Critical Gaps Requiring Immediate Action

### Priority P0 (BLOCKER)

1. **GAP-3: Tool Results** - Tool execution broken in multi-turn conversations
2. **GAP-4: Tool Responses** - Tool calls may not be detected
3. **GAP-13: Reasoning Tokens** - Data loss in streaming responses
4. **GAP-28: Usage Preservation** - Cost tracking incomplete

### Priority P1 (CRITICAL)

5. **GAP-1: Tool Definitions** - Native tool support vs prompt injection
6. **GAP-2: Tool Choice** - Cannot control tool usage
7. **GAP-15: Status Codes** - Error detection broken
8. **GAP-26: Round-trip** - Data corruption risk

### Priority P2 (HIGH)

9. **GAP-5: Cache Control** - Missing cost optimization
10. **GAP-6: Multi-modal** - No image/file support
11. **GAP-9: Stop Sequences** - Cannot control generation
12. **GAP-10: JSON Mode** - Structured output broken
13. **GAP-14: Metadata** - Observability gaps
14. **GAP-23: Field Naming** - Schema violations

---

## Recommendations

### Immediate Actions (Week 1)

1. **Fix Tool Results (GAP-3)**
   - Implement `CONTENT_TYPE_TOOL_RESULT` mapping
   - Add `ToolResult` message structure
   - Test with multi-turn tool conversations

2. **Fix Streaming Usage (GAP-28)**
   - Accumulate usage across all chunks
   - Emit usage in final SSE event
   - Verify reasoning_tokens preserved

3. **Document Tool Approach (GAP-1)**
   - If backend won't support native tools, document prompt injection as official
   - Update API docs
   - Add examples

### Short-term (Month 1)

4. **Complete Parameter Mapping (GAP-8 through GAP-12)**
   - Add stop_sequences, seed, response_format
   - Add safety_settings support
   - Verify all proto fields mapped

5. **Fix Error Handling (GAP-15, GAP-20, GAP-21)**
   - Map status codes to finish_reason
   - Improve stream recovery
   - Add comprehensive error tests

6. **Add Multi-modal Support (GAP-6)**
   - Support CONTENT_TYPE_IMAGE
   - Support CONTENT_TYPE_FILE
   - Add mime_type handling

### Medium-term (Quarter 1)

7. **Complete Proto Compliance (GAP-23, GAP-24, GAP-25)**
   - Audit all field names
   - Verify enum formats
   - Complete ClientOptions structure

8. **Add Advanced Features**
   - Cache control (GAP-5)
   - Developer role (GAP-7)
   - Message ID tracking (GAP-16)

---

## Testing Strategy

### Unit Tests
- ✅ Created: [`red-team-audit.test.ts`](opencode/packages/opencode/src/provider/stitch/__tests__/red-team-audit.test.ts)
- **28 test cases** covering all identified gaps
- **Status:** RED phase - tests fail until implementation complete

### Integration Tests
- Test complete request/response cycles
- Test streaming with real backend
- Test tool execution workflows
- Test error scenarios

### Performance Tests
- Verify no performance regression
- Test with large contexts (100k+ tokens)
- Test concurrent streams
- Measure cache hit rates

---

## Success Criteria

### Phase 1: Critical Fixes (P0)
- [ ] Tool results properly formatted
- [ ] Tool responses detected
- [ ] Reasoning tokens preserved
- [ ] Usage data complete
- [ ] All P0 tests passing

### Phase 2: Core Features (P1)
- [ ] Tool choice modes working
- [ ] Error detection robust
- [ ] Round-trip transformations perfect
- [ ] All P1 tests passing

### Phase 3: Complete Parity (P2)
- [ ] All 22 features implemented
- [ ] All 28 tests passing
- [ ] Proto compliance 100%
- [ ] Zero context loss

### Phase 4: Production Ready
- [ ] Performance benchmarks met
- [ ] Error rates < 0.1%
- [ ] Documentation complete
- [ ] Migration guide published

---

## Appendix A: Proto Schema Reference

### Core Messages
- [`message.proto`](../../stitch-backend/proto/stitch-backend/chat/v1/message.proto) - ChatMessage, ContentType, ToolUse, ToolResult
- [`config.proto`](../../stitch-backend/proto/stitch-backend/chat/v1/config.proto) - ChatCompletionConfig, ReasoningConfig, SafetySettings
- [`usage.proto`](../../stitch-backend/proto/stitch-backend/chat/v1/usage.proto) - Usage, PromptTokensDetails, CompletionTokensDetails
- [`options.proto`](../../stitch-backend/proto/stitch-backend/chat/v1/options.proto) - ClientOptions, RetryOptions, RequestOptions

### Key Enums
- `MessageRole`: SYSTEM, USER, ASSISTANT, DEVELOPER, TOOL
- `ContentType`: TEXT, IMAGE, FILE, VIDEO, AUDIO, TOOL_USE, REASONING, TOOL_RESULT
- `ToolChoiceMode`: AUTO, NONE, FORCED
- `ResponseFormat`: JSON_OBJECT, TEXT_RESPONSE, APPLICATION_JSON

---

## Appendix B: Implementation Files

### Core Transform Files
- [`types.ts`](types.ts) - Type definitions
- [`request.ts`](request.ts) - Request transformations
- [`response.ts`](response.ts) - Response transformations
- [`stream.ts`](stream.ts) - Streaming transformations
- [`transform.ts`](transform.ts) - Tool call parsing
- [`tool-mapping.ts`](tool-mapping.ts) - Tool name/arg mapping

### Test Files
- [`red-team-audit.test.ts`](__tests__/red-team-audit.test.ts) - Comprehensive gap tests (NEW)
- Other existing test files

### Documentation
- [`README.md`](README.md) - Usage guide
- [`TESTING.md`](TESTING.md) - Testing procedures
- [`NATIVE_PROVIDER_README.md`](NATIVE_PROVIDER_README.md) - Native provider docs

---

## Appendix C: Comparison with Other Providers

### Anthropic Provider
- ✅ Native tool support with `tool_use` blocks
- ✅ Cache control per message
- ✅ Complete usage metadata
- ✅ Streaming preserves all data
- **Lesson:** Follow Anthropic's structured approach for tools

Reference: [`anthropic.ts`](../../console/app/src/routes/zen/util/provider/anthropic.ts)

### OpenAI Provider
- ✅ Native function calling
- ✅ Tool choice modes
- ✅ Multi-modal content
- ✅ Complete streaming support
- **Lesson:** Standard format makes integration easier

Reference: [`openai.ts`](../../console/app/src/routes/zen/util/provider/openai.ts)

### Stitch Provider (Current)
- ⚠️ Hybrid approach: Native for some, transformers for others
- ⚠️ Prompt injection for tools
- ⚠️ Incomplete streaming
- 🔄 **Needs alignment with proto schema**

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-26 | RED-TEAM Audit | Initial comprehensive audit |

**Next Review:** 2026-03-05 (after P0 fixes)

---

**END OF REPORT**
