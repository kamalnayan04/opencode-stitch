// @ts-nocheck
/**
 * Stitch Transformer Integration Tests
 * 
 * End-to-end tests for the Stitch ↔ OpenCode transformation pipeline.
 * Tests complete request/response cycles with real-world-like data.
 */

import { describe, it, expect, mock } from 'bun:test';
import {
  openCodeToStitchRequest,
  stitchToOpenCodeRequest,
} from '../request';
import {
  stitchToOpenCodeResponse,
  stitchToOpenCodeStreamDelta,
} from '../response';
import {
  createStitchStreamTransformer,
} from '../stream';
import type {
  OpenCodeRequest,
  StitchRequest,
  StitchResponse,
  OpenCodeResponse,
} from '../types';

describe('Stitch Transformer - Integration Tests', () => {
  describe('Complete Request/Response Cycle', () => {
    it('should handle full transformation pipeline for simple query', () => {
      // 1. Start with OpenCode request
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is 2+2?' }
        ],
        temperature: 0.7,
        max_tokens: 100
      };

      // 2. Transform to Stitch format
      const stitchReq = openCodeToStitchRequest(openCodeReq);
      
      // Verify request transformation
      expect(stitchReq.request.messages).toHaveLength(2);
      expect(stitchReq.request.messages[0].role).toBe('MESSAGE_ROLE_SYSTEM');
      expect(stitchReq.request.messages[1].role).toBe('MESSAGE_ROLE_USER');

      // 3. Simulate Stitch API response
      const stitchRes: StitchResponse = {
        result: {
          response: {
            model: 'claude-4-5-sonnet',
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: '2+2 equals 4.' }],
              finish_reason: 'FINISH_REASON_STOP'
            }],
            usage: {
              prompt_tokens: 25,
              completion_tokens: 8,
              total_tokens: 33
            }
          }
        }
      };

      // 4. Transform back to OpenCode format
      const openCodeRes = stitchToOpenCodeResponse(stitchRes);

      // Verify response transformation
      expect(openCodeRes.object).toBe('chat.completion');
      expect(openCodeRes.model).toBe('claude-4-5-sonnet');
      expect(openCodeRes.choices[0].message.content).toBe('2+2 equals 4.');
      expect(openCodeRes.choices[0].finish_reason).toBe('stop');
      expect(openCodeRes.usage?.prompt_tokens).toBe(25);
      expect(openCodeRes.usage?.completion_tokens).toBe(8);

      // 5. Verify round-trip consistency
      const roundTripReq = stitchToOpenCodeRequest(stitchReq);
      expect(roundTripReq.model).toBe(openCodeReq.model);
      expect(roundTripReq.messages[0].content).toBe(openCodeReq.messages[0].content);
      expect(roundTripReq.messages[1].content).toBe(openCodeReq.messages[1].content);
    });

    it('should handle multi-turn conversation with assistant responses', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { role: 'user', content: 'Hello!' },
          { role: 'assistant', content: 'Hi! How can I help you?' },
          { role: 'user', content: 'Tell me about AI.' }
        ],
        temperature: 0.8
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      expect(stitchReq.request.messages).toHaveLength(3);
      expect(stitchReq.request.messages[0].role).toBe('MESSAGE_ROLE_USER');
      expect(stitchReq.request.messages[1].role).toBe('MESSAGE_ROLE_ASSISTANT');
      expect(stitchReq.request.messages[2].role).toBe('MESSAGE_ROLE_USER');

      // Simulate response
      const stitchRes: StitchResponse = {
        result: {
          response: {
            model: 'claude-4-5-sonnet',
            choices: [{
              index: 0,
              content: [{
                type: 'CONTENT_TYPE_TEXT',
                data: 'AI, or Artificial Intelligence, refers to computer systems...'
              }],
              finish_reason: 'FINISH_REASON_STOP'
            }],
            usage: {
              prompt_tokens: 50,
              completion_tokens: 120,
              total_tokens: 170
            }
          }
        }
      };

      const openCodeRes = stitchToOpenCodeResponse(stitchRes);
      expect(openCodeRes.choices[0].message.content).toContain('Artificial Intelligence');
    });

    it('should handle reasoning model with reasoning_budget', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { role: 'user', content: 'Solve this complex math problem: ...' }
        ],
        reasoning_budget: 10000,
        max_tokens: 4096
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);

      expect(stitchReq.request.config.reasoning_config).toBeDefined();
      expect(stitchReq.request.config.reasoning_config?.reasoning_budget).toBe(10000);

      // Simulate response with reasoning tokens
      const stitchRes: StitchResponse = {
        result: {
          response: {
            model: 'claude-4-5-sonnet',
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'The solution is...' }],
              finish_reason: 'FINISH_REASON_STOP'
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 200,
              total_tokens: 300,
              completion_tokens_details: {
                reasoning_tokens: 150
              }
            }
          }
        }
      };

      const openCodeRes = stitchToOpenCodeResponse(stitchRes);
      expect(openCodeRes.usage?.reasoning_tokens).toBe(150);
    });

    it('should handle cached prompts correctly', () => {
      const stitchRes: StitchResponse = {
        result: {
          response: {
            model: 'claude-4-5-sonnet',
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Response using cache' }],
              finish_reason: 'FINISH_REASON_STOP'
            }],
            usage: {
              prompt_tokens: 1000,
              completion_tokens: 50,
              total_tokens: 1050,
              prompt_tokens_details: {
                input_cache_creation_tokens: 500,
                cached_tokens: 400
              }
            }
          }
        }
      };

      const openCodeRes = stitchToOpenCodeResponse(stitchRes);
      
      expect(openCodeRes.usage?.cache_write_tokens).toBe(500);
      expect(openCodeRes.usage?.cache_read_tokens).toBe(400);
      expect(openCodeRes.usage?.prompt_tokens).toBe(1000);
    });
  });

  describe('Streaming Integration', () => {
    it('should handle complete streaming response', async () => {
      const chunks = [
        { result: { response: { choices: [{ index: 0, content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hello' }] }] } } },
        { result: { response: { choices: [{ index: 0, content: [{ type: 'CONTENT_TYPE_TEXT', data: ' there' }] }] } } },
        { result: { response: { choices: [{ index: 0, content: [{ type: 'CONTENT_TYPE_TEXT', data: '!' }], finish_reason: 'FINISH_REASON_STOP' }] } } }
      ];

      const ndjsonStream = chunks.map(c => JSON.stringify(c)).join('\n') + '\n';

      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(ndjsonStream));
          controller.close();
        }
      });

      const transformer = createStitchStreamTransformer();
      const transformed = readable.pipeThrough(transformer);
      const reader = transformed.getReader();
      
      const outputs: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        outputs.push(new TextDecoder().decode(value));
      }

      const combined = outputs.join('');
      
      // Verify SSE format
      expect(combined).toContain('data: ');
      expect(combined).toContain('data: [DONE]');
      
      // Parse SSE chunks
      const dataLines = combined.split('\n').filter(line => line.startsWith('data: '));
      expect(dataLines.length).toBeGreaterThanOrEqual(3); // At least 3 chunks + [DONE]
      
      // Verify last line is [DONE]
      expect(dataLines[dataLines.length - 1]).toBe('data: [DONE]');
      
      // Verify content chunks
      let fullContent = '';
      for (let i = 0; i < dataLines.length - 1; i++) {
        const line = dataLines[i];
        const json = line.substring(6); // Remove "data: " prefix
        const parsed = JSON.parse(json);
        expect(parsed.object).toBe('chat.completion.chunk');
        if (parsed.choices[0].delta.content) {
          fullContent += parsed.choices[0].delta.content;
        }
      }
      
      expect(fullContent).toBe('Hello there!');
    });

    it('should handle streaming with reasoning tokens', async () => {
      const chunks = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [
                  { type: 'CONTENT_TYPE_REASONING', data: 'Let me think...' }
                ]
              }]
            }
          }
        },
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [
                  { type: 'CONTENT_TYPE_TEXT', data: 'The answer is 42.' }
                ],
                finish_reason: 'FINISH_REASON_STOP'
              }]
            }
          }
        }
      ];

      const ndjsonStream = chunks.map(c => JSON.stringify(c)).join('\n') + '\n';

      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(ndjsonStream));
          controller.close();
        }
      });

      const transformer = createStitchStreamTransformer();
      const transformed = readable.pipeThrough(transformer);
      const reader = transformed.getReader();
      
      const outputs: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        outputs.push(new TextDecoder().decode(value));
      }

      const combined = outputs.join('');
      expect(combined).toContain('reasoning_text');
      expect(combined).toContain('Let me think...');
      expect(combined).toContain('The answer is 42.');
    });

    it('should handle stream errors gracefully', async () => {
      const chunks = [
        { result: { response: { choices: [{ index: 0, content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Start' }] }] } } },
        { error: { code: 500, message: 'Internal error' } },
        { result: { response: { choices: [{ index: 0, content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Resume' }] }] } } }
      ];

      const ndjsonStream = chunks.map(c => JSON.stringify(c)).join('\n') + '\n';

      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(ndjsonStream));
          controller.close();
        }
      });

      const transformer = createStitchStreamTransformer();
      const transformed = readable.pipeThrough(transformer);
      const reader = transformed.getReader();
      
      const outputs: string[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        outputs.push(new TextDecoder().decode(value));
      }

      const combined = outputs.join('');
      
      // Should contain error message
      expect(combined).toContain('[Error:');
      expect(combined).toContain('Internal error');
      
      // Should still end with [DONE]
      expect(combined).toContain('data: [DONE]');
      
      // Should process chunks after error
      expect(combined).toContain('Resume');
    });
  });

  describe('Edge Cases and Error Recovery', () => {
    it('should handle length-limited responses', () => {
      const stitchRes: StitchResponse = {
        result: {
          response: {
            model: 'claude-4-5-sonnet',
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'This is a partial response that was cut off because...' }],
              finish_reason: 'FINISH_REASON_LENGTH'
            }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 100,
              total_tokens: 110
            }
          }
        }
      };

      const openCodeRes = stitchToOpenCodeResponse(stitchRes);
      expect(openCodeRes.choices[0].finish_reason).toBe('length');
    });

    it('should handle content filter responses', () => {
      const stitchRes: StitchResponse = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: '' }],
              finish_reason: 'FINISH_REASON_CONTENT_FILTER'
            }]
          }
        }
      };

      const openCodeRes = stitchToOpenCodeResponse(stitchRes);
      expect(openCodeRes.choices[0].finish_reason).toBe('content_filter');
    });

    it('should handle responses with multiple content blocks', () => {
      const stitchRes: StitchResponse = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [
                { type: 'CONTENT_TYPE_TEXT', data: 'Part 1. ' },
                { type: 'CONTENT_TYPE_TEXT', data: 'Part 2. ' },
                { type: 'CONTENT_TYPE_TEXT', data: 'Part 3.' }
              ],
              finish_reason: 'FINISH_REASON_STOP'
            }]
          }
        }
      };

      const openCodeRes = stitchToOpenCodeResponse(stitchRes);
      expect(openCodeRes.choices[0].message.content).toBe('Part 1. Part 2. Part 3.');
    });

    it('should handle empty content gracefully', () => {
      const stitchRes: StitchResponse = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [],
              finish_reason: 'FINISH_REASON_STOP'
            }]
          }
        }
      };

      const openCodeRes = stitchToOpenCodeResponse(stitchRes);
      expect(openCodeRes.choices[0].message.content).toBe('');
    });

    it('should handle unwrapped Stitch responses', () => {
      // Some endpoints may return unwrapped responses
      const unwrappedRes = {
        model: 'claude-4-5-sonnet',
        choices: [{
          index: 0,
          content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Direct response' }],
          finish_reason: 'FINISH_REASON_STOP'
        }]
      };

      const openCodeRes = stitchToOpenCodeResponse(unwrappedRes);
      expect(openCodeRes.choices[0].message.content).toBe('Direct response');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle code generation request', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          {
            role: 'system',
            content: 'You are an expert programmer. Write clean, efficient code.'
          },
          {
            role: 'user',
            content: 'Write a function to calculate fibonacci numbers in TypeScript.'
          }
        ],
        temperature: 0.2,
        max_tokens: 2000
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);
      expect(stitchReq.request.config.temperature).toBe(0.2);
      expect(stitchReq.request.config.max_tokens).toBe(2000);

      const stitchRes: StitchResponse = {
        result: {
          response: {
            model: 'claude-4-5-sonnet',
            choices: [{
              index: 0,
              content: [{
                type: 'CONTENT_TYPE_TEXT',
                data: '```typescript\nfunction fibonacci(n: number): number {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n```'
              }],
              finish_reason: 'FINISH_REASON_STOP'
            }],
            usage: {
              prompt_tokens: 85,
              completion_tokens: 150,
              total_tokens: 235
            }
          }
        }
      };

      const openCodeRes = stitchToOpenCodeResponse(stitchRes);
      expect(openCodeRes.choices[0].message.content).toContain('function fibonacci');
      expect(openCodeRes.choices[0].message.content).toContain('typescript');
    });

    it('should handle long context with caching', () => {
      const longContext = 'A'.repeat(100000); // Simulate long context

      const openCodeReq: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { role: 'system', content: longContext },
          { role: 'user', content: 'Summarize the above.' }
        ],
        max_tokens: 500
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);
      expect(stitchReq.request.messages[0].content[0].data.length).toBeGreaterThan(50000);

      const stitchRes: StitchResponse = {
        result: {
          response: {
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Summary of the content...' }],
              finish_reason: 'FINISH_REASON_STOP'
            }],
            usage: {
              prompt_tokens: 25000,
              completion_tokens: 100,
              total_tokens: 25100,
              prompt_tokens_details: {
                input_cache_creation_tokens: 24000,
                cached_tokens: 0
              }
            }
          }
        }
      };

      const openCodeRes = stitchToOpenCodeResponse(stitchRes);
      expect(openCodeRes.usage?.cache_write_tokens).toBe(24000);
      expect(openCodeRes.usage?.prompt_tokens).toBe(25000);
    });

    it('should handle model fallback scenario', () => {
      const openCodeReq: OpenCodeRequest = {
        model: 'stitch-1', // Legacy model name
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const stitchReq = openCodeToStitchRequest(openCodeReq);
      
      // Should map to actual model
      expect(stitchReq.request.model).toBe('claude-4-5-sonnet');
      expect(stitchReq.request.fallback_model).toBe('claude-4-5-sonnet');
    });
  });

  describe('Performance and Consistency', () => {
    it('should maintain data consistency through multiple transformations', () => {
      const original: OpenCodeRequest = {
        model: 'claude-4-5-sonnet',
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'User message' },
          { role: 'assistant', content: 'Assistant reply' },
          { role: 'user', content: 'Follow-up' }
        ],
        temperature: 0.75,
        max_tokens: 1500,
        reasoning_budget: 3000
      };

      // Transform: OpenCode → Stitch → OpenCode
      const stitchReq = openCodeToStitchRequest(original);
      const roundTrip = stitchToOpenCodeRequest(stitchReq);

      // Verify consistency
      expect(roundTrip.model).toBe(original.model);
      expect(roundTrip.messages.length).toBe(original.messages.length);
      expect(roundTrip.temperature).toBe(original.temperature);
      expect(roundTrip.max_tokens).toBe(original.max_tokens);
      expect(roundTrip.reasoning_budget).toBe(original.reasoning_budget);

      // Verify message content
      for (let i = 0; i < original.messages.length; i++) {
        expect(roundTrip.messages[i].role).toBe(original.messages[i].role);
        expect(roundTrip.messages[i].content).toBe(original.messages[i].content);
      }
    });

    it('should handle large batch transformations efficiently', () => {
      const requests: OpenCodeRequest[] = Array.from({ length: 100 }, (_, i) => ({
        model: 'claude-4-5-sonnet',
        messages: [{ role: 'user', content: `Message ${i}` }],
        temperature: Math.random()
      }));

      const startTime = Date.now();
      
      const transformed = requests.map(req => {
        const stitchReq = openCodeToStitchRequest(req);
        return stitchToOpenCodeRequest(stitchReq);
      });

      const duration = Date.now() - startTime;

      expect(transformed.length).toBe(100);
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});
