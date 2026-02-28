/**
 * Unit Tests: Validation and Error Handling
 * 
 * Tests cover:
 * - Request validation (Gemini and OpenCode)
 * - Response validation (Gemini and OpenCode)
 * - Type guards
 * - Error messages and types
 * - Edge cases and invalid inputs
 */

import { describe, test, expect } from 'bun:test';
import {
  GeminiTransformError,
  validateGeminiRequest,
  validateOpenCodeRequest,
  validateGeminiResponse,
  validateOpenCodeResponse,
  isGeminiRequest,
  isOpenCodeRequest,
  isGeminiResponse,
  isOpenCodeResponse,
  type GeminiRequest,
  type OpenCodeRequest,
  type GeminiResponse,
  type OpenCodeResponse,
} from '../../../src/provider/gemini';

describe('GeminiTransformError', () => {
  test('creates error with message', () => {
    const error = new GeminiTransformError('Test error');
    
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GeminiTransformError');
    expect(error.message).toBe('Test error');
    expect(error.cause).toBeUndefined();
  });
  
  test('creates error with cause', () => {
    const cause = new Error('Original error');
    const error = new GeminiTransformError('Wrapped error', cause);
    
    expect(error.message).toBe('Wrapped error');
    expect(error.cause).toBe(cause);
  });
});

describe('validateGeminiRequest', () => {
  test('validates valid request', () => {
    const validReq: GeminiRequest = {
      contents: [{
        role: 'user',
        parts: [{ text: 'Hello' }]
      }]
    };
    
    expect(() => validateGeminiRequest(validReq)).not.toThrow();
  });
  
  test('throws if not an object', () => {
    expect(() => validateGeminiRequest(null)).toThrow('Request must be an object');
    expect(() => validateGeminiRequest('string')).toThrow('Request must be an object');
    expect(() => validateGeminiRequest(123)).toThrow('Request must be an object');
  });
  
  test('throws if contents missing', () => {
    expect(() => validateGeminiRequest({})).toThrow('Request must have "contents" array');
  });
  
  test('throws if contents not array', () => {
    expect(() => validateGeminiRequest({ contents: 'not array' })).toThrow(
      'Request must have "contents" array'
    );
  });
  
  test('throws if contents empty', () => {
    expect(() => validateGeminiRequest({ contents: [] })).toThrow(
      'Contents array cannot be empty'
    );
  });
  
  test('throws if content has invalid role', () => {
    expect(() => validateGeminiRequest({
      contents: [{ role: 'invalid', parts: [{ text: 'test' }] }]
    })).toThrow('Invalid role at index 0: "invalid". Must be "user" or "model"');
  });
  
  test('throws if content missing parts', () => {
    expect(() => validateGeminiRequest({
      contents: [{ role: 'user' }]
    })).toThrow('Content at index 0 must have "parts" array');
  });
  
  test('throws if parts empty', () => {
    expect(() => validateGeminiRequest({
      contents: [{ role: 'user', parts: [] }]
    })).toThrow('Content at index 0 has empty "parts" array');
  });
  
  test('throws if part has no valid fields', () => {
    expect(() => validateGeminiRequest({
      contents: [{ role: 'user', parts: [{}] }]
    })).toThrow('Part 0 in content 0 must have at least one of: text, inlineData, fileData');
  });
  
  test('validates systemInstruction', () => {
    const validReq = {
      systemInstruction: {
        parts: [{ text: 'System' }]
      },
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }]
    };
    
    expect(() => validateGeminiRequest(validReq)).not.toThrow();
  });
  
  test('throws if systemInstruction invalid', () => {
    expect(() => validateGeminiRequest({
      systemInstruction: 'invalid',
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }]
    })).toThrow('systemInstruction must be an object');
  });
  
  test('throws if systemInstruction parts empty', () => {
    expect(() => validateGeminiRequest({
      systemInstruction: { parts: [] },
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }]
    })).toThrow('systemInstruction.parts cannot be empty');
  });
  
  test('validates temperature range', () => {
    expect(() => validateGeminiRequest({
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      generationConfig: { temperature: -0.1 }
    })).toThrow('temperature must be between 0 and 2');
    
    expect(() => validateGeminiRequest({
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      generationConfig: { temperature: 2.1 }
    })).toThrow('temperature must be between 0 and 2');
  });
  
  test('validates topP range', () => {
    expect(() => validateGeminiRequest({
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      generationConfig: { topP: -0.1 }
    })).toThrow('topP must be between 0 and 1');
    
    expect(() => validateGeminiRequest({
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      generationConfig: { topP: 1.1 }
    })).toThrow('topP must be between 0 and 1');
  });
  
  test('validates topK', () => {
    expect(() => validateGeminiRequest({
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      generationConfig: { topK: -1 }
    })).toThrow('topK must be a non-negative number');
  });
  
  test('validates maxOutputTokens', () => {
    expect(() => validateGeminiRequest({
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      generationConfig: { maxOutputTokens: 0 }
    })).toThrow('maxOutputTokens must be a positive number');
  });
});

