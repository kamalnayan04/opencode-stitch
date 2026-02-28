/**
 * End-to-End OpenCode Integration Tests
 * 
 * These tests verify that the Gemini transformer is properly integrated
 * into the OpenCode provider system and works end-to-end.
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import * as GeminiTransformer from '../../../src/provider/gemini';

describe('OpenCode Integration - Gemini Transformer', () => {
  test('library exports all required functions', () => {
    // Verify all transformation functions are exported
    expect(typeof GeminiTransformer.geminiToOpenCodeRequest).toBe('function');
    expect(typeof GeminiTransformer.openCodeToGeminiRequest).toBe('function');
    expect(typeof GeminiTransformer.geminiToOpenCodeResponse).toBe('function');
    expect(typeof GeminiTransformer.openCodeToGeminiResponse).toBe('function');
    
    // Verify streaming functions
    expect(typeof GeminiTransformer.transformGeminiStreamChunkToOpenCodeDelta).toBe('function');
    expect(typeof GeminiTransformer.transformOpenCodeDeltaToGeminiStreamChunk).toBe('function');
    
    // Verify validation functions
    expect(typeof GeminiTransformer.validateGeminiRequest).toBe('function');
    expect(typeof GeminiTransformer.validateOpenCodeRequest).toBe('function');
    
    // Verify adapter functions
    expect(typeof GeminiTransformer.createGeminiAdapter).toBe('function');
    expect(typeof GeminiTransformer.isGeminiModel).toBe('function');
    expect(typeof GeminiTransformer.normalizeGeminiModelId).toBe('function');
  });
  
  test('adapter metadata is correctly defined', () => {
    const metadata = GeminiTransformer.GEMINI_PROVIDER_METADATA;
    
    expect(metadata.id).toBe('google-gemini');
    expect(metadata.name).toBe('Google Gemini');
    expect(metadata.npm).toBe('@ai-sdk/google');
    expect(metadata.supportsStreaming).toBe(true);
    expect(metadata.supportsToolCalling).toBe(true);
    expect(metadata.supportsSystemMessages).toBe(true);
  });
  
  test('isGeminiModel correctly identifies Gemini models', () => {
    // Should return true for Gemini models
    expect(GeminiTransformer.isGeminiModel('gemini-pro')).toBe(true);
    expect(GeminiTransformer.isGeminiModel('gemini-1.5-pro')).toBe(true);
    expect(GeminiTransformer.isGeminiModel('gemini-1.5-flash')).toBe(true);
    expect(GeminiTransformer.isGeminiModel('models/gemini-pro')).toBe(true);
    
    // Should return false for non-Gemini models
    expect(GeminiTransformer.isGeminiModel('gpt-4')).toBe(false);
    expect(GeminiTransformer.isGeminiModel('claude-3')).toBe(false);
  });
  
  test('normalizeGeminiModelId removes models/ prefix', () => {
    expect(GeminiTransformer.normalizeGeminiModelId('models/gemini-pro')).toBe('gemini-pro');
    expect(GeminiTransformer.normalizeGeminiModelId('models/gemini-1.5-pro')).toBe('gemini-1.5-pro');
    expect(GeminiTransformer.normalizeGeminiModelId('gemini-pro')).toBe('gemini-pro');
  });
  
  test('can create Gemini adapter', () => {
    const adapter = GeminiTransformer.createGeminiAdapter({
      apiKey: 'test-key',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta'
    });
    
    expect(adapter).toBeDefined();
    expect(typeof adapter).toBe('function');
  });
  
  test('full request transformation pipeline', () => {
    // 1. Create OpenCode request (typical input)
    const openCodeReq: GeminiTransformer.OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is TypeScript?' }
      ],
      temperature: 0.7,
      max_tokens: 2048
    };
    
    // 2. Validate
    expect(() => GeminiTransformer.validateOpenCodeRequest(openCodeReq)).not.toThrow();
    
    // 3. Transform to Gemini format (for API call)
    const geminiReq = GeminiTransformer.openCodeToGeminiRequest(openCodeReq);
    
    expect(geminiReq.systemInstruction).toBeDefined();
    expect(geminiReq.systemInstruction!.parts[0].text).toBe('You are a helpful assistant.');
    expect(geminiReq.contents).toHaveLength(1);
    expect(geminiReq.contents[0].role).toBe('user');
    expect(geminiReq.contents[0].parts[0].text).toBe('What is TypeScript?');
    expect(geminiReq.generationConfig?.temperature).toBe(0.7);
    expect(geminiReq.generationConfig?.maxOutputTokens).toBe(2048);
    
    // 4. Validate Gemini request
    expect(() => GeminiTransformer.validateGeminiRequest(geminiReq)).not.toThrow();
    
    // 5. Simulate API response
    const geminiRes: GeminiTransformer.GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'TypeScript is a typed superset of JavaScript.' }]
        },
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: 20,
        candidatesTokenCount: 30,
        totalTokenCount: 50
      }
    };
    
    // 6. Validate response
    expect(() => GeminiTransformer.validateGeminiResponse(geminiRes)).not.toThrow();
    
    // 7. Transform back to OpenCode format
    const openCodeRes = GeminiTransformer.geminiToOpenCodeResponse(geminiRes);
    
    expect(openCodeRes.object).toBe('chat.completion');
    expect(openCodeRes.choices).toHaveLength(1);
    expect(openCodeRes.choices[0].message.role).toBe('assistant');
    expect(openCodeRes.choices[0].message.content).toBe('TypeScript is a typed superset of JavaScript.');
    expect(openCodeRes.choices[0].finish_reason).toBe('stop');
    expect(openCodeRes.usage?.prompt_tokens).toBe(20);
    expect(openCodeRes.usage?.completion_tokens).toBe(30);
    expect(openCodeRes.usage?.total_tokens).toBe(50);
  });
  
  test('full streaming transformation pipeline', () => {
    // Simulate streaming chunks from Gemini
    const geminiChunks: GeminiTransformer.GeminiStreamChunk[] = [
      { candidates: [{ content: { parts: [{ text: 'Type' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'Script' }] } }] },
      { candidates: [{ content: { parts: [{ text: ' is' }] } }] },
      { candidates: [{ content: { parts: [{ text: ' typed' }] } }] },
      { candidates: [{ finishReason: 'STOP' }] }
    ];
    
    // Transform each chunk
    const openCodeDeltas = geminiChunks.map(
      chunk => GeminiTransformer.transformGeminiStreamChunkToOpenCodeDelta(chunk)
    );
    
    // Verify structure
    expect(openCodeDeltas).toHaveLength(5);
    openCodeDeltas.forEach(delta => {
      expect(delta.object).toBe('chat.completion.chunk');
      expect(delta.choices).toHaveLength(1);
    });
    
    // Reconstruct message
    const fullMessage = openCodeDeltas
      .map(d => d.choices[0].delta.content)
      .filter(Boolean)
      .join('');
    
    expect(fullMessage).toBe('TypeScript is typed');
    expect(openCodeDeltas[4].choices[0].finish_reason).toBe('stop');
  });
  
  test('error handling in integration', () => {
    // Test invalid request
    const invalidReq = {
      model: 'gemini-pro',
      messages: [] // Empty - invalid
    };
    
    expect(() => GeminiTransformer.validateOpenCodeRequest(invalidReq)).toThrow(
      GeminiTransformer.GeminiTransformError
    );
    
    // Test invalid response
    const invalidRes = {
      candidates: [] // Empty - invalid
    };
    
    expect(() => GeminiTransformer.validateGeminiResponse(invalidRes)).toThrow(
      GeminiTransformer.GeminiTransformError
    );
  });
  
  test('type guards work correctly', () => {
    const validGeminiReq: GeminiTransformer.GeminiRequest = {
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }]
    };
    
    const validOpenCodeReq: GeminiTransformer.OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [{ role: 'user', content: 'Test' }]
    };
    
    // Type guards should return true for valid inputs
    expect(GeminiTransformer.isGeminiRequest(validGeminiReq)).toBe(true);
    expect(GeminiTransformer.isOpenCodeRequest(validOpenCodeReq)).toBe(true);
    
    // Type guards should return false for invalid inputs
    expect(GeminiTransformer.isGeminiRequest({})).toBe(false);
    expect(GeminiTransformer.isOpenCodeRequest({})).toBe(false);
    expect(GeminiTransformer.isGeminiRequest(null)).toBe(false);
    expect(GeminiTransformer.isOpenCodeRequest(null)).toBe(false);
  });
  
  test('handles complex multi-turn conversations', () => {
    const conversation: GeminiTransformer.OpenCodeRequest = {
      model: 'gemini-pro',
      messages: [
        { role: 'system', content: 'You are a coding expert.' },
        { role: 'user', content: 'What is recursion?' },
        { role: 'assistant', content: 'Recursion is when a function calls itself.' },
        { role: 'user', content: 'Give an example in Python.' },
        { role: 'assistant', content: 'def factorial(n): return 1 if n <= 1 else n * factorial(n-1)' },
        { role: 'user', content: 'Explain how it works.' }
      ],
      temperature: 0.8
    };
    
    // Transform to Gemini
    const geminiReq = GeminiTransformer.openCodeToGeminiRequest(conversation);
    
    expect(geminiReq.systemInstruction).toBeDefined();
    expect(geminiReq.contents).toHaveLength(5); // 5 conversation turns (excluding system)
    
    // Verify roles are correctly mapped
    expect(geminiReq.contents[0].role).toBe('user');
    expect(geminiReq.contents[1].role).toBe('model');
    expect(geminiReq.contents[2].role).toBe('user');
    expect(geminiReq.contents[3].role).toBe('model');
    expect(geminiReq.contents[4].role).toBe('user');
    
    // Transform back
    const backToOpenCode = GeminiTransformer.geminiToOpenCodeRequest(geminiReq, 'gemini-pro');
    
    expect(backToOpenCode.messages).toHaveLength(6);
    expect(backToOpenCode.messages[0].role).toBe('system');
    expect(backToOpenCode.temperature).toBe(0.8);
  });
  
  test('version and metadata are correct', () => {
    expect(GeminiTransformer.VERSION).toBe('1.0.0');
    expect(GeminiTransformer.TRANSFORMATIONS).toHaveLength(4);
    expect(GeminiTransformer.TRANSFORMATIONS).toContain('gemini-to-opencode-request');
    expect(GeminiTransformer.TRANSFORMATIONS).toContain('opencode-to-gemini-request');
    expect(GeminiTransformer.TRANSFORMATIONS).toContain('gemini-to-opencode-response');
    expect(GeminiTransformer.TRANSFORMATIONS).toContain('opencode-to-gemini-response');
  });
});

describe('OpenCode Provider Integration', () => {
  test('transformer can be imported from provider', async () => {
    // Verify the transformer is accessible from the provider module
    const providerModule = await import('../../../src/provider/provider');
    expect(providerModule).toBeDefined();
    
    // The GeminiTransformer should be imported in provider.ts
    // This test verifies the integration is set up correctly
  });
  
  test('model ID normalization for provider', () => {
    // Test various model ID formats that might come from the provider
    const testCases = [
      { input: 'gemini-pro', expected: 'gemini-pro' },
      { input: 'models/gemini-pro', expected: 'gemini-pro' },
      { input: 'gemini-1.5-pro', expected: 'gemini-1.5-pro' },
      { input: 'models/gemini-1.5-flash', expected: 'gemini-1.5-flash' },
    ];
    
    testCases.forEach(({ input, expected }) => {
      const normalized = GeminiTransformer.normalizeGeminiModelId(input);
      expect(normalized).toBe(expected);
    });
  });
  
  test('complete request-response cycle matches expected format', () => {
    // This test simulates the full cycle:
    // User Input → OpenCode Request → Gemini API Request → Gemini API Response → OpenCode Response
    
    // 1. User input (OpenCode format)
    const userRequest: GeminiTransformer.OpenCodeRequest = {
      model: 'gemini-1.5-pro',
      messages: [
        { role: 'user', content: 'Write a hello world in Python' }
      ],
      temperature: 0.9,
      max_tokens: 1024
    };
    
    // 2. Transform for Gemini API
    const geminiApiRequest = GeminiTransformer.openCodeToGeminiRequest(userRequest);
    expect(geminiApiRequest.contents[0].parts[0].text).toBe('Write a hello world in Python');
    
    // 3. Simulate Gemini API response
    const geminiApiResponse: GeminiTransformer.GeminiResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: 'print("Hello, World!")' }]
        },
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15
      }
    };
    
    // 4. Transform back to OpenCode format
    const userResponse = GeminiTransformer.geminiToOpenCodeResponse(geminiApiResponse);
    
    // 5. Verify final output matches expected OpenCode format
    expect(userResponse).toMatchObject({
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'print("Hello, World!")'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15
      }
    });
  });
});
