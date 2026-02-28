/**
 * Unit Tests: Gemini ↔ OpenCode Streaming Transformations
 * 
 * Tests cover:
 * - Stream chunk transformations
 * - Empty chunks handling
 * - Finish reason in streams
 * - TransformStream helpers
 */

import { describe, test, expect } from 'bun:test';
import {
  transformGeminiStreamChunkToOpenCodeDelta,
  transformOpenCodeDeltaToGeminiStreamChunk,
  type GeminiStreamChunk,
  type OpenCodeStreamDelta,
} from '../../../src/provider/gemini';

describe('transformGeminiStreamChunkToOpenCodeDelta', () => {
  test('transforms chunk with content', () => {
    const chunk: GeminiStreamChunk = {
      candidates: [{
        content: {
          parts: [{ text: 'Hello' }]
        }
      }]
    };
    
    const result = transformGeminiStreamChunkToOpenCodeDelta(chunk);
    
    expect(result.object).toBe('chat.completion.chunk');
    expect(result.id).toMatch(/^gemini-stream-\d+-[a-z0-9]+$/);
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0].index).toBe(0);
    expect(result.choices[0].delta.role).toBe('assistant');
    expect(result.choices[0].delta.content).toBe('Hello');
    expect(result.choices[0].finish_reason).toBeNull();
  });
  
  test('handles empty chunk', () => {
    const chunk: GeminiStreamChunk = {};
    
    const result = transformGeminiStreamChunkToOpenCodeDelta(chunk);
    
    expect(result.choices[0].delta.content).toBe('');
    expect(result.choices[0].finish_reason).toBeNull();
  });
  
  test('handles chunk without content', () => {
    const chunk: GeminiStreamChunk = {
      candidates: [{}]
    };
    
    const result = transformGeminiStreamChunkToOpenCodeDelta(chunk);
    
    expect(result.choices[0].delta.content).toBe('');
  });
  
  test('extracts finish reason', () => {
    const chunk: GeminiStreamChunk = {
      candidates: [{
        content: {
          parts: [{ text: 'Final text' }]
        },
        finishReason: 'STOP'
      }]
    };
    
    const result = transformGeminiStreamChunkToOpenCodeDelta(chunk);
    
    expect(result.choices[0].delta.content).toBe('Final text');
    expect(result.choices[0].finish_reason).toBe('stop');
  });
  
  test('handles chunk with only finish reason', () => {
    const chunk: GeminiStreamChunk = {
      candidates: [{
        finishReason: 'MAX_TOKENS'
      }]
    };
    
    const result = transformGeminiStreamChunkToOpenCodeDelta(chunk);
    
    expect(result.choices[0].delta.content).toBe('');
    expect(result.choices[0].finish_reason).toBe('max_tokens');
  });
  
  test('generates unique IDs for each chunk', () => {
    const chunk: GeminiStreamChunk = {
      candidates: [{
        content: { parts: [{ text: 'Test' }] }
      }]
    };
    
    const result1 = transformGeminiStreamChunkToOpenCodeDelta(chunk);
    const result2 = transformGeminiStreamChunkToOpenCodeDelta(chunk);
    
    expect(result1.id).not.toBe(result2.id);
  });
  
  test('handles empty text in chunk', () => {
    const chunk: GeminiStreamChunk = {
      candidates: [{
        content: {
          parts: [{ text: '' }]
        }
      }]
    };
    
    const result = transformGeminiStreamChunkToOpenCodeDelta(chunk);
    
    expect(result.choices[0].delta.content).toBe('');
  });
  
  test('only includes role when content is present', () => {
    const emptyChunk: GeminiStreamChunk = {
      candidates: [{
        content: { parts: [{ text: '' }] }
      }]
    };
    
    const resultEmpty = transformGeminiStreamChunkToOpenCodeDelta(emptyChunk);
    expect(resultEmpty.choices[0].delta.role).toBeUndefined();
    
    const contentChunk: GeminiStreamChunk = {
      candidates: [{
        content: { parts: [{ text: 'Text' }] }
      }]
    };
    
    const resultContent = transformGeminiStreamChunkToOpenCodeDelta(contentChunk);
    expect(resultContent.choices[0].delta.role).toBe('assistant');
  });
});

