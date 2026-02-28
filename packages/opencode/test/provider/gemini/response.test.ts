/**
 * Unit Tests: Gemini ↔ OpenCode Response Transformations
 * 
 * Tests cover:
 * - Response transformations
 * - Usage metadata mapping
 * - Finish reason handling
 * - Empty candidates/choices handling
 * - ID generation
 * - Multiple parts concatenation
 */

import { describe, test, expect } from 'bun:test';
import {
  geminiToOpenCodeResponse,
  openCodeToGeminiResponse,
  type GeminiResponse,
  type OpenCodeResponse,
} from '../../../src/provider/gemini';

describe('geminiToOpenCodeResponse', () => {
  test('transforms basic response', () => {
    const geminiRes: GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'Hello! How can I help you?' }]
        },
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30
      }
    };
    
    const result = geminiToOpenCodeResponse(geminiRes);
    
    expect(result.object).toBe('chat.completion');
    expect(result.id).toMatch(/^gemini-\d+-[a-z0-9]+$/);
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0].index).toBe(0);
    expect(result.choices[0].message.role).toBe('assistant');
    expect(result.choices[0].message.content).toBe('Hello! How can I help you?');
    expect(result.choices[0].finish_reason).toBe('stop');
    expect(result.usage).toBeDefined();
    expect(result.usage!.prompt_tokens).toBe(10);
    expect(result.usage!.completion_tokens).toBe(20);
    expect(result.usage!.total_tokens).toBe(30);
  });
  
  test('concatenates multiple text parts', () => {
    const geminiRes: GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [
            { text: 'Part 1. ' },
            { text: 'Part 2. ' },
            { text: 'Part 3.' }
          ]
        }
      }]
    };
    
    const result = geminiToOpenCodeResponse(geminiRes);
    
    expect(result.choices[0].message.content).toBe('Part 1. Part 2. Part 3.');
  });
  
  test('filters out empty text parts', () => {
    const geminiRes: GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [
            { text: 'Valid text' },
            {},
            { text: 'More text' }
          ]
        }
      }]
    };
    
    const result = geminiToOpenCodeResponse(geminiRes);
    
    expect(result.choices[0].message.content).toBe('Valid textMore text');
  });
  
  test('handles response without usage metadata', () => {
    const geminiRes: GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'Response' }]
        }
      }]
    };
    
    const result = geminiToOpenCodeResponse(geminiRes);
    
    expect(result.usage).toBeUndefined();
  });
  
  test('handles response without finish reason', () => {
    const geminiRes: GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'Response' }]
        }
      }]
    };
    
    const result = geminiToOpenCodeResponse(geminiRes);
    
    expect(result.choices[0].finish_reason).toBeUndefined();
  });
  
  test('converts finish reason to lowercase', () => {
    const geminiRes: GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'Text' }]
        },
        finishReason: 'MAX_TOKENS'
      }]
    };
    
    const result = geminiToOpenCodeResponse(geminiRes);
    
    expect(result.choices[0].finish_reason).toBe('max_tokens');
  });
  
  test('throws error if no candidates', () => {
    const geminiRes: GeminiResponse = {
      candidates: []
    };
    
    expect(() => geminiToOpenCodeResponse(geminiRes)).toThrow(
      'Gemini response must contain at least one candidate'
    );
  });
  
  test('generates unique IDs', () => {
    const geminiRes: GeminiResponse = {
      candidates: [{
        content: { role: 'model', parts: [{ text: 'Test' }] }
      }]
    };
    
    const result1 = geminiToOpenCodeResponse(geminiRes);
    const result2 = geminiToOpenCodeResponse(geminiRes);
    
    expect(result1.id).not.toBe(result2.id);
  });
  
  test('handles empty text in parts', () => {
    const geminiRes: GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: '' }]
        }
      }]
    };
    
    const result = geminiToOpenCodeResponse(geminiRes);
    
    expect(result.choices[0].message.content).toBe('');
  });
  
  test('maps various finish reasons correctly', () => {
    const finishReasons = ['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION'];
    
    finishReasons.forEach(reason => {
      const geminiRes: GeminiResponse = {
        candidates: [{
          content: { role: 'model', parts: [{ text: 'Test' }] },
          finishReason: reason
        }]
      };
      
      const result = geminiToOpenCodeResponse(geminiRes);
      
      expect(result.choices[0].finish_reason).toBe(reason.toLowerCase());
    });
  });
});

