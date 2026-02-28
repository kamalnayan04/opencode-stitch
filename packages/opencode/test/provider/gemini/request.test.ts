/**
 * Unit Tests: Gemini ↔ OpenCode Request Transformations
 * 
 * Tests cover:
 * - Simple text message transformations
 * - System instruction handling
 * - Generation config parameter mapping
 * - Multiple message conversations
 * - Role conversions
 * - Multiple text parts concatenation
 * - Empty and edge cases
 */

import { describe, test, expect } from 'bun:test';
import {
  geminiToOpenCodeRequest,
  openCodeToGeminiRequest,
  type GeminiRequest,
  type OpenCodeRequest,
} from '../../../src/provider/gemini';

describe('geminiToOpenCodeRequest', () => {
  test('transforms simple text message', () => {
    const geminiReq: GeminiRequest = {
      contents: [{
        role: 'user',
        parts: [{ text: 'Hello, world!' }]
      }]
    };
    
    const result = geminiToOpenCodeRequest(geminiReq, 'gemini-pro');
    
    expect(result.model).toBe('gemini-pro');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content).toBe('Hello, world!');
  });
  
  test('uses default model when not specified', () => {
    const geminiReq: GeminiRequest = {
      contents: [{
        role: 'user',
        parts: [{ text: 'Test' }]
      }]
    };
    
    const result = geminiToOpenCodeRequest(geminiReq);
    
    expect(result.model).toBe('gemini-pro');
  });
  
  test('extracts system instruction as first message', () => {
    const geminiReq: GeminiRequest = {
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }]
      },
      contents: [{
        role: 'user',
        parts: [{ text: 'Hi!' }]
      }]
    };
    
    const result = geminiToOpenCodeRequest(geminiReq);
    
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('system');
    expect(result.messages[0].content).toBe('You are a helpful assistant.');
    expect(result.messages[1].role).toBe('user');
    expect(result.messages[1].content).toBe('Hi!');
  });
  
  test('concatenates multiple system instruction parts', () => {
    const geminiReq: GeminiRequest = {
      systemInstruction: {
        parts: [
          { text: 'Part 1' },
          { text: 'Part 2' },
          { text: 'Part 3' }
        ]
      },
      contents: [{
        role: 'user',
        parts: [{ text: 'Test' }]
      }]
    };
    
    const result = geminiToOpenCodeRequest(geminiReq);
    
    expect(result.messages[0].content).toBe('Part 1\nPart 2\nPart 3');
  });
  
  test('skips system instruction if empty', () => {
    const geminiReq: GeminiRequest = {
      systemInstruction: {
        parts: []
      },
      contents: [{
        role: 'user',
        parts: [{ text: 'Test' }]
      }]
    };
    
    const result = geminiToOpenCodeRequest(geminiReq);
    
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
  });
  
  test('maps generation config correctly', () => {
    const geminiReq: GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 1024,
        stopSequences: ['END', 'STOP']
      }
    };
    
    const result = geminiToOpenCodeRequest(geminiReq);
    
    expect(result.temperature).toBe(0.7);
    expect(result.top_p).toBe(0.9);
    expect(result.max_tokens).toBe(1024);
    expect(result.stop).toEqual(['END', 'STOP']);
  });
  
  test('omits undefined generation config parameters', () => {
    const geminiReq: GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      generationConfig: {
        temperature: 0.5
      }
    };
    
    const result = geminiToOpenCodeRequest(geminiReq);
    
    expect(result.temperature).toBe(0.5);
    expect(result.top_p).toBeUndefined();
    expect(result.max_tokens).toBeUndefined();
    expect(result.stop).toBeUndefined();
  });
  
  test('concatenates multiple text parts', () => {
    const geminiReq: GeminiRequest = {
      contents: [{
        role: 'user',
        parts: [
          { text: 'Part 1' },
          { text: 'Part 2' },
          { text: 'Part 3' }
        ]
      }]
    };
    
    const result = geminiToOpenCodeRequest(geminiReq);
    
    expect(result.messages[0].content).toBe('Part 1\nPart 2\nPart 3');
  });
  
  test('handles model role conversion to assistant', () => {
    const geminiReq: GeminiRequest = {
      contents: [
        { role: 'user', parts: [{ text: 'Question?' }] },
        { role: 'model', parts: [{ text: 'Answer!' }] }
      ]
    };
    
    const result = geminiToOpenCodeRequest(geminiReq);
    
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
  });
  
  test('skips messages with no text parts', () => {
    const geminiReq: GeminiRequest = {
      contents: [
        { role: 'user', parts: [{ text: 'Valid message' }] },
        { role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'base64data' } }] }
      ]
    };
    
    const result = geminiToOpenCodeRequest(geminiReq);
    
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe('Valid message');
  });
  
  test('handles multiple conversation turns', () => {
    const geminiReq: GeminiRequest = {
      contents: [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there!' }] },
        { role: 'user', parts: [{ text: 'How are you?' }] },
        { role: 'model', parts: [{ text: 'I am doing well!' }] }
      ]
    };
    
    const result = geminiToOpenCodeRequest(geminiReq);
    
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[2].role).toBe('user');
    expect(result.messages[3].role).toBe('assistant');
  });
  
  test('ignores stopSequences if empty array', () => {
    const geminiReq: GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      generationConfig: {
        stopSequences: []
      }
    };
    
    const result = geminiToOpenCodeRequest(geminiReq);
    
    expect(result.stop).toBeUndefined();
  });
});