describe('validateOpenCodeRequest', () => {
  test('validates valid request', () => {
    const validReq: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [{ role: 'user', content: 'Hello' }]
    };
    
    expect(() => validateOpenCodeRequest(validReq)).not.toThrow();
  });
  
  test('throws if not an object', () => {
    expect(() => validateOpenCodeRequest(null)).toThrow('Request must be an object');
  });
  
  test('throws if model missing', () => {
    expect(() => validateOpenCodeRequest({
      messages: [{ role: 'user', content: 'Test' }]
    })).toThrow('Request must have "model" string');
  });
  
  test('throws if model empty', () => {
    expect(() => validateOpenCodeRequest({
      model: '   ',
      messages: [{ role: 'user', content: 'Test' }]
    })).toThrow('Model string cannot be empty');
  });
  
  test('throws if messages missing', () => {
    expect(() => validateOpenCodeRequest({
      model: 'test'
    })).toThrow('Request must have "messages" array');
  });
  
  test('throws if messages empty', () => {
    expect(() => validateOpenCodeRequest({
      model: 'test',
      messages: []
    })).toThrow('Messages array cannot be empty');
  });
  
  test('throws if message has invalid role', () => {
    expect(() => validateOpenCodeRequest({
      model: 'test',
      messages: [{ role: 'invalid', content: 'Test' }]
    })).toThrow('Invalid role at index 0: "invalid". Must be "system", "user", or "assistant"');
  });
  
  test('throws if message content not string', () => {
    expect(() => validateOpenCodeRequest({
      model: 'test',
      messages: [{ role: 'user', content: 123 }]
    })).toThrow('Message at index 0 must have "content" string');
  });
  
  test('validates temperature range', () => {
    expect(() => validateOpenCodeRequest({
      model: 'test',
      messages: [{ role: 'user', content: 'Test' }],
      temperature: -0.1
    })).toThrow('temperature must be between 0 and 2');
  });
  
  test('validates top_p range', () => {
    expect(() => validateOpenCodeRequest({
      model: 'test',
      messages: [{ role: 'user', content: 'Test' }],
      top_p: 1.5
    })).toThrow('top_p must be between 0 and 1');
  });
  
  test('validates max_tokens', () => {
    expect(() => validateOpenCodeRequest({
      model: 'test',
      messages: [{ role: 'user', content: 'Test' }],
      max_tokens: 0
    })).toThrow('max_tokens must be a positive number');
  });
});