describe('openCodeToGeminiResponse', () => {
  test('transforms basic response', () => {
    const openCodeRes: OpenCodeResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'This is a response.'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 15,
        completion_tokens: 25,
        total_tokens: 40
      }
    };
    
    const result = openCodeToGeminiResponse(openCodeRes);
    
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].content.role).toBe('model');
    expect(result.candidates[0].content.parts).toHaveLength(1);
    expect(result.candidates[0].content.parts[0].text).toBe('This is a response.');
    expect(result.candidates[0].finishReason).toBe('STOP');
    expect(result.usageMetadata).toBeDefined();
    expect(result.usageMetadata!.promptTokenCount).toBe(15);
    expect(result.usageMetadata!.candidatesTokenCount).toBe(25);
    expect(result.usageMetadata!.totalTokenCount).toBe(40);
  });
  
  test('handles response without usage', () => {
    const openCodeRes: OpenCodeResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Response'
        }
      }]
    };
    
    const result = openCodeToGeminiResponse(openCodeRes);
    
    expect(result.usageMetadata).toBeUndefined();
  });
  
  test('handles response without finish reason', () => {
    const openCodeRes: OpenCodeResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Response'
        }
      }]
    };
    
    const result = openCodeToGeminiResponse(openCodeRes);
    
    expect(result.candidates[0].finishReason).toBeUndefined();
  });
  
  test('converts finish reason to uppercase', () => {
    const openCodeRes: OpenCodeResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Text'
        },
        finish_reason: 'length'
      }]
    };
    
    const result = openCodeToGeminiResponse(openCodeRes);
    
    expect(result.candidates[0].finishReason).toBe('LENGTH');
  });
  
  test('throws error if no choices', () => {
    const openCodeRes: OpenCodeResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      choices: []
    };
    
    expect(() => openCodeToGeminiResponse(openCodeRes)).toThrow(
      'OpenCode response must contain at least one choice'
    );
  });
  
  test('handles empty content', () => {
    const openCodeRes: OpenCodeResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: ''
        }
      }]
    };
    
    const result = openCodeToGeminiResponse(openCodeRes);
    
    expect(result.candidates[0].content.parts[0].text).toBe('');
  });
  
  test('maps various finish reasons correctly', () => {
    const finishReasons = ['stop', 'length', 'content_filter', 'tool_calls'];
    
    finishReasons.forEach(reason => {
      const openCodeRes: OpenCodeResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Test' },
          finish_reason: reason
        }]
      };
      
      const result = openCodeToGeminiResponse(openCodeRes);
      
      expect(result.candidates[0].finishReason).toBe(reason.toUpperCase());
    });
  });
});

describe('Bidirectional transformation consistency', () => {
  test('round-trip: Gemini → OpenCode → Gemini preserves content', () => {
    const original: GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'This is the response content.' }]
        },
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 15,
        totalTokenCount: 25
      }
    };
    
    const openCode = geminiToOpenCodeResponse(original);
    const backToGemini = openCodeToGeminiResponse(openCode);
    
    expect(backToGemini.candidates[0].content.parts[0].text).toBe('This is the response content.');
    expect(backToGemini.candidates[0].finishReason).toBe('STOP');
    expect(backToGemini.usageMetadata!.promptTokenCount).toBe(10);
    expect(backToGemini.usageMetadata!.candidatesTokenCount).toBe(15);
    expect(backToGemini.usageMetadata!.totalTokenCount).toBe(25);
  });
  
  test('round-trip: OpenCode → Gemini → OpenCode preserves content', () => {
    const original: OpenCodeResponse = {
      id: 'chatcmpl-original',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Response text here'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 30,
        total_tokens: 50
      }
    };
    
    const gemini = openCodeToGeminiResponse(original);
    const backToOpenCode = geminiToOpenCodeResponse(gemini);
    
    // Note: ID will be different as it's generated
    expect(backToOpenCode.choices[0].message.content).toBe('Response text here');
    expect(backToOpenCode.choices[0].finish_reason).toBe('stop');
    expect(backToOpenCode.usage!.prompt_tokens).toBe(20);
    expect(backToOpenCode.usage!.completion_tokens).toBe(30);
    expect(backToOpenCode.usage!.total_tokens).toBe(50);
  });
});