describe('openCodeToGeminiRequest', () => {
  test('transforms simple user message', () => {
    const openCodeReq: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [{
        role: 'user',
        content: 'Hello!'
      }]
    };
    
    const result = openCodeToGeminiRequest(openCodeReq);
    
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].role).toBe('user');
    expect(result.contents[0].parts).toHaveLength(1);
    expect(result.contents[0].parts[0].text).toBe('Hello!');
  });
  
  test('extracts system messages to systemInstruction', () => {
    const openCodeReq: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi!' }
      ]
    };
    
    const result = openCodeToGeminiRequest(openCodeReq);
    
    expect(result.systemInstruction).toBeDefined();
    expect(result.systemInstruction!.parts).toHaveLength(1);
    expect(result.systemInstruction!.parts[0].text).toBe('You are helpful.');
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].role).toBe('user');
  });
  
  test('combines multiple system messages', () => {
    const openCodeReq: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [
        { role: 'system', content: 'Instruction 1' },
        { role: 'system', content: 'Instruction 2' },
        { role: 'user', content: 'Question' }
      ]
    };
    
    const result = openCodeToGeminiRequest(openCodeReq);
    
    expect(result.systemInstruction!.parts).toHaveLength(2);
    expect(result.systemInstruction!.parts[0].text).toBe('Instruction 1');
    expect(result.systemInstruction!.parts[1].text).toBe('Instruction 2');
  });
  
  test('converts assistant role to model', () => {
    const openCodeReq: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [
        { role: 'user', content: 'Question?' },
        { role: 'assistant', content: 'Answer!' }
      ]
    };
    
    const result = openCodeToGeminiRequest(openCodeReq);
    
    expect(result.contents).toHaveLength(2);
    expect(result.contents[0].role).toBe('user');
    expect(result.contents[1].role).toBe('model');
  });
  
  test('maps generation parameters correctly', () => {
    const openCodeReq: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [{ role: 'user', content: 'Test' }],
      temperature: 0.8,
      top_p: 0.95,
      max_tokens: 2048,
      stop: ['DONE']
    };
    
    const result = openCodeToGeminiRequest(openCodeReq);
    
    expect(result.generationConfig).toBeDefined();
    expect(result.generationConfig!.temperature).toBe(0.8);
    expect(result.generationConfig!.topP).toBe(0.95);
    expect(result.generationConfig!.maxOutputTokens).toBe(2048);
    expect(result.generationConfig!.stopSequences).toEqual(['DONE']);
  });
  
  test('omits generationConfig if no parameters', () => {
    const openCodeReq: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [{ role: 'user', content: 'Test' }]
    };
    
    const result = openCodeToGeminiRequest(openCodeReq);
    
    expect(result.generationConfig).toBeUndefined();
  });
  
  test('omits systemInstruction if no system messages', () => {
    const openCodeReq: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [{ role: 'user', content: 'Test' }]
    };
    
    const result = openCodeToGeminiRequest(openCodeReq);
    
    expect(result.systemInstruction).toBeUndefined();
  });
  
  test('handles conversation with multiple turns', () => {
    const openCodeReq: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: 'Good!' }
      ]
    };
    
    const result = openCodeToGeminiRequest(openCodeReq);
    
    expect(result.contents).toHaveLength(4);
    expect(result.contents[0].role).toBe('user');
    expect(result.contents[1].role).toBe('model');
    expect(result.contents[2].role).toBe('user');
    expect(result.contents[3].role).toBe('model');
  });
  
  test('ignores empty stop array', () => {
    const openCodeReq: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [{ role: 'user', content: 'Test' }],
      stop: []
    };
    
    const result = openCodeToGeminiRequest(openCodeReq);
    
    expect(result.generationConfig).toBeUndefined();
  });
});

describe('Bidirectional transformation consistency', () => {
  test('round-trip: Gemini → OpenCode → Gemini preserves structure', () => {
    const original: GeminiRequest = {
      systemInstruction: {
        parts: [{ text: 'System prompt' }]
      },
      contents: [
        { role: 'user', parts: [{ text: 'Question' }] },
        { role: 'model', parts: [{ text: 'Answer' }] }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 1024
      }
    };
    
    const openCode = geminiToOpenCodeRequest(original, 'gemini-pro');
    const backToGemini = openCodeToGeminiRequest(openCode);
    
    expect(backToGemini.systemInstruction?.parts[0].text).toBe('System prompt');
    expect(backToGemini.contents).toHaveLength(2);
    expect(backToGemini.contents[0].parts[0].text).toBe('Question');
    expect(backToGemini.contents[1].parts[0].text).toBe('Answer');
    expect(backToGemini.generationConfig?.temperature).toBe(0.7);
  });
  
  test('round-trip: OpenCode → Gemini → OpenCode preserves structure', () => {
    const original: OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'User msg' },
        { role: 'assistant', content: 'Assistant msg' }
      ],
      temperature: 0.5,
      max_tokens: 512
    };
    
    const gemini = openCodeToGeminiRequest(original);
    const backToOpenCode = geminiToOpenCodeRequest(gemini, 'gemini-pro');
    
    expect(backToOpenCode.messages).toHaveLength(3);
    expect(backToOpenCode.messages[0].content).toBe('System');
    expect(backToOpenCode.messages[1].content).toBe('User msg');
    expect(backToOpenCode.messages[2].content).toBe('Assistant msg');
    expect(backToOpenCode.temperature).toBe(0.5);
    expect(backToOpenCode.max_tokens).toBe(512);
  });
});
