
# Stitch Provider Error Handling

## Overview

The Stitch provider implements comprehensive error handling to ensure reliable operation and excellent user experience. All error scenarios are thoroughly tested with 116+ tests covering validation, streaming, network failures, retries, and edge cases.

## Error Types

### Network Errors
- **Scenarios:** Connection refused, timeout, DNS failures, SSL certificate errors
- **Behavior:** Automatic retry with exponential backoff
- **User Experience:** Clear messages explaining the network issue with actionable guidance

**Example:**
```
Network error: ECONNREFUSED. Please check your internet connection.
```

### Validation Errors
- **Scenarios:** Invalid request parameters, missing required fields, out-of-range values
- **Behavior:** Request validation before API calls to prevent invalid requests
- **User Experience:** Lists all validation issues at once for quick fixing

**Example:**
```
Request validation failed:
- Model ID is required and must be a string
- temperature must be between 0 and 2
- Messages must be an array
```

### API Errors
- **Scenarios:** HTTP status codes 400-599 from Stitch API
- **Behavior:** Maps status codes to user-friendly messages with actionable suggestions
- **User Experience:** Stitch-specific error code mapping with clear next steps

**Example:**
```
Context Length Exceeded - The prompt is too long for this model.
Try reducing the message length or using a model with a larger context window.
```

### Streaming Errors
- **Scenarios:** NDJSON parsing errors, stream interruptions, backend errors mid-stream
- **Behavior:** Graceful recovery for recoverable errors, proper termination for terminal errors
- **User Experience:** Preserves partial results before error, proper resource cleanup

**Example:**
```
Stream interrupted due to rate limit. Partial response preserved.
Wait a moment before trying again.
```

### Timeout Errors
- **Scenarios:** Request exceeds configured timeout (30s streaming, 60s non-streaming)
- **Behavior:** Automatic abort with proper cleanup, clear timeout indication
- **User Experience:** Explains timeout occurred with timing information

**Example:**
```
Request timed out: The server took too long to respond.
Try again or reduce the request complexity.
```

## Error Response Format

All errors return a consistent format compatible with OpenAI's response structure:

```json
{
  "choices": [{
    "index": 0,
    "delta": {},
    "finish_reason": "stop"
  }],
  "error": {
    "type": "error_type",
    "message": "User-friendly message with actionable suggestion",
    "status": 400,
    "details": {
      "code": "STITCH_ERROR_CODE",
      "originalMessage": "Original API error message",
      "validationErrors": ["List of validation issues"],
      "bufferSize": 1024,
      "context": "Additional context"
    }
  }
}
```

**Streaming Error Format (SSE):**
```
data: {"choices":[...],"error":{...}}

data: [DONE]

```

## Stitch Error Codes

| Code | Message | Suggestion |
|------|---------|------------|
| `CONTEXT_LENGTH_EXCEEDED` | The prompt is too long for this model | Try reducing the message length or using a model with a larger context window |
| `MODEL_NOT_FOUND` | The specified model does not exist | Verify the model ID is correct and the model is available |
| `REASONING_BUDGET_EXCEEDED` | The reasoning token budget has been exceeded | Reduce the complexity of the task or use a model with higher reasoning capacity |
| `INVALID_PARAMETER` | One or more request parameters are invalid | Check parameter values are within acceptable ranges |
| `UNSUPPORTED_FEATURE` | The requested feature is not supported by this model | Check the model documentation for supported features |
| `INVALID_REQUEST` | The request format is invalid | Check your message format and ensure all required fields are present |

## HTTP Status Codes

| Code | Type | Retryable | Message | Suggestion |
|------|------|-----------|---------|------------|
| 400 | Validation Error | No | Request was invalid or malformed | Check your message format and parameter values |
| 401 | Authentication Error | No | Authentication failed | Verify your API key is correct and has not expired |
| 403 | Forbidden | No | Insufficient permissions | Your API key does not have access to this resource |
| 404 | Not Found | No | Endpoint or model does not exist | Verify the model ID is correct |
| 408 | Timeout | Yes | Request took too long | The server did not respond in time. Try again |
| 413 | Payload Too Large | No | Request body is too large | Reduce the message length or number of messages |
| 429 | Rate Limit | Yes | Too many requests | You have exceeded the rate limit. Wait before retrying |
| 500 | Server Error | Yes | Internal server error | This is a server-side issue. Try again in a moment |
| 502 | Bad Gateway | Yes | Invalid response from upstream | The API gateway encountered an error |
| 503 | Service Unavailable | Yes | Service temporarily unavailable | The API is temporarily down. Try again shortly |
| 504 | Gateway Timeout | Yes | Gateway did not receive response | The request timed out. Try again or reduce request size |

## Retry Logic

### Configuration
- **Max retries:** 3 attempts
- **Base delay:** 1 second
- **Max delay:** 30 seconds
- **Backoff multiplier:** 2 (exponential)
- **Jitter:** ±20% randomness to prevent thundering herd

