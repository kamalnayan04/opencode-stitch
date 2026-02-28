// @ts-nocheck

/**
 * Native Schema Migration Tests
 * 
 * Tests for the migration from text-hacking to native schema architecture.
 * Validates that tools, system instructions, and dual-mode parsing work correctly.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { StitchLanguageModel } from '../provider';
import type { LanguageModelV2CallOptions } from '@ai-sdk/provider';
import type { StitchApiRequest } from '../provider-types';

// Helper to create proper Response mock
function createMockResponse(data: any) {
  const jsonString = JSON.stringify(data);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => jsonString,
    json: async () => data,
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new TextEncoder().encode(jsonString).buffer,
    blob: async () => new Blob([jsonString]),
    formData: async () => new FormData(),
    clone: () => createMockResponse(data)
  } as Response;
}

describe('Native Schema Migration', () => {
  let model: StitchLanguageModel;
  let mockFetch: any;
  let capturedRequest: StitchApiRequest | null = null;
  
  beforeEach(() => {
    capturedRequest = null;
    
    // Mock fetch to capture requests
    mockFetch = async (url: string, options: any) => {
      const body = JSON.parse(options.body);
      capturedRequest = body;
      
      // Return mock success response
      return createMockResponse({
        result: {
          response: {
            model: 'claude-4-5-sonnet',
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Test response' }],
              finish_reason: 'FINISH_REASON_STOP'
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150
            }
          }
        }
      });
    };
    
    model = new StitchLanguageModel('stitch-1', {
      baseURL: 'https://test.api',
      apiKey: 'test-key',
      fetch: mockFetch
    });
  });
  
  describe('Test 1: Tools converted to native schema', () => {
    it('should convert 33 tools to native functionDeclaration format', async () => {
      const tools: LanguageModelV2CallOptions['tools'] = Array.from({ length: 33 }, (_, i) => ({
        type: 'function' as const,
        name: `tool_${i + 1}`,
        description: `Test tool ${i + 1}`,
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
            param2: { type: 'number' }
          },
          required: ['param1']
        }
      }));
      
      const options: LanguageModelV2CallOptions = {
        prompt: [{ role: 'user', content: 'Test message' }],
        tools
      };
      
      await model.doGenerate(options);
      
      // Verify native tools array exists
      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.request.tools).toBeDefined();
      expect(capturedRequest!.request.tools).toHaveLength(33);
      
      // Verify each tool has proper structure
      capturedRequest!.request.tools!.forEach((tool, i) => {
        expect(tool.functionDeclaration).toBeDefined();
        expect(tool.functionDeclaration.name).toBe(`tool_${i + 1}`);
        expect(tool.functionDeclaration.description).toBe(`Test tool ${i + 1}`);
        expect(tool.functionDeclaration.parameters).toEqual({
          type: 'object',
          properties: {
            param1: { type: 'string' },
            param2: { type: 'number' }
          },
          required: ['param1']
        });
      });
      
      // Verify NO tool JSON in message text
      const messageText = capturedRequest!.request.messages[0].content[0].data;
      expect(messageText).not.toContain('"tools":[');
      expect(messageText).not.toContain('Available tools:');
      expect(messageText).not.toContain('CRITICAL SYSTEM INSTRUCTION');
    });
  });
  
  describe('Test 2: System messages extracted', () => {
    it('should extract system messages to systemInstruction field', async () => {
      const options: LanguageModelV2CallOptions = {
        prompt: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'system', content: 'Follow these rules strictly.' },
          { role: 'user', content: 'Hello' }
        ]
      };
      
      await model.doGenerate(options);
      
      // Verify systemInstruction exists with combined system messages
      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.request.systemInstruction).toBeDefined();
      expect(capturedRequest!.request.systemInstruction!.parts).toHaveLength(1);
      expect(capturedRequest!.request.systemInstruction!.parts[0].text).toBe(
        'You are a helpful assistant.\n\nFollow these rules strictly.'
      );
      
      // Verify NO system role in messages array
      const roles = capturedRequest!.request.messages.map(m => m.role);
      expect(roles).not.toContain('MESSAGE_ROLE_SYSTEM');
      expect(roles).toEqual(['MESSAGE_ROLE_USER']);
    });
    
    it('should handle no system messages gracefully', async () => {
      const options: LanguageModelV2CallOptions = {
        prompt: [
          { role: 'user', content: 'Hello' }
        ]
      };
      
      await model.doGenerate(options);
      
      // Verify no systemInstruction field when no system messages
      expect(capturedRequest).not.toBeNull();
      expect(capturedRequest!.request.systemInstruction).toBeUndefined();
    });
  });
  
  describe('Test 3: Dual-mode parser handles native function calls', () => {
    it('should parse native functionCall from response', async () => {
      // Override mock to return native function call
      mockFetch = async (url: string, options: any) => {
        const body = JSON.parse(options.body);
        capturedRequest = body;
        
        return createMockResponse({
          result: {
            response: {
              model: 'claude-4-5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: '',
                  functionCall: {
                    name: 'test_tool',
                    args: { param1: 'value1', param2: 42 }
                  }
                }],
                finish_reason: 'FINISH_REASON_FUNCTION_CALL'
              }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50
              }
            }
          }
        });
      };
      
      model = new StitchLanguageModel('stitch-1', {
        baseURL: 'https://test.api',
        apiKey: 'test-key',
        fetch: mockFetch
      });
      
      const options: LanguageModelV2CallOptions = {
        prompt: [{ role: 'user', content: 'Test' }],
        tools: [{
          type: 'function',
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              param1: { type: 'string' },
              param2: { type: 'number' }
            }
          }
        }]
      };
      
      const result = await model.doGenerate(options);
      
      // Verify tool call was parsed
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].toolName).toBe('test_tool');
      expect(result.toolCalls![0].args).toBe(JSON.stringify({ param1: 'value1', param2: 42 }));
      expect(result.toolCalls![0].toolCallType).toBe('function');
      expect(result.finishReason).toBe('tool-calls');
    });
  });
  
  describe('Test 4: Dual-mode parser handles XML fallback', () => {
    it('should parse XML tool calls when no native functionCall', async () => {
      // Override mock to return XML tool call
      mockFetch = async (url: string, options: any) => {
        const body = JSON.parse(options.body);
        capturedRequest = body;
        
        return createMockResponse({
          result: {
            response: {
              model: 'claude-4-5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: '<test_tool>\n{"param1":"value1","param2":42}\n</test_tool>'
                }],
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50
              }
            }
          }
        });
      };
      
      model = new StitchLanguageModel('stitch-1', {
        baseURL: 'https://test.api',
        apiKey: 'test-key',
        fetch: mockFetch
      });
      
      const options: LanguageModelV2CallOptions = {
        prompt: [{ role: 'user', content: 'Test' }],
        tools: [{
          type: 'function',
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: { type: 'object' }
        }]
      };
      
      const result = await model.doGenerate(options);
      
      // Verify XML tool call was parsed
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].toolName).toBe('test_tool');
      expect(result.toolCalls![0].args).toBe('{"param1":"value1","param2":42}');
    });
  });
  
  describe('Test 5: Request size reduced', () => {
    it('should have dramatically smaller request size with native schema', async () => {
      const tools: LanguageModelV2CallOptions['tools'] = Array.from({ length: 33 }, (_, i) => ({
        type: 'function' as const,
        name: `tool_${i + 1}`,
        description: `This is a test tool number ${i + 1} with a longer description to simulate real tools`,
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string', description: 'First parameter' },
            param2: { type: 'number', description: 'Second parameter' },
            param3: { type: 'boolean', description: 'Third parameter' }
          },
          required: ['param1', 'param2']
        }
      }));
      
      const options: LanguageModelV2CallOptions = {
        prompt: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Test message that is relatively short' }
        ],
        tools
      };
      
      await model.doGenerate(options);
      
      // Calculate message content size
      const messageText = capturedRequest!.request.messages
        .map(m => m.content[0].data)
        .join('');
      const messageSize = new Blob([messageText]).size;
      
      // With native schema, message text should be < 5KB (was 63KB with text injection)
      expect(messageSize).toBeLessThan(5000);
      console.log(`Message size: ${messageSize} bytes (target: < 5KB, old: ~63KB)`);
      
      // Verify tools are in separate field, not in message text
      expect(capturedRequest!.request.tools).toBeDefined();
      expect(capturedRequest!.request.tools).toHaveLength(33);
      
      // Calculate total request size for comparison
      const requestSize = new Blob([JSON.stringify(capturedRequest)]).size;
      console.log(`Total request size: ${requestSize} bytes`);
      
      // Request should be reasonable size (tools in proper field, not duplicated in text)
      expect(requestSize).toBeLessThan(50000); // 50KB limit
    });
  });
  
  describe('Integration: Complete migration validation', () => {
    it('should handle complex scenario with all features', async () => {
      const options: LanguageModelV2CallOptions = {
        prompt: [
          { role: 'system', content: 'System instruction 1' },
          { role: 'system', content: 'System instruction 2' },
          { role: 'user', content: 'User message' },
          { role: 'assistant', content: 'Assistant response' },
          { role: 'user', content: 'Follow-up question' }
        ],
        tools: [
          {
            type: 'function',
            name: 'read_file',
            description: 'Read a file',
            inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
          },
          {
            type: 'function',
            name: 'write_file',
            description: 'Write a file',
            inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } } }
          }
        ]
      };
      
      await model.doGenerate(options);
      
      // Verify all three fixes are applied:
      
      // 1. Native tools (no 63KB bloat)
      expect(capturedRequest!.request.tools).toBeDefined();
      expect(capturedRequest!.request.tools).toHaveLength(2);
      const messageText = capturedRequest!.request.messages.map(m => m.content[0].data).join('');
      expect(messageText).not.toContain('"tools":[');
      
      // 2. System instruction extracted (no alternating role violation)
      expect(capturedRequest!.request.systemInstruction).toBeDefined();
      expect(capturedRequest!.request.systemInstruction!.parts[0].text).toBe(
        'System instruction 1\n\nSystem instruction 2'
      );
      const roles = capturedRequest!.request.messages.map(m => m.role);
      expect(roles).not.toContain('MESSAGE_ROLE_SYSTEM');
      
      // 3. Message order preserved (only user/assistant)
      expect(roles).toEqual([
        'MESSAGE_ROLE_USER',
        'MESSAGE_ROLE_ASSISTANT',
        'MESSAGE_ROLE_USER'
      ]);
    });
  });
});