describe('transformOpenCodeDeltaToGeminiStreamChunk', () => {
  test('transforms delta with content', () => {
    const delta: OpenCodeStreamDelta = {
      id: 'chatcmpl-stream-123',
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: {
          content: 'Hello'
        },
        finish_reason: null
      }]
    };
    
    const result = transformOpenCodeDeltaToGeminiStreamChunk(delta);
    
    expect(result.candidates).toBeDefined();
    expect(result.candidates!).toHaveLength(1);
    expect(result.candidates![0].content).toBeDefined();
    expect(result.candidates![0].content!.parts).toHaveLength(1);
    expect(result.candidates![0].content!.parts[0]!.text).toBe('Hello');
  });
  
  test('handles delta without content', () => {
    const delta: OpenCodeStreamDelta = {
      id: 'chatcmpl-stream-123',
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: null
      }]
    };
    
    const result = transformOpenCodeDeltaToGeminiStreamChunk(delta);
    
    expect(result.candidates).toBeUndefined();
  });
  
  test('converts finish reason to uppercase', () => {
    const delta: OpenCodeStreamDelta = {
      id: 'chatcmpl-stream-123',
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: {
          content: 'Final'
        },
        finish_reason: 'stop'
      }]
    };
    
    const result = transformOpenCodeDeltaToGeminiStreamChunk(delta);
    
    expect(result.candidates![0].finishReason).toBe('STOP');
  });
  
  test('handles delta with only finish reason', () => {
    const delta: OpenCodeStreamDelta = {
      id: 'chatcmpl-stream-123',
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'length'
      }]
    };
    
    const result = transformOpenCodeDeltaToGeminiStreamChunk(delta);
    
    expect(result.candidates).toBeDefined();
    expect(result.candidates![0].finishReason).toBe('LENGTH');
    expect(result.candidates![0].content).toBeUndefined();
  });
  
  test('handles empty content', () => {
    const delta: OpenCodeStreamDelta = {
      id: 'chatcmpl-stream-123',
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: {
          content: ''
        },
        finish_reason: null
      }]
    };
    
    const result = transformOpenCodeDeltaToGeminiStreamChunk(delta);
    
    expect(result.candidates).toBeUndefined();
  });
  
  test('handles delta with role', () => {
    const delta: OpenCodeStreamDelta = {
      id: 'chatcmpl-stream-123',
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          content: 'Hi'
        },
        finish_reason: null
      }]
    };
    
    const result = transformOpenCodeDeltaToGeminiStreamChunk(delta);
    
    // Role is not preserved in Gemini chunks (always 'model' implicitly)
    expect(result.candidates![0].content!.parts[0]!.text).toBe('Hi');
  });
});

describe('Streaming sequence simulation', () => {
  test('simulates complete Gemini streaming sequence', () => {
    const chunks: GeminiStreamChunk[] = [
      { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] },
      { candidates: [{ content: { parts: [{ text: ' world' }] } }] },
      { candidates: [{ content: { parts: [{ text: '!' }] } }] },
      { candidates: [{ finishReason: 'STOP' }] }
    ];
    
    const deltas = chunks.map(transformGeminiStreamChunkToOpenCodeDelta);
    
    expect(deltas).toHaveLength(4);
    expect(deltas[0].choices[0].delta.content).toBe('Hello');
    expect(deltas[1].choices[0].delta.content).toBe(' world');
    expect(deltas[2].choices[0].delta.content).toBe('!');
    expect(deltas[3].choices[0].finish_reason).toBe('stop');
    
    // Reconstruct full message
    const fullContent = deltas
      .map(d => d.choices[0].delta.content)
      .filter(Boolean)
      .join('');
    
    expect(fullContent).toBe('Hello world!');
  });
  
  test('simulates complete OpenCode streaming sequence', () => {
    const deltas: OpenCodeStreamDelta[] = [
      {
        id: 'stream-1',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { role: 'assistant', content: 'Hi' }, finish_reason: null }]
      },
      {
        id: 'stream-2',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: ' there' }, finish_reason: null }]
      },
      {
        id: 'stream-3',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
      }
    ];
    
    const chunks = deltas.map(transformOpenCodeDeltaToGeminiStreamChunk);
    
    expect(chunks).toHaveLength(3);
    expect(chunks[0].candidates![0].content!.parts[0]!.text).toBe('Hi');
    expect(chunks[1].candidates![0].content!.parts[0]!.text).toBe(' there');
    expect(chunks[2].candidates![0].finishReason).toBe('STOP');
  });
});

describe('Bidirectional streaming consistency', () => {
  test('round-trip: Gemini chunk → OpenCode delta → Gemini chunk', () => {
    const original: GeminiStreamChunk = {
      candidates: [{
        content: {
          parts: [{ text: 'Test content' }]
        }
      }]
    };
    
    const delta = transformGeminiStreamChunkToOpenCodeDelta(original);
    const backToChunk = transformOpenCodeDeltaToGeminiStreamChunk(delta);
    
    expect(backToChunk.candidates![0].content!.parts[0]!.text).toBe('Test content');
  });
  
  test('round-trip: OpenCode delta → Gemini chunk → OpenCode delta', () => {
    const original: OpenCodeStreamDelta = {
      id: 'stream-123',
      object: 'chat.completion.chunk',
      choices: [{
        index: 0,
        delta: {
          content: 'Test content'
        },
        finish_reason: null
      }]
    };
    
    const chunk = transformOpenCodeDeltaToGeminiStreamChunk(original);
    const backToDelta = transformGeminiStreamChunkToOpenCodeDelta(chunk);
    
    expect(backToDelta.choices[0].delta.content).toBe('Test content');
  });
});
