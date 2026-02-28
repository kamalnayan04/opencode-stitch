/**
 * Integration Tests: End-to-End Gemini ↔ OpenCode Transformations
 * 
 * These tests verify complete workflows including:
 * - Request validation → transformation → response transformation
 * - Error handling across transformation pipeline
 * - Real-world usage scenarios
 * - Performance characteristics
 */

import { describe, test, expect } from 'bun:test';
import {
  geminiToOpenCodeRequest,
  openCodeToGeminiRequest,
  geminiToOpenCodeResponse,
  openCodeToGeminiResponse,
  transformGeminiStreamChunkToOpenCodeDelta,
  transformOpenCodeDeltaToGeminiStreamChunk,
  validateGeminiRequest,
  validateOpenCodeRequest,
  validateGeminiResponse,
  validateOpenCodeResponse,
  GeminiTransformError,
  type GeminiRequest,
  type OpenCodeRequest,
  type GeminiResponse,
  type OpenCodeResponse,
  type GeminiStreamChunk,
  type OpenCodeStreamDelta,
} from '../../../src/provider/gemini';

describe('End-to-end request transformation workflow', () => {
  test('complete Gemini request workflow with validation', () => {
    // 1. Create Gemini request
    const geminiReq: GeminiRequest = {
      systemInstruction: {
        parts: [{ text: 'You are a helpful coding assistant.' }]
      },
      contents: [
        { role: 'user', parts: [{ text: 'Explain TypeScript generics' }] }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 2048
      }
    };
    
    // 2. Validate
    expect(() => validateGeminiRequest(geminiReq)).not.toThrow();
    
    // 3. Transform to OpenCode
    const openCodeReq = geminiToOpenCodeRequest(geminiReq, 'gemini-pro');
    
    // 4. Verify transformation
    expect(openCodeReq.model).toBe('gemini-pro');
    expect(openCodeReq.messages).toHaveLength(2);
    expect(openCodeReq.messages[0].role).toBe('system');
    expect(openCodeReq.messages[1].role).toBe('user');
    expect(openCodeReq.temperature).toBe(0.7);
    expect(openCodeReq.max_tokens).toBe(2048);
    
    // 5. Validate result
    expect(() => validateOpenCodeRequest(openCodeReq)).not.toThrow();
  });
  
  test('complete OpenCode request workflow with validation', () => {
    // 1. Create OpenCode request
    const openCodeReq: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'What is React?' }
      ],
      temperature: 0.5,
      max_tokens: 1024
    };
    
    // 2. Validate
    expect(() => validateOpenCodeRequest(openCodeReq)).not.toThrow();
    
    // 3. Transform to Gemini
    const geminiReq = openCodeToGeminiRequest(openCodeReq);
    
    // 4. Verify transformation
    expect(geminiReq.systemInstruction).toBeDefined();
    expect(geminiReq.systemInstruction!.parts[0].text).toBe('Be concise.');
    expect(geminiReq.contents).toHaveLength(1);
    expect(geminiReq.contents[0].role).toBe('user');
    expect(geminiReq.generationConfig?.temperature).toBe(0.5);
    
    // 5. Validate result
    expect(() => validateGeminiRequest(geminiReq)).not.toThrow();
  });
});