### Retry Decision
Only the following errors are retried:
- HTTP 408 (Request Timeout)
- HTTP 429 (Too Many Requests) - respects `retry-after` header
- HTTP 5xx (Server Errors)
- Network errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, etc.)

Non-retryable errors (fail immediately):
- HTTP 400 (Bad Request)
- HTTP 401 (Unauthorized)
- HTTP 403 (Forbidden)
- HTTP 404 (Not Found)

### Backoff Calculation
```
delay = baseDelay × (multiplier ^ (attempt - 1))
jitter = delay × 0.2 × (random() × 2 - 1)
finalDelay = min(delay + jitter, maxDelay)
```

**Example delays:**
- Attempt 1: ~1s
- Attempt 2: ~2s
- Attempt 3: ~4s
- Attempt 4: ~8s (capped at 30s)

## Streaming Error Recovery

The streaming implementation includes intelligent error recovery:

### Recoverable Errors (Stream Continues)
- `streaming_error` - Temporary stream hiccups
- `validation_error` - Malformed JSON chunks (skipped)

These errors are logged but allow the stream to continue processing subsequent chunks.

### Terminal Errors (Stream Stops)
- `authentication_error` - Invalid API key
- `rate_limit` - Rate limit exceeded
- HTTP 400 - Bad request
- HTTP 403 - Forbidden
- Any other API errors

Terminal errors stop the stream and return a properly formatted error response with `[DONE]` marker.

### Stream Cleanup
- Buffer is cleared after successful completion
- Buffer is cleared after terminal errors
- Partial results are preserved before errors
- Proper SSE formatting maintained throughout

## Request Validation

Validation occurs **before** API calls to catch issues early:

### Required Fields
- `model` - Must be a non-empty string
- `messages` - Must be a non-empty array of message objects
- Each message must have:
  - `role` - Required string (user, assistant, system)
  - `content` - Required (string or array)

### Optional Fields (with validation)
- `temperature` - Must be between 0 and 2
- `max_tokens` - Must be between 1 and 100,000
- `top_p` - Must be between 0 and 1
- `frequency_penalty` - Must be between -2 and 2
- `presence_penalty` - Must be between -2 and 2

### Validation Error Format
All validation errors are collected and returned together:
```typescript
{
  type: 'validation_error',
  status: 400,
  details: {
    validationErrors: [
      'Model ID is required and must be a string',
      'temperature must be between 0 and 2',
      'Messages must be an array'
    ]
  }
}
```

## Timeout Configuration

Different timeouts for different request types:

| Request Type | Timeout | Rationale |
|--------------|---------|-----------|
| Streaming | 30 seconds | Shorter timeout for faster failure detection |
| Non-streaming | 60 seconds | Longer timeout for complete response generation |

### Timeout Behavior
1. AbortController created with timeout
2. Signal passed to fetch request
3. Timeout triggers automatic abort
4. Cleanup function clears timeout
5. Error converted to timeout error with guidance

## Logging

All errors are logged with structured context for debugging:

### Logged Information
- Error type and message
- HTTP status code (if applicable)
- Request context (URL, method)
- Retry information (attempt number, delay)
- Timestamp
- Buffer size (for streaming errors)

### Security
**Sensitive data is NOT logged:**
- API keys (excluded from logs)
- Request body content (only size logged)
- Response body with credentials

**Example log entry:**
```json
{
  "level": "error",
  "service": "stitch-error",
  "message": "Stitch provider error",
  "type": "rate_limit",
  "status": 429,
  "isRetryable": true,
  "retryAfter": 30,
  "context": {
    "url": "https://api.stitch.ai/chat/completions",
    "method": "POST",
    "timestamp": "2026-02-25T05:20:00.000Z",
    "requestBodySize": 1024
  }
}
```

## Testing

### Test Coverage
- **Total tests:** 116+ comprehensive tests
- **Coverage:** > 90% of error handling code
- **Test files:**
  - [`stitch-error-messages.test.ts`](./stitch-error-messages.test.ts:1) - User-friendly messages (20 tests)
  - [`stitch-validation.test.ts`](./stitch-validation.test.ts:1) - Request validation (27 tests)
  - [`stitch-streaming-errors.test.ts`](./stitch-streaming-errors.test.ts:1) - Streaming & NDJSON (49 tests)
  - [`stitch-integration.test.ts`](./stitch-integration.test.ts:1) - End-to-end integration (20+ tests)

### Test Execution
```bash
# Run all Stitch provider tests
npm test -- --testPathPattern=stitch

# Run specific test file
npm test -- stitch-integration

# Check coverage
npm test -- --coverage --testPathPattern=stitch
```

### Validated Scenarios
✅ Network errors (connection, timeout, DNS, SSL)  
✅ HTTP status codes (400, 401, 403, 404, 408, 429, 500-504)  
✅ Request validation (all parameters)  
✅ Stitch error codes (6 codes)  
✅ Streaming NDJSON parsing  
✅ Stream error recovery  
✅ Retry logic with backoff  
✅ Timeout handling  
✅ Error response formatting  
✅ Logging (security-conscious)  
✅ Edge cases (malformed responses, concurrent errors)