describe('validateGeminiResponse', () => {
  test('validates valid response', () => {
    const validRes: GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'Response' }]
        }
      }]
    };
    
    expect(() => validateGeminiResponse(validRes)).not.toThrow();
  });
  
  test('throws if not an object', () => {
    expect(() => validateGeminiResponse(null)).toThrow('Response must be an object');
  });
  
  test('throws if candidates missing', () => {
    expect(() => validateGeminiResponse({})).toThrow('Response must have "candidates" array');
  });
  
  test('throws if candidates empty', () => {
    expect(() => validateGeminiResponse({ candidates: [] })).toThrow(
      'Response must have at least one candidate'
    );
  });
  
  test('throws if candidate missing content', () => {
    expect(() => validateGeminiResponse({
      candidates: [{}]
    })).toThrow('Candidate must have "content" object');
  });
  
  test('throws if content missing parts', () => {
    expect(() => validateGeminiResponse({
      candidates: [{ content: {} }]
    })).toThrow('Candidate content must have "parts" array');
  });
});

describe('validateOpenCodeResponse', () => {
  test('validates valid response', () => {
    const validRes: OpenCodeResponse = {
      id: 'test-123',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Response' }
      }]
    };
    
    expect(() => validateOpenCodeResponse(validRes)).not.toThrow();
  });
  
  test('throws if not an object', () => {
    expect(() => validateOpenCodeResponse(null)).toThrow('Response must be an object');
  });
  
  test('throws if id missing', () => {
    expect(() => validateOpenCodeResponse({
      object: 'chat.completion',
      choices: []
    })).toThrow('Response must have "id" string');
  });
  
  test('throws if object incorrect', () => {
    expect(() => validateOpenCodeResponse({
      id: 'test',
      object: 'invalid',
      choices: []
    })).toThrow('Response object must be "chat.completion"');
  });
  
  test('throws if choices empty', () => {
    expect(() => validateOpenCodeResponse({
      id: 'test',
      object: 'chat.completion',
      choices: []
    })).toThrow('Response must have at least one choice');
  });
  
  test('throws if message role not assistant', () => {
    expect(() => validateOpenCodeResponse({
      id: 'test',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: { role: 'user', content: 'Test' }
      }]
    })).toThrow('Choice message role must be "assistant"');
  });
  
  test('throws if content not string', () => {
    expect(() => validateOpenCodeResponse({
      id: 'test',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 123 }
      }]
    })).toThrow('Choice message must have "content" string');
  });
});

describe('Type guards', () => {
  test('isGeminiRequest returns true for valid request', () => {
    const valid: GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }]
    };
    
    expect(isGeminiRequest(valid)).toBe(true);
  });
  
  test('isGeminiRequest returns false for invalid request', () => {
    expect(isGeminiRequest(null)).toBe(false);
    expect(isGeminiRequest({ contents: [] })).toBe(false);
    expect(isGeminiRequest({})).toBe(false);
  });
  
  test('isOpenCodeRequest returns true for valid request', () => {
    const valid: OpenCodeRequest = {
      model: 'test',
      messages: [{ role: 'user', content: 'Test' }]
    };
    
    expect(isOpenCodeRequest(valid)).toBe(true);
  });
  
  test('isOpenCodeRequest returns false for invalid request', () => {
    expect(isOpenCodeRequest(null)).toBe(false);
    expect(isOpenCodeRequest({ model: 'test' })).toBe(false);
    expect(isOpenCodeRequest({})).toBe(false);
  });
  
  test('isGeminiResponse returns true for valid response', () => {
    const valid: GeminiResponse = {
      candidates: [{
        content: { role: 'model', parts: [{ text: 'Test' }] }
      }]
    };
    
    expect(isGeminiResponse(valid)).toBe(true);
  });
  
  test('isGeminiResponse returns false for invalid response', () => {
    expect(isGeminiResponse(null)).toBe(false);
    expect(isGeminiResponse({ candidates: [] })).toBe(false);
  });
  
  test('isOpenCodeResponse returns true for valid response', () => {
    const valid: OpenCodeResponse = {
      id: 'test',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Test' }
      }]
    };
    
    expect(isOpenCodeResponse(valid)).toBe(true);
  });
  
  test('isOpenCodeResponse returns false for invalid response', () => {
    expect(isOpenCodeResponse(null)).toBe(false);
    expect(isOpenCodeResponse({ id: 'test', object: 'invalid', choices: [] })).toBe(false);
  });
});