describe('End-to-end response transformation workflow', () => {
  test('complete Gemini response workflow with validation', () => {
    // 1. Create Gemini response (simulated API response)
    const geminiRes: GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [
            { text: 'TypeScript generics allow you to write ' },
            { text: 'reusable code that works with multiple types.' }
          ]
        },
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: 25,
        candidatesTokenCount: 50,
        totalTokenCount: 75
      }
    };
    
    // 2. Validate
    expect(() => validateGeminiResponse(geminiRes)).not.toThrow();
    
    // 3. Transform to OpenCode
    const openCodeRes = geminiToOpenCodeResponse(geminiRes);
    
    // 4. Verify transformation
    expect(openCodeRes.object).toBe('chat.completion');
    expect(openCodeRes.choices[0].message.role).toBe('assistant');
    expect(openCodeRes.choices[0].message.content).toContain('TypeScript generics');
    expect(openCodeRes.choices[0].finish_reason).toBe('stop');
    expect(openCodeRes.usage?.prompt_tokens).toBe(25);
    expect(openCodeRes.usage?.completion_tokens).toBe(50);
    
    // 5. Validate result
    expect(() => validateOpenCodeResponse(openCodeRes)).not.toThrow();
  });
  
  test('complete OpenCode response workflow with validation', () => {
    // 1. Create OpenCode response
    const openCodeRes: OpenCodeResponse = {
      id: 'chatcmpl-integration-test',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'React is a JavaScript library for building user interfaces.'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 15,
        completion_tokens: 30,
        total_tokens: 45
      }
    };
    
    // 2. Validate
    expect(() => validateOpenCodeResponse(openCodeRes)).not.toThrow();
    
    // 3. Transform to Gemini
    const geminiRes = openCodeToGeminiResponse(openCodeRes);
    
    // 4. Verify transformation
    expect(geminiRes.candidates).toHaveLength(1);
    expect(geminiRes.candidates[0].content.role).toBe('model');
    expect(geminiRes.candidates[0].content.parts[0].text).toContain('React');
    expect(geminiRes.candidates[0].finishReason).toBe('STOP');
    expect(geminiRes.usageMetadata?.promptTokenCount).toBe(15);
    
    // 5. Validate result
    expect(() => validateGeminiResponse(geminiRes)).not.toThrow();
  });
});

describe('End-to-end streaming workflow', () => {
  test('complete Gemini streaming workflow', () => {
    // Simulate streaming chunks from Gemini API
    const geminiChunks: GeminiStreamChunk[] = [
      { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] },
      { candidates: [{ content: { parts: [{ text: ' from' }] } }] },
      { candidates: [{ content: { parts: [{ text: ' Gemini!' }] } }] },
      { candidates: [{ finishReason: 'STOP' }] }
    ];
    
    // Transform each chunk
    const openCodeDeltas = geminiChunks.map(transformGeminiStreamChunkToOpenCodeDelta);
    
    // Verify structure
    expect(openCodeDeltas).toHaveLength(4);
    openCodeDeltas.forEach(delta => {
      expect(delta.object).toBe('chat.completion.chunk');
      expect(delta.choices).toHaveLength(1);
      expect(delta.choices[0].index).toBe(0);
    });
    
    // Reconstruct full message
    const fullMessage = openCodeDeltas
      .map(d => d.choices[0].delta.content)
      .filter(Boolean)
      .join('');
    
    expect(fullMessage).toBe('Hello from Gemini!');
    expect(openCodeDeltas[3].choices[0].finish_reason).toBe('stop');
  });
  
  test('complete OpenCode streaming workflow', () => {
    // Simulate streaming deltas from OpenCode API
    const openCodeDeltas: OpenCodeStreamDelta[] = [
      {
        id: 'stream-1',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello' }, finish_reason: null }]
      },
      {
        id: 'stream-2',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: ' from' }, finish_reason: null }]
      },
      {
        id: 'stream-3',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: ' OpenCode!' }, finish_reason: null }]
      },
      {
        id: 'stream-4',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
      }
    ];
    
    // Transform each delta
    const geminiChunks = openCodeDeltas.map(transformOpenCodeDeltaToGeminiStreamChunk);
    
    // Verify structure
    expect(geminiChunks).toHaveLength(4);
    
    // Reconstruct full message
    const fullMessage = geminiChunks
      .filter(c => c.candidates?.[0]?.content?.parts)
      .map(c => c.candidates![0]!.content!.parts[0]!.text || '')
      .join('');
    
    expect(fullMessage).toBe('Hello from OpenCode!');
    expect(geminiChunks[3].candidates?.[0]?.finishReason).toBe('STOP');
  });
});

