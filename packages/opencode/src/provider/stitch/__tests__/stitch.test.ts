/**
 * Stitch Transformer Unit Tests
 * 
 * Comprehensive test suite for the Stitch ↔ OpenCode transformer module.
 * Tests cover request/response transformations, streaming, validation, and error handling.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import * as StitchTransformer from '../index';
import {
  openCodeToStitchRequest,
  stitchToOpenCodeRequest,
} from '../request';
import {
  stitchToOpenCodeResponse,
  stitchToOpenCodeStreamDelta,
  openCodeToStitchResponse,
} from '../response';
import {
  createStitchStreamTransformer,
  transformStitchStreamChunkToOpenCodeDelta,
} from '../stream';
import {
  validateStitchRequest,
  validateOpenCodeRequest,
  validateStitchResponse,
  validateOpenCodeResponse,
  validateStitchStructure,
  isStitchRequest,
  isOpenCodeRequest,
  isStitchResponse,
  isOpenCodeResponse,
  isStitchStreamChunk,
  StitchTransformError,
} from '../validation';
import type {
  OpenCodeRequest,
  StitchRequest,
  StitchResponse,
  OpenCodeResponse,
  StitchStreamChunk,
} from '../types';

describe('Stitch Transformer - Request Transformation', () => {
  describe('openCodeToStitchRequest', () => {
    it('should transform basic OpenCode request to Stitch format', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { role: 'user', content: 'Hello!' }
        ],
        temperature: 0.7,
        max_tokens: 1024
      };

      const result = openCodeToStitchRequest(openCodeReq);

      expect(result.request.model).toBe('claude-4-5-sonnet');
      expect(result.request.messages).toHaveLength(1);
      expect(result.request.messages[0].role).toBe('MESSAGE_ROLE_USER');
      expect(result.request.messages[0].content).toHaveLength(1);
      expect(result.request.messages[0].content[0].type).toBe('CONTENT_TYPE_TEXT');
      expect(result.request.messages[0].content[0].data).toBe('Hello!');
      expect(result.request.config.temperature).toBe(0.7);
      expect(result.request.config.max_tokens).toBe(1024);
    });

    it('should map assistant role to MESSAGE_ROLE_ASSISTANT', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' }
        ]
      };

      const result = openCodeToStitchRequest(openCodeReq);

      expect(result.request.messages[1].role).toBe('MESSAGE_ROLE_ASSISTANT');
      expect(result.request.messages[1].content[0].data).toBe('Hi there!');
    });

    it('should map system role to MESSAGE_ROLE_SYSTEM', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' }
        ]
      };

      const result = openCodeToStitchRequest(openCodeReq);

      expect(result.request.messages[0].role).toBe('MESSAGE_ROLE_SYSTEM');
      expect(result.request.messages[0].content[0].data).toBe('You are a helpful assistant');
    });

    it('should handle reasoning_budget parameter', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [{ role: 'user', content: 'Solve this' }],
        reasoning_budget: 5000
      };

      const result = openCodeToStitchRequest(openCodeReq);

      expect(result.request.config.reasoning_config).toBeDefined();
      expect(result.request.config.reasoning_config?.reasoning_budget).toBe(5000);
    });

    it('should use default temperature and max_tokens when not provided', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const result = openCodeToStitchRequest(openCodeReq);

      expect(result.request.config.temperature).toBe(1);
      expect(result.request.config.max_tokens).toBe(8192);
    });

    it('should map legacy model names', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'stitch-1',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const result = openCodeToStitchRequest(openCodeReq);

      expect(result.request.model).toBe('claude-4-5-sonnet');
      expect(result.request.fallback_model).toBe('claude-4-5-sonnet');
    });

    it('should include client_options with correct structure', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const result = openCodeToStitchRequest(openCodeReq);

      expect(result.request.client_options.source).toBe('stitch_cli');
      expect(result.request.client_options.retry_options.max_retries).toBe(1);
      expect(result.request.client_options.request_options.content_type).toBe('application/json');
      expect(result.request.client_options.request_options.timeout_ms).toBe(600000);
    });
  });

  describe('stitchToOpenCodeRequest', () => {
    it('should transform Stitch request back to OpenCode format', () => {
      const stitchReq: StitchRequest = {
        request: {
          model: 'claude-4-5-sonnet',
          fallback_model: 'claude-4-5-sonnet',
          messages: [{
            role: 'MESSAGE_ROLE_USER',
            content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hello!' }]
          }],
          config: { temperature: 0.7, max_tokens: 1024 },
          client_options: {
            source: 'stitch_cli',
            retry_options: { max_retries: 1 },
            request_options: { content_type: 'application/json', timeout_ms: 600000 }
          }
        }
      };

      const result = stitchToOpenCodeRequest(stitchReq);

      expect(result.model).toBe('claude-4-5-sonnet');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hello!');
      expect(result.temperature).toBe(0.7);
      expect(result.max_tokens).toBe(1024);
    });

    it('should reverse role mappings correctly', () => {
      const stitchReq: StitchRequest = {
        request: {
          model: 'claude-4-5-sonnet',
          fallback_model: 'claude-4-5-sonnet',
          messages: [
            { role: 'MESSAGE_ROLE_SYSTEM', content: [{ type: 'CONTENT_TYPE_TEXT', data: 'System prompt' }] },
            { role: 'MESSAGE_ROLE_USER', content: [{ type: 'CONTENT_TYPE_TEXT', data: 'User message' }] },
            { role: 'MESSAGE_ROLE_ASSISTANT', content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Assistant reply' }] }
          ],
          config: {},
          client_options: {
            source: 'stitch_cli',
            retry_options: { max_retries: 1 },
            request_options: { content_type: 'application/json', timeout_ms: 600000 }
          }
        }
      };

      const result = stitchToOpenCodeRequest(stitchReq);

      expect(result.messages[0].role).toBe('system');
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[2].role).toBe('assistant');
    });


  describe('Tool Calling - Request Transformation', () => {
    it('should transform assistant message with tool_calls to Gemini functionCall', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { role: 'user', content: 'Run tests on test.ts' },
          { 
            role: 'assistant', 
            content: '',
            tool_calls: [{
              id: 'call_abc123',
              type: 'function',
              function: {
                name: 'run_test',
                arguments: '{"path": "test.ts"}'
              }
            }]
          }
        ]
      };

      const result = openCodeToStitchRequest(openCodeReq);

      expect(result.request.messages).toHaveLength(2);
      expect(result.request.messages[1].role).toBe('MESSAGE_ROLE_ASSISTANT');
      expect(result.request.messages[1].content.length).toBeGreaterThan(0);
      
      const functionCallPart = result.request.messages[1].content.find(p => p.functionCall);
      expect(functionCallPart).toBeDefined();
      expect(functionCallPart?.functionCall?.name).toBe('run_test');
      expect(functionCallPart?.functionCall?.args).toEqual({ path: 'test.ts' });
    });

    it('should handle multiple tool_calls in a single message', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { 
            role: 'assistant', 
            content: 'I will run two tests',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'test1', arguments: '{"file": "a.ts"}' }
              },
              {
                id: 'call_2',
                type: 'function',
                function: { name: 'test2', arguments: '{"file": "b.ts"}' }
              }
            ]
          }
        ]
      };

      const result = openCodeToStitchRequest(openCodeReq);
      const msg = result.request.messages[0];
      
      const functionCalls = msg.content.filter(p => p.functionCall);
      expect(functionCalls).toHaveLength(2);
      expect(functionCalls[0].functionCall?.name).toBe('test1');
      expect(functionCalls[1].functionCall?.name).toBe('test2');
    });

    it('should transform tool message to Gemini functionResponse', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { 
            role: 'tool',
            tool_call_id: 'call_abc123',
            name: 'run_test',
            content: 'All tests passed'
          }
        ]
      };

      const result = openCodeToStitchRequest(openCodeReq);

      expect(result.request.messages).toHaveLength(1);
      expect(result.request.messages[0].role).toBe('MESSAGE_ROLE_USER');
      
      const funcResponse = result.request.messages[0].content[0].functionResponse;
      expect(funcResponse).toBeDefined();
      expect(funcResponse?.name).toBe('run_test');
      expect(funcResponse?.response.name).toBe('run_test');
      expect(funcResponse?.response.content).toBe('All tests passed');
    });

    it('should safely handle malformed tool arguments JSON', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { 
            role: 'assistant', 
            content: '',
            tool_calls: [{
              id: 'call_bad',
              type: 'function',
              function: {
                name: 'test_func',
                arguments: '{invalid json}'
              }
            }]
          }
        ]
      };

      // Should not throw
      const result = openCodeToStitchRequest(openCodeReq);
      
      const functionCallPart = result.request.messages[0].content.find(p => p.functionCall);
      expect(functionCallPart?.functionCall?.args).toEqual({});
    });
  });

  describe('Tool Calling - Response Transformation', () => {
    it('should transform Gemini functionCall to OpenAI tool_calls', () => {
      const stitchRes: StitchResponse = {
        result: {
          response: {
            model: 'claude-4-5-sonnet',
            choices: [{
              index: 0,
              content: [
                { 
                  type: 'CONTENT_TYPE_TEXT', 
                  data: '',
                  functionCall: {
                    name: 'get_weather',
                    args: { location: 'San Francisco' }
                  }
                }
              ],
              finish_reason: 'FINISH_REASON_TOOL_CALLS'
            }],
            usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
              total_tokens: 30
            }
          }
        }
      };

      const result = stitchToOpenCodeResponse(stitchRes);

      expect(result.choices[0].message.tool_calls).toBeDefined();
      expect(result.choices[0].message.tool_calls).toHaveLength(1);
      expect(result.choices[0].message.tool_calls![0].type).toBe('function');
      expect(result.choices[0].message.tool_calls![0].function.name).toBe('get_weather');
      expect(result.choices[0].message.tool_calls![0].function.arguments).toBe('{"location":"San Francisco"}');
      expect(result.choices[0].finish_reason).toBe('tool_calls');
    });

    it('should handle multiple functionCalls in response', () => {
      const stitchRes: StitchResponse = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [
                { 
                  type: 'CONTENT_TYPE_TEXT', 
                  data: 'Running tools',
                  functionCall: { name: 'tool1', args: { a: 1 } }
                },
                { 
                  type: 'CONTENT_TYPE_TEXT', 
                  data: '',
                  functionCall: { name: 'tool2', args: { b: 2 } }
                }
              ]
            }]
          }
        }
      };

      const result = stitchToOpenCodeResponse(stitchRes);

      expect(result.choices[0].message.tool_calls).toHaveLength(2);
      expect(result.choices[0].message.tool_calls![0].function.name).toBe('tool1');
      expect(result.choices[0].message.tool_calls![1].function.name).toBe('tool2');
    });

    it('should transform functionCall in streaming delta', () => {
      const chunk: StitchStreamChunk = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [{
                type: 'CONTENT_TYPE_TEXT',
                data: '',
                functionCall: {
                  name: 'search',
                  args: { query: 'test' }
                }
              }]
            }]
          }
        }
      };

      const result = stitchToOpenCodeStreamDelta(chunk);

      expect(result.choices[0].delta.tool_calls).toBeDefined();
      expect(result.choices[0].delta.tool_calls).toHaveLength(1);
      expect(result.choices[0].delta.tool_calls![0].function.name).toBe('search');
      expect(result.choices[0].delta.tool_calls![0].function.arguments).toBe('{"query":"test"}');
    });
  });

  describe('Tool Calling - Reverse Transformation', () => {
    it('should convert Stitch functionCall back to OpenAI tool_calls', () => {
      const stitchReq: StitchRequest = {
        request: {
          model: 'claude-4-5-sonnet',
          fallback_model: 'claude-4-5-sonnet',
          messages: [{
            role: 'MESSAGE_ROLE_ASSISTANT',
            content: [{
              type: 'CONTENT_TYPE_TEXT',
              data: '',
              functionCall: {
                name: 'calculate',
                args: { expression: '2+2' }
              }
            }]
          }],
          config: {},
          client_options: {
            source: 'stitch_cli',
            retry_options: { max_retries: 1 },
            request_options: { content_type: 'application/json', timeout_ms: 600000 }
          }
        }
      };

      const result = stitchToOpenCodeRequest(stitchReq);

      expect(result.messages[0].role).toBe('assistant');
      expect(result.messages[0].tool_calls).toBeDefined();
      expect(result.messages[0].tool_calls).toHaveLength(1);
      expect(result.messages[0].tool_calls![0].function.name).toBe('calculate');
      expect(result.messages[0].tool_calls![0].function.arguments).toBe('{"expression":"2+2"}');
    });

    it('should convert Stitch functionResponse back to OpenAI tool message', () => {
      const stitchReq: StitchRequest = {
        request: {
          model: 'claude-4-5-sonnet',
          fallback_model: 'claude-4-5-sonnet',
          messages: [{
            role: 'MESSAGE_ROLE_USER',
            content: [{
              type: 'CONTENT_TYPE_TEXT',
              data: '',
              functionResponse: {
                name: 'calculate',
                response: {
                  name: 'calculate',
                  content: 'Result: 4'
                }
              }
            }]
          }],
          config: {},
          client_options: {
            source: 'stitch_cli',
            retry_options: { max_retries: 1 },
            request_options: { content_type: 'application/json', timeout_ms: 600000 }
          }
        }
      };

      const result = stitchToOpenCodeRequest(stitchReq);

      expect(result.messages[0].role).toBe('tool');
      expect(result.messages[0].content).toBe('Result: 4');
      expect(result.messages[0].name).toBe('calculate');
      expect(result.messages[0].tool_call_id).toBeDefined();
    });

    it('should convert OpenAI tool_calls back to Stitch functionCall', () => {
      const openCodeRes: OpenCodeResponse = {
        id: 'test-123',
        object: 'chat.completion',
        model: 'claude-4-5-sonnet',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: 'call_xyz',
              type: 'function',
              function: {
                name: 'get_time',
                arguments: '{"timezone":"UTC"}'
              }
            }]
          },
          finish_reason: 'tool_calls'
        }]
      };

      const result = openCodeToStitchResponse(openCodeRes);

      const functionCallPart = result.result.response.choices[0].content.find(p => p.functionCall);
      expect(functionCallPart).toBeDefined();
      expect(functionCallPart?.functionCall?.name).toBe('get_time');
      expect(functionCallPart?.functionCall?.args).toEqual({ timezone: 'UTC' });
    });
  });

  });
});

describe('Stitch Transformer - Response Transformation', () => {
  describe('stitchToOpenCodeResponse', () => {
    it('should transform Stitch response to OpenCode format', () => {
      const stitchRes: StitchResponse = {
        result: {
          response: {
            model: 'claude-4-5-sonnet',
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hello! How can I help?' }],
              finish_reason: 'FINISH_REASON_STOP'
            }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30
            }
          }
        }
      };

      const result = stitchToOpenCodeResponse(stitchRes);

      expect(result.object).toBe('chat.completion');
      expect(result.id).toMatch(/^stitch-\d+-[a-z0-9]+$/);
      expect(result.model).toBe('claude-4-5-sonnet');
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0].message.role).toBe('assistant');
      expect(result.choices[0].message.content).toBe('Hello! How can I help?');
      expect(result.choices[0].finish_reason).toBe('stop');
      expect(result.usage?.prompt_tokens).toBe(10);
      expect(result.usage?.completion_tokens).toBe(20);
      expect(result.usage?.total_tokens).toBe(30);
    });

    it('should map finish reasons correctly', () => {
      const testCases = [
        { input: 'FINISH_REASON_STOP', expected: 'stop' },
        { input: 'FINISH_REASON_LENGTH', expected: 'length' },
        { input: 'FINISH_REASON_CONTENT_FILTER', expected: 'content_filter' },
        { input: 'FINISH_REASON_TOOL_CALLS', expected: 'tool_calls' },
      ];

      testCases.forEach(({ input, expected }) => {
        const stitchRes: StitchResponse = {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Test' }],
                finish_reason: input
              }]
            }
          }
        };

        const result = stitchToOpenCodeResponse(stitchRes);
        expect(result.choices[0].finish_reason).toBe(expected);
      });
    });

    it('should handle cache tokens in usage metadata', () => {
      const stitchRes: StitchResponse = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Test' }]
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
              prompt_tokens_details: {
                input_cache_creation_tokens: 20,
                cached_tokens: 30
              }
            }
          }
        }
      };

      const result = stitchToOpenCodeResponse(stitchRes);

      expect(result.usage?.cache_write_tokens).toBe(20);
      expect(result.usage?.cache_read_tokens).toBe(30);
    });

    it('should handle reasoning tokens in usage metadata', () => {
      const stitchRes: StitchResponse = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Test' }]
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150,
              completion_tokens_details: {
                reasoning_tokens: 25
              }
            }
          }
        }
      };

      const result = stitchToOpenCodeResponse(stitchRes);

      expect(result.usage?.reasoning_tokens).toBe(25);
    });

    it('should handle multiple content blocks', () => {
      const stitchRes: StitchResponse = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [
                { type: 'CONTENT_TYPE_TEXT', data: 'Part 1 ' },
                { type: 'CONTENT_TYPE_TEXT', data: 'Part 2' }
              ]
            }]
          }
        }
      };

      const result = stitchToOpenCodeResponse(stitchRes);

      expect(result.choices[0].message.content).toBe('Part 1 Part 2');
    });

    it('should throw error when no choices provided', () => {
      const stitchRes: any = {
        result: {
          response: {
            choices: []
          }
        }
      };

      expect(() => stitchToOpenCodeResponse(stitchRes)).toThrow('at least one choice');
    });
  });

  describe('stitchToOpenCodeStreamDelta', () => {
    it('should transform stream chunk to delta format', () => {
      const chunk: StitchStreamChunk = {
        result: {
          response: {
            model: 'claude-4-5-sonnet',
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hello' }]
            }]
          }
        }
      };

      const result = stitchToOpenCodeStreamDelta(chunk);

      expect(result.object).toBe('chat.completion.chunk');
      expect(result.id).toMatch(/^stitch-stream-\d+-[a-z0-9]+$/);
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0].delta.content).toBe('Hello');
    });

    it('should handle reasoning content in stream chunks', () => {
      const chunk: StitchStreamChunk = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [
                { type: 'CONTENT_TYPE_TEXT', data: 'Answer: ' },
                { type: 'CONTENT_TYPE_REASONING', data: 'Let me think...' }
              ]
            }]
          }
        }
      };

      const result = stitchToOpenCodeStreamDelta(chunk);

      expect(result.choices[0].delta.content).toBe('Answer: ');
      expect(result.choices[0].delta.reasoning_text).toBe('Let me think...');
    });
  });

  describe('openCodeToStitchResponse', () => {
    it('should transform OpenCode response to Stitch format', () => {
      const openCodeRes: OpenCodeResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        model: 'claude-4-5-sonnet',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello there!'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };

      const result = openCodeToStitchResponse(openCodeRes);

      expect(result.result.response.model).toBe('claude-4-5-sonnet');
      expect(result.result.response.choices[0].content).toHaveLength(1);
      expect(result.result.response.choices[0].content![0].type).toBe('CONTENT_TYPE_TEXT');
      expect(result.result.response.choices[0].content![0].data).toBe('Hello there!');
      expect(result.result.response.choices[0].finish_reason).toBe('STOP');
    });
  });
});

describe('Stitch Transformer - Streaming', () => {
  describe('createStitchStreamTransformer', () => {
    it('should transform NDJSON chunks to SSE format', async () => {
      const transformer = createStitchStreamTransformer();
      
      const ndjsonData = JSON.stringify({
        result: {
          response: {
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hello' }]
            }]
          }
        }
      }) + '\n';

      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(ndjsonData));
          controller.close();
        }
      });

      const transformed = readable.pipeThrough(transformer);
      const reader = transformed.getReader();
      const chunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }

      const output = chunks.join('');
      expect(output).toContain('data: ');
      expect(output).toContain('[DONE]');
      expect(output).toContain('"object":"chat.completion.chunk"');
    });

    it('should handle incomplete JSON across chunk boundaries', async () => {
      const transformer = createStitchStreamTransformer();
      
      const jsonData = JSON.stringify({
        result: {
          response: {
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Test' }]
            }]
          }
        }
      }) + '\n';

      // Split JSON into two chunks
      const mid = Math.floor(jsonData.length / 2);
      const chunk1 = jsonData.substring(0, mid);
      const chunk2 = jsonData.substring(mid);

      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(chunk1));
          controller.enqueue(new TextEncoder().encode(chunk2));
          controller.close();
        }
      });

      const transformed = readable.pipeThrough(transformer);
      const reader = transformed.getReader();
      const chunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }

      const output = chunks.join('');
      expect(output).toContain('data: ');
      expect(output).toContain('[DONE]');
    });

    it('should handle errors in stream gracefully', async () => {
      const transformer = createStitchStreamTransformer();
      
      const errorChunk = JSON.stringify({
        error: {
          code: 500,
          message: 'Internal server error'
        }
      }) + '\n';

      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(errorChunk));
          controller.close();
        }
      });

      const transformed = readable.pipeThrough(transformer);
      const reader = transformed.getReader();
      const chunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }

      const output = chunks.join('');
      expect(output).toContain('[Error:');
      expect(output).toContain('[DONE]');
    });

    it('should always send [DONE] marker at stream end', async () => {
      const transformer = createStitchStreamTransformer();
      
      const readable = new ReadableStream({
        start(controller) {
          controller.close();
        }
      });

      const transformed = readable.pipeThrough(transformer);
      const reader = transformed.getReader();
      const chunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new TextDecoder().decode(value));
      }

      const output = chunks.join('');
      expect(output).toContain('data: [DONE]');
    });
  });
});

describe('Stitch Transformer - Validation', () => {
  describe('validateStitchRequest', () => {
    it('should validate valid Stitch request', () => {
      const valid: StitchRequest = {
        request: {
          model: 'claude-4-5-sonnet',
          fallback_model: 'claude-4-5-sonnet',
          messages: [{
            role: 'MESSAGE_ROLE_USER',
            content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hello' }]
          }],
          config: {},
          client_options: {
            source: 'stitch_cli',
            retry_options: { max_retries: 1 },
            request_options: { content_type: 'application/json', timeout_ms: 600000 }
          }
        }
      };

      expect(() => validateStitchRequest(valid)).not.toThrow();
    });

    it('should throw on invalid request structure', () => {
      expect(() => validateStitchRequest(null)).toThrow(StitchTransformError);
      expect(() => validateStitchRequest({})).toThrow(StitchTransformError);
      expect(() => validateStitchRequest({ request: {} })).toThrow(StitchTransformError);
    });

    it('should throw on empty messages array', () => {
      const invalid = {
        request: {
          messages: []
        }
      };

      expect(() => validateStitchRequest(invalid)).toThrow('cannot be empty');
    });

    it('should throw on invalid role', () => {
      const invalid = {
        request: {
          messages: [{
            role: 'INVALID_ROLE',
            content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Test' }]
          }]
        }
      };

      expect(() => validateStitchRequest(invalid)).toThrow('Invalid role');
    });
  });

  describe('validateOpenCodeRequest', () => {
    it('should validate valid OpenCode request', () => {
      const valid: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [{ role: 'user', content: 'Hello' }]
      };

      expect(() => validateOpenCodeRequest(valid)).not.toThrow();
    });

    it('should throw on missing model', () => {
      const invalid = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      expect(() => validateOpenCodeRequest(invalid)).toThrow('must have "model"');
    });

    it('should throw on invalid temperature', () => {
      const invalid = {
        model: 'test',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 3.0
      };

      expect(() => validateOpenCodeRequest(invalid)).toThrow('between 0 and 2');
    });
  });

  describe('Type Guards', () => {
    it('isStitchRequest should identify Stitch requests', () => {
      const valid: StitchRequest = {
        request: {
          model: 'test',
          fallback_model: 'test',
          messages: [{
            role: 'MESSAGE_ROLE_USER',
            content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Test' }]
          }],
          config: {},
          client_options: {
            source: 'test',
            retry_options: { max_retries: 1 },
            request_options: { content_type: 'application/json', timeout_ms: 60000 }
          }
        }
      };

      expect(isStitchRequest(valid)).toBe(true);
      expect(isStitchRequest({})).toBe(false);
      expect(isStitchRequest(null)).toBe(false);
    });

    it('isOpenCodeRequest should identify OpenCode requests', () => {
      const valid: OpenCodeRequest = {
        model: 'test',
        messages: [{ role: 'user', content: 'Test' }]
      };

      expect(isOpenCodeRequest(valid)).toBe(true);
      expect(isOpenCodeRequest({})).toBe(false);
    });

    it('isStitchResponse should identify Stitch responses', () => {
      const valid: StitchResponse = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Test' }]
            }]
          }
        }
      };

      expect(isStitchResponse(valid)).toBe(true);
      expect(isStitchResponse({})).toBe(false);
    });

    it('isOpenCodeResponse should identify OpenCode responses', () => {
      const valid: OpenCodeResponse = {
        id: 'test',
        object: 'chat.completion',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Test' },
          finish_reason: 'stop'
        }]
      };

      expect(isOpenCodeResponse(valid)).toBe(true);
      expect(isOpenCodeResponse({})).toBe(false);
    });
  });

  describe('validateStitchStructure', () => {
    it('should validate valid structure', () => {
      const valid = {
        result: {
          response: {
            choices: [{ index: 0 }]
          }
        }
      };

      const result = validateStitchStructure(valid);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect errors in structure', () => {
      const withError = {
        error: { message: 'Failed' }
      };

      const result = validateStitchStructure(withError);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('error');
    });
  });
});

describe('Stitch Transformer - Error Handling', () => {
  it('should handle malformed requests gracefully', () => {
    expect(() => validateOpenCodeRequest({ model: '' })).toThrow('empty');
    expect(() => validateOpenCodeRequest({ model: 'test', messages: null })).toThrow('array');
  });

  it('should handle malformed responses gracefully', () => {
    expect(() => stitchToOpenCodeResponse({})).toThrow();
    expect(() => stitchToOpenCodeResponse({ result: {} })).toThrow();
  });

  it('should provide descriptive error messages', () => {
    try {
      validateStitchRequest({});
    } catch (error) {
      expect(error).toBeInstanceOf(StitchTransformError);
      expect((error as Error).message).toContain('request');
    }
  });
});

describe('Stitch Transformer - Module Exports', () => {
  it('should export all required functions', () => {
    expect(StitchTransformer.openCodeToStitchRequest).toBeDefined();
    expect(StitchTransformer.stitchToOpenCodeRequest).toBeDefined();
    expect(StitchTransformer.stitchToOpenCodeResponse).toBeDefined();
    expect(StitchTransformer.openCodeToStitchResponse).toBeDefined();
    expect(StitchTransformer.createStitchStreamTransformer).toBeDefined();
    expect(StitchTransformer.validateStitchRequest).toBeDefined();
    expect(StitchTransformer.validateOpenCodeRequest).toBeDefined();
  });

  it('should export metadata constants', () => {
    expect(StitchTransformer.VERSION).toBe('1.0.0');
    expect(StitchTransformer.STITCH_PROVIDER_METADATA.id).toBe('stitch');
    expect(StitchTransformer.STITCH_PROVIDER_METADATA.supportsStreaming).toBe(true);
  });
});