## For Users

### When You See an Error

1. **Read the error message carefully** - It includes specific guidance on what went wrong
2. **Check validation errors** - If present, fix all listed issues
3. **Verify API key** - For authentication errors, check your API key in OpenCode settings
4. **Wait and retry** - For rate limits, wait the suggested time before trying again
5. **Reduce request size** - For context length or payload errors, shorten your messages
6. **Contact support** - If server errors persist after retries

### Common Issues and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| Authentication failed | Invalid or expired API key | Update API key in settings |
| Rate limited | Too many requests | Wait 30-60s before retrying |
| Context too long | Prompt exceeds model limit | Reduce message length or use larger model |
| Model not found | Invalid model ID | Check model ID in model selector |
| Request timeout | Server too slow | Retry or reduce request complexity |
| Network error | Connection issue | Check internet connection |

## For Developers

### Implementation Files
- [`stitch-error.ts`](./stitch-error.ts:1) - Core error handling utilities
- [`stitch-validation.ts`](./stitch-validation.ts:1) - Request validation logic
- [`provider.ts`](./provider.ts:1) - Provider integration
- [`__tests__/`](./__tests__/) - Comprehensive test suite

### Using Error Handling

**Validate requests:**
```typescript
import { validateStitchRequest } from './stitch-validation'

try {
  validateStitchRequest(request)
  // Proceed with API call
} catch (error) {
  // error is a StitchError with validation details
  console.error(error.details.validationErrors)
}
```

**Make API calls with error handling:**
```typescript
import { fetchWithErrorHandling } from './stitch-error'

const response = await fetchWithErrorHandling(
  'https://api.stitch.ai/chat/completions',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  },
  {
    isStreaming: true,
    timeoutConfig: { streaming: 30000, nonStreaming: 60000 },
    retryConfig: { maxRetries: 3, baseDelay: 1000 },
    context: 'Chat Completion'
  }
)
```

**Handle streaming errors:**
```typescript
import { handleStreamError, isStreamRecoverable } from './stitch-error'

try {
  // Process stream chunk
} catch (error) {
  const result = handleStreamError(error, buffer)
  
  if (result.shouldContinue) {
    // Log and continue
    continue
  } else {
    // Send error response and terminate
    return result.errorResponse
  }
}
```

### Error Structure
```typescript
interface StitchError {
  type: StitchErrorType
  message: string          // User-friendly message
  status?: number          // HTTP status code
  details?: {              // Additional context
    code?: string          // Stitch error code
    originalMessage?: string
    validationErrors?: string[]
    [key: string]: any
  }
  originalError?: Error    // Original error object
  isRetryable: boolean     // Whether to retry
  retryAfter?: number      // Seconds to wait (for 429)
}
```

### Best Practices
1. **Always validate requests** before making API calls
2. **Use structured logging** with appropriate context
3. **Don't log sensitive data** (API keys, credentials)
4. **Preserve partial results** in streaming scenarios
5. **Clean up resources** (timeouts, buffers) in all code paths
6. **Respect retry-after** headers from rate limit responses
7. **Use exponential backoff** to prevent thundering herd
8. **Provide actionable messages** to users

## Error Flow Diagrams

### Request Lifecycle
```
User Request
    ↓
Validate Request ──→ Validation Error (400) ──→ Return Error
    ↓ (valid)
Create Timeout Controller
    ↓
Make API Call ──→ Network Error ──→ Retry? ──→ Yes ──→ Backoff & Retry
    ↓                                   ↓ No
HTTP Response                      Return Error
    ↓
Success? ──→ No ──→ Parse Error ──→ Retryable? ──→ Yes ──→ Retry
    ↓ Yes                               ↓ No
Return Response                    Return Error
```

### Streaming Lifecycle
```
Start Stream
    ↓
Receive Chunk
    ↓
Add to Buffer
    ↓
Parse Lines ──→ Malformed JSON ──→ Recoverable? ──→ Yes ──→ Log & Continue
    ↓                                    ↓ No
Process Lines                       Send Error & Stop
    ↓
More Chunks? ──→ Yes ──→ Receive Chunk
    ↓ No
Send [DONE]
    ↓
Clean Up Buffer
```

## Version History

- **v1.0** (2026-02-25) - Initial comprehensive error handling implementation
  - 116+ tests covering all scenarios
  - Stitch-specific error code mapping
  - Streaming error recovery
  - Request validation
  - User-friendly messages

## Support

For issues or questions about error handling:
1. Check this documentation first
2. Review test files for examples
3. Check logs for detailed error context
4. Contact OpenCode support with error details

---

**Maintainer:** OpenCode Team  
**Last Updated:** 2026-02-25  
**Status:** Production Ready ✅