describe('Error handling in workflows', () => {
  test('catches validation errors in request transformation', () => {
    const invalidGeminiReq = {
      contents: [] // Empty - invalid
    };
    
    expect(() => {
      validateGeminiRequest(invalidGeminiReq);
      geminiToOpenCodeRequest(invalidGeminiReq as any);
    }).toThrow(GeminiTransformError);
  });
  
  test('catches validation errors in response transformation', () => {
    const invalidGeminiRes = {
      candidates: [] // Empty - invalid
    };
    
    expect(() => {
      validateGeminiResponse(invalidGeminiRes);
    }).toThrow(GeminiTransformError);
    
    expect(() => {
      geminiToOpenCodeResponse(invalidGeminiRes as any);
    }).toThrow('Gemini response must contain at least one candidate');
  });
  
  test('handles transformation errors gracefully', () => {
    const invalidOpenCodeRes = {
      id: 'test',
      object: 'chat.completion',
      choices: [] // Empty - will cause error
    };
    
    expect(() => {
      openCodeToGeminiResponse(invalidOpenCodeRes as any);
    }).toThrow('OpenCode response must contain at least one choice');
  });
});

describe('Real-world scenarios', () => {
  test('multi-turn conversation transformation', () => {
    // Simulate a multi-turn conversation
    const geminiReq: GeminiRequest = {
      systemInstruction: {
        parts: [{ text: 'You are an expert programmer.' }]
      },
      contents: [
        { role: 'user', parts: [{ text: 'What is recursion?' }] },
        { role: 'model', parts: [{ text: 'Recursion is when a function calls itself.' }] },
        { role: 'user', parts: [{ text: 'Can you give an example?' }] }
      ],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 1500
      }
    };
    
    const openCodeReq = geminiToOpenCodeRequest(geminiReq, 'gemini-pro');
    
    expect(openCodeReq.messages).toHaveLength(4);
    expect(openCodeReq.messages[0].role).toBe('system');
    expect(openCodeReq.messages[1].role).toBe('user');
    expect(openCodeReq.messages[2].role).toBe('assistant');
    expect(openCodeReq.messages[3].role).toBe('user');
    
    // Verify round-trip
    const backToGemini = openCodeToGeminiRequest(openCodeReq);
    expect(backToGemini.contents).toHaveLength(3);
  });
  
  test('minimal request transformation', () => {
    // Minimal valid request
    const minimalGemini: GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }]
    };
    
    const openCode = geminiToOpenCodeRequest(minimalGemini);
    
    expect(openCode.messages).toHaveLength(1);
    expect(openCode.messages[0].content).toBe('Hi');
    expect(openCode.temperature).toBeUndefined();
    expect(openCode.max_tokens).toBeUndefined();
  });
  
  test('response with partial usage data', () => {
    const geminiRes: GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'Response' }]
        }
      }],
      usageMetadata: {
        totalTokenCount: 100
        // Missing prompt and candidates counts
      }
    };
    
    const openCodeRes = geminiToOpenCodeResponse(geminiRes);
    
    expect(openCodeRes.usage?.total_tokens).toBe(100);
    expect(openCodeRes.usage?.prompt_tokens).toBeUndefined();
    expect(openCodeRes.usage?.completion_tokens).toBeUndefined();
  });
});

describe('Performance characteristics', () => {
  test('handles large conversation histories efficiently', () => {
    // Create a conversation with 50 turns
    const contents = [];
    for (let i = 0; i < 50; i++) {
      contents.push({
        role: i % 2 === 0 ? 'user' as const : 'model' as const,
        parts: [{ text: `Message ${i}` }]
      });
    }
    
    const geminiReq: GeminiRequest = { contents };
    
    const startTime = performance.now();
    const openCodeReq = geminiToOpenCodeRequest(geminiReq);
    const duration = performance.now() - startTime;
    
    expect(openCodeReq.messages).toHaveLength(50);
    expect(duration).toBeLessThan(10); // Should complete in < 10ms
  });
  
  test('handles long content efficiently', () => {
    const longText = 'Lorem ipsum '.repeat(1000); // ~12,000 chars
    
    const geminiReq: GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: longText }] }]
    };
    
    const startTime = performance.now();
    const openCodeReq = geminiToOpenCodeRequest(geminiReq);
    const duration = performance.now() - startTime;
    
    expect(openCodeReq.messages[0].content).toHaveLength(longText.length);
    expect(duration).toBeLessThan(5); // Should complete in < 5ms
  });
});
