# Gemini ↔ OpenCode: Complete Usage Examples

This document provides real-world usage examples for the Gemini ↔ OpenCode transformer library.

---

## Table of Contents

1. [Basic Request/Response](#basic-requestresponse)
2. [Multi-turn Conversations](#multi-turn-conversations)
3. [Streaming Responses](#streaming-responses)
4. [Error Handling](#error-handling)
5. [Validation Patterns](#validation-patterns)
6. [Advanced Use Cases](#advanced-use-cases)

---

## Basic Request/Response

### Example 1: Simple Chat Completion

```typescript
import {
  geminiToOpenCodeRequest,
  geminiToOpenCodeResponse,
  type GeminiRequest,
  type GeminiResponse,
} from '@opencode/provider/gemini';

// Create a simple Gemini request
const geminiReq: GeminiRequest = {
  contents: [{
    role: 'user',
    parts: [{ text: 'What is the capital of France?' }]
  }],
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 100
  }
};

// Transform to OpenCode format
const openCodeReq = geminiToOpenCodeRequest(geminiReq, 'gemini-pro');

console.log('OpenCode Request:', JSON.stringify(openCodeReq, null, 2));
// Output:
// {
//   "model": "gemini-pro",
//   "messages": [
//     { "role": "user", "content": "What is the capital of France?" }
//   ],
//   "temperature": 0.7,
//   "max_tokens": 100
// }

// Simulate Gemini API response
const geminiRes: GeminiResponse = {
  candidates: [{
    content: {
      role: 'model',
      parts: [{ text: 'The capital of France is Paris.' }]
    },
    finishReason: 'STOP'
  }],
  usageMetadata: {
    promptTokenCount: 8,
    candidatesTokenCount: 7,
    totalTokenCount: 15
  }
};

// Transform response to OpenCode format
const openCodeRes = geminiToOpenCodeResponse(geminiRes);

console.log('OpenCode Response:', JSON.stringify(openCodeRes, null, 2));
// Output:
// {
//   "id": "gemini-1234567890-abc123",
//   "object": "chat.completion",
//   "choices": [{
//     "index": 0,
//     "message": {
//       "role": "assistant",
//       "content": "The capital of France is Paris."
//     },
//     "finish_reason": "stop"
//   }],
//   "usage": {
//     "prompt_tokens": 8,
//     "completion_tokens": 7,
//     "total_tokens": 15
//   }
// }
```

### Example 2: With System Instruction

```typescript
import {
  openCodeToGeminiRequest,
  type OpenCodeRequest,
} from '@opencode/provider/gemini';

const openCodeReq: OpenCodeRequest = {
  model: 'gemini-1.5-pro',
  messages: [
    {
      role: 'system',
      content: 'You are a helpful assistant that responds concisely.'
    },
    {
      role: 'user',
      content: 'Explain quantum computing'
    }
  ],
  temperature: 0.8,
  max_tokens: 500
};

const geminiReq = openCodeToGeminiRequest(openCodeReq);

console.log('Gemini Request:', JSON.stringify(geminiReq, null, 2));
// Output:
// {
//   "systemInstruction": {
//     "parts": [{
//       "text": "You are a helpful assistant that responds concisely."
//     }]
//   },
//   "contents": [{
//     "role": "user",
//     "parts": [{ "text": "Explain quantum computing" }]
//   }],
//   "generationConfig": {
//     "temperature": 0.8,
//     "maxOutputTokens": 500
//   }
// }
```

---

## Multi-turn Conversations

### Example 3: Conversation History

```typescript
import {
  geminiToOpenCodeRequest,
  type GeminiRequest,
} from '@opencode/provider/gemini';

// Build a conversation with multiple turns
const conversation: GeminiRequest = {
  systemInstruction: {
    parts: [{ text: 'You are an expert programmer.' }]
  },
  contents: [
    {
      role: 'user',
      parts: [{ text: 'What is a closure in JavaScript?' }]
    },
    {
      role: 'model',
      parts: [{
        text: 'A closure is a function that has access to variables from its outer scope, even after the outer function has returned.'
      }]
    },
    {
      role: 'user',
      parts: [{ text: 'Can you show me an example?' }]
    }
  ],
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 2048
  }
};

const openCodeReq = geminiToOpenCodeRequest(conversation, 'gemini-pro');

console.log(`Messages: ${openCodeReq.messages.length}`);
// Output: Messages: 4
// [0] system: "You are an expert programmer."
// [1] user: "What is a closure in JavaScript?"
// [2] assistant: "A closure is a function..."
// [3] user: "Can you show me an example?"
```

### Example 4: Building Conversation Incrementally

```typescript
import {
  openCodeToGeminiRequest,
  type OpenCodeMessage,
} from '@opencode/provider/gemini';

class ConversationBuilder {
  private messages: OpenCodeMessage[] = [];
  
  addSystem(content: string): this {
    this.messages.push({ role: 'system', content });
    return this;
  }
  
  addUser(content: string): this {
    this.messages.push({ role: 'user', content });
    return this;
  }
  
  addAssistant(content: string): this {
    this.messages.push({ role: 'assistant', content });
    return this;
  }
  
  toGeminiRequest() {
    return openCodeToGeminiRequest({
      model: 'gemini-pro',
      messages: this.messages
    });
  }
}

// Usage
const conversation = new ConversationBuilder()
  .addSystem('You are a helpful coding assistant.')
  .addUser('How do I sort an array in JavaScript?')
  .addAssistant('You can use the .sort() method.')
  .addUser('What about sorting objects?')
  .toGeminiRequest();
```

---

## Streaming Responses

### Example 5: Basic Streaming

```typescript
import {
  transformGeminiStreamChunkToOpenCodeDelta,
  type GeminiStreamChunk,
} from '@opencode/provider/gemini';

async function handleGeminiStream(stream: ReadableStream<GeminiStreamChunk>) {
  const reader = stream.getReader();
  let fullResponse = '';
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Transform each chunk
      const delta = transformGeminiStreamChunkToOpenCodeDelta(value);
      const content = delta.choices[0].delta.content;
      
      if (content) {
        fullResponse += content;
        process.stdout.write(content); // Stream to output
      }
      
      // Check for completion
      if (delta.choices[0].finish_reason) {
        console.log(`\n\n[Finished: ${delta.choices[0].finish_reason}]`);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  
  return fullResponse;
}

// Usage
const geminiStream = await fetch('https://api.gemini.google.com/...');
const response = await handleGeminiStream(geminiStream.body!);
console.log('Complete response:', response);
```

### Example 6: Using TransformStream

```typescript
import {
  createGeminiToOpenCodeStreamTransformer,
} from '@opencode/provider/gemini';

async function streamWithTransformer(geminiStream: ReadableStream) {
  // Create transformer
  const transformer = createGeminiToOpenCodeStreamTransformer();
  
  // Pipe through transformer
  const openCodeStream = geminiStream.pipeThrough(transformer);
  
  // Consume transformed stream
  for await (const delta of openCodeStream) {
    const content = delta.choices[0].delta.content;
    if (content) {
      process.stdout.write(content);
    }
  }
}
```

### Example 7: Streaming with Callbacks

```typescript
import {
  transformGeminiStreamChunkToOpenCodeDelta,
  type OpenCodeStreamDelta,
} from '@opencode/provider/gemini';

interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (content: string) => void;
  onComplete?: (reason: string) => void;
  onError?: (error: Error) => void;
}

async function streamWithCallbacks(
  geminiStream: ReadableStream,
  callbacks: StreamCallbacks
) {
  callbacks.onStart?.();
  
  const reader = geminiStream.getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const delta = transformGeminiStreamChunkToOpenCodeDelta(value);
      const content = delta.choices[0].delta.content;
      
      if (content) {
        callbacks.onToken?.(content);
      }
      
      if (delta.choices[0].finish_reason) {
        callbacks.onComplete?.(delta.choices[0].finish_reason);
        break;
      }
    }
  } catch (error) {
    callbacks.onError?.(error as Error);
  } finally {
    reader.releaseLock();
  }
}

// Usage
await streamWithCallbacks(geminiStream, {
  onStart: () => console.log('Starting stream...'),
  onToken: (token) => process.stdout.write(token),
  onComplete: (reason) => console.log(`\nCompleted: ${reason}`),
  onError: (error) => console.error('Stream error:', error)
});
```

---

## Error Handling

### Example 8: Comprehensive Error Handling

```typescript
import {
  geminiToOpenCodeRequest,
  validateGeminiRequest,
  GeminiTransformError,
  type GeminiRequest,
} from '@opencode/provider/gemini';

function safeTransformRequest(input: unknown) {
  try {
    // 1. Validate input
    validateGeminiRequest(input);
    
    // 2. Transform (input is now typed as GeminiRequest)
    const result = geminiToOpenCodeRequest(input as GeminiRequest);
    
    return {
      success: true as const,
      data: result
    };
  } catch (error) {
    if (error instanceof GeminiTransformError) {
      return {
        success: false as const,
        error: error.message,
        details: error.cause
      };
    }
    // Unexpected error - re-throw
    throw error;
  }
}

// Usage
const result = safeTransformRequest(userInput);

if (result.success) {
  console.log('Transformed:', result.data);
} else {
  console.error('Transformation failed:', result.error);
}
```

### Example 9: Retry Logic

```typescript
import {
  geminiToOpenCodeResponse,
  validateGeminiResponse,
  type GeminiResponse,
} from '@opencode/provider/gemini';

async function transformWithRetry(
  geminiRes: unknown,
  maxRetries = 3
): Promise<any> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Validate
      validateGeminiResponse(geminiRes);
      
      // Transform
      return geminiToOpenCodeResponse(geminiRes as GeminiResponse);
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
      }
    }
  }
  
  throw new Error(
    `Transformation failed after ${maxRetries} attempts: ${lastError?.message}`
  );
}
```

---

## Validation Patterns

### Example 10: Type Guards

```typescript
import {
  isGeminiRequest,
  isOpenCodeRequest,
  geminiToOpenCodeRequest,
  openCodeToGeminiRequest,
} from '@opencode/provider/gemini';

function transformAny(input: unknown) {
  if (isGeminiRequest(input)) {
    // TypeScript knows input is GeminiRequest
    return geminiToOpenCodeRequest(input);
  } else if (isOpenCodeRequest(input)) {
    // TypeScript knows input is OpenCodeRequest
    return openCodeToGeminiRequest(input);
  } else {
    throw new Error('Unknown request format');
  }
}
```

### Example 11: Defensive Validation

```typescript
import {
  validateGeminiRequest,
  validateOpenCodeRequest,
  GeminiTransformError,
} from '@opencode/provider/gemini';

function validateBeforeAPI(request: unknown): boolean {
  const errors: string[] = [];
  
  // Try validating as Gemini format
  try {
    validateGeminiRequest(request);
    return true;
  } catch (error) {
    if (error instanceof GeminiTransformError) {
      errors.push(`Gemini: ${error.message}`);
    }
  }
  
  // Try validating as OpenCode format
  try {
    validateOpenCodeRequest(request);
    return true;
  } catch (error) {
    if (error instanceof GeminiTransformError) {
      errors.push(`OpenCode: ${error.message}`);
    }
  }
  
  // Neither format matched
  console.error('Validation failed for both formats:');
  errors.forEach(err => console.error(`  - ${err}`));
  return false;
}
```

---

## Advanced Use Cases

### Example 12: Request/Response Middleware

```typescript
import {
  geminiToOpenCodeRequest,
  geminiToOpenCodeResponse,
  type GeminiRequest,
  type GeminiResponse,
  type OpenCodeRequest,
  type OpenCodeResponse,
} from '@opencode/provider/gemini';

class GeminiMiddleware {
  // Transform request and add custom headers
  transformRequest(
    geminiReq: GeminiRequest,
    options: { apiKey: string; timeout?: number }
  ): { request: OpenCodeRequest; headers: Record<string, string> } {
    const request = geminiToOpenCodeRequest(geminiReq, 'gemini-pro');
    
    const headers = {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      ...(options.timeout && { 'X-Timeout': String(options.timeout) })
    };
    
    return { request, headers };
  }
  
  // Transform response and extract metadata
  transformResponse(geminiRes: GeminiResponse) {
    const response = geminiToOpenCodeResponse(geminiRes);
    
    return {
      response,
      metadata: {
        finishReason: response.choices[0].finish_reason,
        tokenUsage: response.usage,
        timestamp: new Date().toISOString()
      }
    };
  }
}

// Usage
const middleware = new GeminiMiddleware();

const { request, headers } = middleware.transformRequest(geminiReq, {
  apiKey: 'your-api-key',
  timeout: 30000
});

// Make API call...
const geminiRes = await callAPI(request, headers);

const { response, metadata } = middleware.transformResponse(geminiRes);
console.log('Response:', response);
console.log('Metadata:', metadata);
```

### Example 13: Caching Wrapper

```typescript
import {
  geminiToOpenCodeRequest,
  geminiToOpenCodeResponse,
  type GeminiRequest,
  type OpenCodeResponse,
} from '@opencode/provider/gemini';

class CachedTransformer {
  private cache = new Map<string, OpenCodeResponse>();
  
  private getCacheKey(req: GeminiRequest): string {
    // Create cache key from request
    return JSON.stringify({
      contents: req.contents,
      config: req.generationConfig
    });
  }
  
  async transform(
    geminiReq: GeminiRequest,
    fetchFn: (req: any) => Promise<any>
  ): Promise<OpenCodeResponse> {
    const cacheKey = this.getCacheKey(geminiReq);
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      console.log('Cache hit!');
      return this.cache.get(cacheKey)!;
    }
    
    // Transform and fetch
    const openCodeReq = geminiToOpenCodeRequest(geminiReq);
    const geminiRes = await fetchFn(openCodeReq);
    const response = geminiToOpenCodeResponse(geminiRes);
    
    // Cache result
    this.cache.set(cacheKey, response);
    
    return response;
  }
  
  clearCache() {
    this.cache.clear();
  }
}
```

### Example 14: Batch Processing

```typescript
import {
  geminiToOpenCodeRequest,
  type GeminiRequest,
  type OpenCodeRequest,
} from '@opencode/provider/gemini';

async function batchTransform(
  requests: GeminiRequest[]
): Promise<OpenCodeRequest[]> {
  console.log(`Processing ${requests.length} requests...`);
  
  const results = requests.map((req, index) => {
    try {
      return geminiToOpenCodeRequest(req, 'gemini-pro');
    } catch (error) {
      console.error(`Failed to transform request ${index}:`, error);
      return null;
    }
  });
  
  // Filter out failed transformations
  return results.filter((r): r is OpenCodeRequest => r !== null);
}

// Usage
const requests: GeminiRequest[] = [
  { contents: [{ role: 'user', parts: [{ text: 'Request 1' }] }] },
  { contents: [{ role: 'user', parts: [{ text: 'Request 2' }] }] },
  { contents: [{ role: 'user', parts: [{ text: 'Request 3' }] }] }
];

const transformed = await batchTransform(requests);
console.log(`Successfully transformed ${transformed.length}/${requests.length} requests`);
```

---

## Testing Patterns

### Example 15: Unit Test Helper

```typescript
import {
  geminiToOpenCodeRequest,
  geminiToOpenCodeResponse,
  type GeminiRequest,
  type GeminiResponse,
} from '@opencode/provider/gemini';

// Test helper functions
export function createTestGeminiRequest(
  text: string,
  options?: Partial<GeminiRequest>
): GeminiRequest {
  return {
    contents: [{
      role: 'user',
      parts: [{ text }]
    }],
    ...options
  };
}

export function createTestGeminiResponse(
  text: string,
  options?: { finishReason?: string; usage?: any }
): GeminiResponse {
  return {
    candidates: [{
      content: {
        role: 'model',
        parts: [{ text }]
      },
      finishReason: options?.finishReason || 'STOP'
    }],
    usageMetadata: options?.usage
  };
}

// Usage in tests
describe('Transformation tests', () => {
  test('transforms simple request', () => {
    const req = createTestGeminiRequest('Hello');
    const result = geminiToOpenCodeRequest(req);
    
    expect(result.messages[0].content).toBe('Hello');
  });
  
  test('transforms response with usage', () => {
    const res = createTestGeminiResponse('Hi', {
      usage: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 }
    });
    const result = geminiToOpenCodeResponse(res);
    
    expect(result.usage?.total_tokens).toBe(2);
  });
});
```

---

## Complete Application Example

```typescript
import {
  openCodeToGeminiRequest,
  geminiToOpenCodeResponse,
  validateOpenCodeRequest,
  GeminiTransformError,
  type OpenCodeRequest,
  type OpenCodeResponse,
} from '@opencode/provider/gemini';

class GeminiChatClient {
  constructor(
    private apiKey: string,
    private apiUrl: string = 'https://generativelanguage.googleapis.com/v1beta'
  ) {}
  
  async chat(request: OpenCodeRequest): Promise<OpenCodeResponse> {
    // 1. Validate input
    try {
      validateOpenCodeRequest(request);
    } catch (error) {
      throw new Error(`Invalid request: ${(error as Error).message}`);
    }
    
    // 2. Transform to Gemini format
    const geminiReq = openCodeToGeminiRequest(request);
    
    // 3. Call Gemini API
    const response = await fetch(
      `${this.apiUrl}/models/${request.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiReq)
      }
    );
    
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    
    const geminiRes = await response.json();
    
    // 4. Transform response back
    return geminiToOpenCodeResponse(geminiRes);
  }
}

// Usage
const client = new GeminiChatClient('your-api-key');

const response = await client.chat({
  model: 'gemini-pro',
  messages: [
    { role: 'user', content: 'Tell me a joke' }
  ],
  temperature: 0.9
});

console.log(response.choices[0].message.content);
```

---

**For more information, see [README.md](./README.md)**
