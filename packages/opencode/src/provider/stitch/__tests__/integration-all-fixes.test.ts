
/**
 * Comprehensive End-to-End Integration Tests for All Provider Bridge Fixes
 * 
 * This test suite verifies that all 7 CRITICAL fixes work together correctly
 * in realistic scenarios:
 * 
 * FIX-1 (GAP-1): Reasoning tokens capture (CONTENT_TYPE_REASONING)
 * FIX-3 (GAP-3): Usage metadata preservation (prompt_tokens, cache tokens, reasoning_tokens)
 * FIX-2 (GAP-2): Error status code propagation (ResponseStatus.code)
 * FIX-4 (GAP-5): Tool results streaming (functionResponse)
 * FIX-6 (GAP-7): Finish reason mapping (all ResponseCode types)
 * FIX-6 (GAP-4): Response metadata extraction (request_id, latency_ms)
 * Model name extraction (integrated with FIX-1)
 * 
 * Each test validates the complete event flow from stitch-backend NDJSON
 * through the provider bridge to OpenCode SSE deltas.
 */

import { describe, it, expect } from 'bun:test';
import { createStitchStreamTransformer } from '../stream';
import type { StitchStreamChunk, OpenCodeStreamDelta } from '../types';

/**
 * Helper to process NDJSON stream chunks through the transformer
 * and collect all SSE deltas in order
 */
async function processStreamChunks(chunks: StitchStreamChunk[]): Promise<{
  deltas: OpenCodeStreamDelta[];
  hasDone: boolean;
  totalBytes: number;
  processingTimeMs: number;
}> {
  const startTime = Date.now();
  const transformer = createStitchStreamTransformer();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const deltas: OpenCodeStreamDelta[] = [];
  let hasDone = false;
  let totalBytes = 0;

  // Create NDJSON input stream
  const ndjsonLines = chunks.map(chunk => JSON.stringify(chunk) + '\n');
  const readable = new ReadableStream({
    start(controller) {
      for (const line of ndjsonLines) {
        const bytes = encoder.encode(line);
        totalBytes += bytes.length;
        controller.enqueue(bytes);
      }
      controller.close();
    }
  });

  // Create writable stream to collect output
  const writable = new WritableStream({
    write(chunk) {
      const text = decoder.decode(chunk);
      const lines = text.split('\n\n').filter(l => l.trim());
      
      for (const line of lines) {
        if (line.trim() === 'data: [DONE]') {
          hasDone = true;
        } else if (line.startsWith('data: ')) {
          const json = line.substring(6);
          try {
            deltas.push(JSON.parse(json));
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }
  });

  // Pipe through transformer
  await readable.pipeThrough(transformer).pipeTo(writable);

  const processingTimeMs = Date.now() - startTime;

  return { deltas, hasDone, totalBytes, processingTimeMs };
}

/**
 * Validate SSE format for a delta
 */
function validateSSEFormat(delta: OpenCodeStreamDelta): void {
  expect(delta.id).toBeDefined();
  expect(delta.object).toBe('chat.completion.chunk');
  expect(delta.choices).toBeDefined();
  expect(delta.choices).toHaveLength(1);
  expect(delta.choices[0].index).toBe(0);
}

describe('Integration Tests - All Fixes Combined', () => {
  describe('1. Complete Success Flow', () => {
    it('should handle complete NDJSON stream with all event types', async () => {
      const chunks: StitchStreamChunk[] = [
        // Chunk 1: Reasoning tokens (FIX-1)
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'Let me analyze this problem step by step...'
                }]
              }]
            }
          }
        },
        // Chunk 2: More reasoning
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'First, I need to consider the constraints...'
                }]
              }]
            }
          }
        },
        // Chunk 3: Regular text content
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'Based on my analysis, '
                }]
              }]
            }
          }
        },
        // Chunk 4: More text
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'the solution is 42.'
                }]
              }]
            }
          }
        },
        // Chunk 5: Final chunk with finish_reason, usage, and metadata (FIX-3, FIX-6)
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150,
                prompt_tokens_details: {
                  cached_tokens: 25,
                  input_cache_creation_tokens: 10
                },
                completion_tokens_details: {
                  reasoning_tokens: 75
                }
              },
              metadata: {
                request_id: 'req_test123',
                latency_ms: 250
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      // Validate [DONE] was sent
      expect(result.hasDone).toBe(true);

      // Validate we got all expected deltas
      expect(result.deltas.length).toBeGreaterThanOrEqual(5);

      // Extract delta types
      const reasoningDeltas = result.deltas.filter(d => d.choices[0]?.delta?.reasoning_text);
      const contentDeltas = result.deltas.filter(d => d.choices[0]?.delta?.content);
      const finishDeltas = result.deltas.filter(d => d.choices[0]?.finish_reason);
      const usageDeltas = result.deltas.filter(d => d.usage);
      const metadataDeltas = result.deltas.filter(d => d.metadata);

      // Verify reasoning tokens (FIX-1)
      expect(reasoningDeltas.length).toBe(2);
      expect(reasoningDeltas[0].choices[0].delta.reasoning_text).toBe('Let me analyze this problem step by step...');
      expect(reasoningDeltas[1].choices[0].delta.reasoning_text).toBe('First, I need to consider the constraints...');
      expect(reasoningDeltas[0].model).toBe('o1-preview'); // Model name not hardcoded

      // Verify content deltas
      expect(contentDeltas.length).toBe(2);
      expect(contentDeltas[0].choices[0].delta.content).toBe('Based on my analysis, ');
      expect(contentDeltas[1].choices[0].delta.content).toBe('the solution is 42.');

      // Verify finish reason (FIX-6)
      expect(finishDeltas.length).toBeGreaterThanOrEqual(1);
      expect(finishDeltas[0].choices[0].finish_reason).toBe('stop');

      // Verify usage metadata (FIX-3)
      expect(usageDeltas.length).toBeGreaterThanOrEqual(1);
      const usage = usageDeltas[0].usage;
      expect(usage?.prompt_tokens).toBe(100);
      expect(usage?.completion_tokens).toBe(50);
      expect(usage?.total_tokens).toBe(150);
      expect(usage?.cache_read_tokens).toBe(25);
      expect(usage?.cache_write_tokens).toBe(10);
      expect(usage?.reasoning_tokens).toBe(75);

      // Verify response metadata (FIX-6/GAP-4)
      expect(metadataDeltas.length).toBeGreaterThanOrEqual(1);
      expect(metadataDeltas[0].metadata?.request_id).toBe('req_test123');
      expect(metadataDeltas[0].metadata?.latency_ms).toBe(250);

      // Verify all deltas have proper SSE format
      result.deltas.forEach(validateSSEFormat);

      // Verify event order: reasoning → content → finish → usage
      const firstReasoningIndex = result.deltas.findIndex(d => d.choices[0]?.delta?.reasoning_text);
      const firstContentIndex = result.deltas.findIndex(d => d.choices[0]?.delta?.content);
      const finishIndex = result.deltas.findIndex(d => d.choices[0]?.finish_reason);
      const usageIndex = result.deltas.findIndex(d => d.usage);

      expect(firstReasoningIndex).toBeLessThan(firstContentIndex);
      expect(firstContentIndex).toBeLessThan(finishIndex);
      expect(finishIndex).toBeLessThan(usageIndex);

      // Performance check
      expect(result.processingTimeMs).toBeLessThan(1000);
    });
  });

  describe('2. Error Handling Flow', () => {
    it('should handle RESPONSE_CODE_RATE_LIMIT_EXCEEDED with proper error delta', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              status: {
                code: 'RESPONSE_CODE_RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded, retry after 60s'
              },
              choices: [{
                index: 0,
                content: []
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      // Verify error delta emitted (FIX-2)
      const errorDelta = result.deltas.find(d => d.choices[0]?.finish_reason === 'error');
      expect(errorDelta).toBeDefined();
      expect(errorDelta?.choices[0].delta.content).toContain('RESPONSE_CODE_RATE_LIMIT_EXCEEDED');
      expect(errorDelta?.choices[0].delta.content).toContain('Rate limit exceeded, retry after 60s');
      expect(errorDelta?.model).toBe('claude-3.5-sonnet');

      // Verify no content deltas after error
      const contentDeltas = result.deltas.filter(d => 
        d.choices[0]?.delta?.content && !d.choices[0]?.delta?.content?.includes('Error')
      );
      expect(contentDeltas.length).toBe(0);
    });

    it('should handle RESPONSE_CODE_INTERNAL_ERROR and stop processing', async () => {
      const chunks: StitchStreamChunk[] = [
        // First chunk with content
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'Starting response...'
                }]
              }]
            }
          }
        },
        // Error chunk (FIX-2)
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              status: {
                code: 'RESPONSE_CODE_INTERNAL_ERROR',
                message: 'Internal server error occurred'
              },
              choices: [{
                index: 0,
                content: []
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      // Verify first content was emitted
      const contentDelta = result.deltas.find(d => d.choices[0]?.delta?.content === 'Starting response...');
      expect(contentDelta).toBeDefined();

      // Verify error delta was emitted
      const errorDelta = result.deltas.find(d => d.choices[0]?.finish_reason === 'error');
      expect(errorDelta).toBeDefined();
      expect(errorDelta?.choices[0].delta.content).toContain('RESPONSE_CODE_INTERNAL_ERROR');
    });

    it('should handle RESPONSE_CODE_BAD_REQUEST', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'claude-4-sonnet',
              status: {
                code: 'RESPONSE_CODE_BAD_REQUEST',
                message: 'Invalid request parameters'
              },
              choices: [{
                index: 0,
                content: []
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      const errorDelta = result.deltas.find(d => d.choices[0]?.finish_reason === 'error');
      expect(errorDelta).toBeDefined();
      expect(errorDelta?.choices[0].delta.content).toContain('RESPONSE_CODE_BAD_REQUEST');
      expect(errorDelta?.choices[0].delta.content).toContain('Invalid request parameters');
      expect(errorDelta?.model).toBe('claude-4-sonnet');
    });
  });

  describe('3. Complex Tool Workflow', () => {
    it('should handle multi-turn tool usage with tool results streaming', async () => {
      const chunks: StitchStreamChunk[] = [
        // Assistant message with tool call
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'I need to check the weather.'
                }]
              }]
            }
          }
        },
        // Tool result (FIX-4)
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  functionResponse: {
                    name: 'get_weather',
                    response: {
                      name: 'get_weather',
                      content: { temperature: 72, condition: 'sunny' }
                    }
                  }
                }]
              }]
            }
          }
        },
        // Final assistant response
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'The weather is sunny with a temperature of 72°F.'
                }]
              }]
            }
          }
        },
        // Finish with metadata
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 150,
                completion_tokens: 75,
                total_tokens: 225
              },
              metadata: {
                request_id: 'req_tool_test',
                latency_ms: 450
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      // Verify tool result was emitted with role: "tool" (FIX-4)
      const toolDelta = result.deltas.find(d => d.choices[0]?.delta?.role === 'tool');
      expect(toolDelta).toBeDefined();
      expect(toolDelta?.choices[0].delta.name).toBe('get_weather');
      expect(toolDelta?.choices[0].delta.content).toBe('{"temperature":72,"condition":"sunny"}');
      expect(toolDelta?.choices[0].delta.tool_call_id).toBeDefined();

      // Verify assistant content deltas
      const contentDeltas = result.deltas.filter(d => d.choices[0]?.delta?.content && d.choices[0]?.delta?.role !== 'tool');
      expect(contentDeltas.length).toBeGreaterThanOrEqual(2);

      // Verify finish reason
      const finishDelta = result.deltas.find(d => d.choices[0]?.finish_reason === 'stop');
      expect(finishDelta).toBeDefined();

      // Verify usage metadata
      const usageDelta = result.deltas.find(d => d.usage);
      expect(usageDelta?.usage?.prompt_tokens).toBe(150);
      expect(usageDelta?.usage?.completion_tokens).toBe(75);

      // Verify metadata (FIX-6/GAP-4)
      const metadataDelta = result.deltas.find(d => d.metadata);
      expect(metadataDelta?.metadata?.request_id).toBe('req_tool_test');
      expect(metadataDelta?.metadata?.latency_ms).toBe(450);
    });

    it('should handle string tool result content', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  functionResponse: {
                    name: 'read_file',
                    response: {
                      name: 'read_file',
                      content: 'This is the file content'
                    }
                  }
                }]
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      const toolDelta = result.deltas.find(d => d.choices[0]?.delta?.role === 'tool');
      expect(toolDelta).toBeDefined();
      expect(toolDelta?.choices[0].delta.content).toBe('This is the file content');
      expect(toolDelta?.choices[0].delta.name).toBe('read_file');
    });
  });

  describe('4. Model Identification Flow', () => {
    it('should correctly identify o1-preview model with reasoning tokens', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'Analyzing...'
                }]
              }]
            }
          }
        },
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'Answer'
                }],
                finish_reason: 'FINISH_REASON_STOP'
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      // Verify all deltas have correct model name
      result.deltas.forEach(delta => {
        expect(delta.model).toBe('o1-preview');
        expect(delta.model).not.toBe('stitch'); // Not hardcoded
      });
    });

    it('should correctly identify claude-3.5-sonnet model', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'Response'
                }],
                finish_reason: 'FINISH_REASON_STOP'
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      result.deltas.forEach(delta => {
        expect(delta.model).toBe('claude-3.5-sonnet');
      });
    });

    it('should use default model "stitch" when model field is missing', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              // No model field
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'Response'
                }],
                finish_reason: 'FINISH_REASON_STOP'
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      result.deltas.forEach(delta => {
        expect(delta.model).toBe('stitch');
      });
    });
  });

  describe('5. Edge Cases', () => {
    it('should handle empty content blocks gracefully', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: ''
                }]
              }]
            }
          }
        },
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'Actual content'
                }],
                finish_reason: 'FINISH_REASON_STOP'
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      // Empty content should be skipped
      const contentDeltas = result.deltas.filter(d => d.choices[0]?.delta?.content);
      expect(contentDeltas.length).toBe(1);
      expect(contentDeltas[0].choices[0].delta.content).toBe('Actual content');
    });

    it('should handle missing optional usage fields', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'Response'
                }],
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150
                // No prompt_tokens_details or completion_tokens_details
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      const usageDelta = result.deltas.find(d => d.usage);
      expect(usageDelta?.usage?.prompt_tokens).toBe(100);
      expect(usageDelta?.usage?.completion_tokens).toBe(50);
      expect(usageDelta?.usage?.cache_read_tokens).toBeUndefined();
      expect(usageDelta?.usage?.cache_write_tokens).toBeUndefined();
      expect(usageDelta?.usage?.reasoning_tokens).toBeUndefined();
    });

    it('should handle missing metadata gracefully', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'Response'
                }],
                finish_reason: 'FINISH_REASON_STOP'
              }]
              // No metadata field
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      // Should still complete successfully
      expect(result.hasDone).toBe(true);
      const finishDelta = result.deltas.find(d => d.choices[0]?.finish_reason);
      expect(finishDelta).toBeDefined();
      expect(finishDelta?.metadata).toBeUndefined();
    });

    it('should handle multiple content blocks of same type', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [
                  {
                    type: 'CONTENT_TYPE_REASONING',
                    data: 'Step 1'
                  },
                  {
                    type: 'CONTENT_TYPE_REASONING',
                    data: 'Step 2'
                  },
                  {
                    type: 'CONTENT_TYPE_TEXT',
                    data: 'Part 1'
                  },
                  {
                    type: 'CONTENT_TYPE_TEXT',
                    data: 'Part 2'
                  }
                ],
                finish_reason: 'FINISH_REASON_STOP'
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      const reasoningDeltas = result.deltas.filter(d => d.choices[0]?.delta?.reasoning_text);
      const contentDeltas = result.deltas.filter(d => d.choices[0]?.delta?.content);

      expect(reasoningDeltas.length).toBe(2);
      expect(contentDeltas.length).toBe(2);
      expect(reasoningDeltas[0].choices[0].delta.reasoning_text).toBe('Step 1');
      expect(reasoningDeltas[1].choices[0].delta.reasoning_text).toBe('Step 2');
      expect(contentDeltas[0].choices[0].delta.content).toBe('Part 1');
      expect(contentDeltas[1].choices[0].delta.content).toBe('Part 2');
    });

    it('should handle interleaved content types correctly', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [
                  {
                    type: 'CONTENT_TYPE_REASONING',
                    data: 'Reasoning first'
                  },
                  {
                    type: 'CONTENT_TYPE_TEXT',
                    data: 'Then text'
                  },
                  {
                    type: 'CONTENT_TYPE_REASONING',
                    data: 'More reasoning'
                  },
                  {
                    type: 'CONTENT_TYPE_TEXT',
                    data: 'Final text'
                  }
                ],
                finish_reason: 'FINISH_REASON_STOP'
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      // Verify order is preserved
      expect(result.deltas.length).toBeGreaterThanOrEqual(4);
      
      // Find indices
      let reasoningIndex1 = -1, textIndex1 = -1, reasoningIndex2 = -1, textIndex2 = -1;
      
      for (let i = 0; i < result.deltas.length; i++) {
        const delta = result.deltas[i];
        if (delta.choices[0]?.delta?.reasoning_text === 'Reasoning first' && reasoningIndex1 === -1) {
          reasoningIndex1 = i;
        } else if (delta.choices[0]?.delta?.content === 'Then text' && textIndex1 === -1) {
          textIndex1 = i;
        } else if (delta.choices[0]?.delta?.reasoning_text === 'More reasoning' && reasoningIndex2 === -1) {
          reasoningIndex2 = i;
        } else if (delta.choices[0]?.delta?.content === 'Final text' && textIndex2 === -1) {
          textIndex2 = i;
        }
      }

      // Verify order matches input
      expect(reasoningIndex1).toBeLessThan(textIndex1);
      expect(textIndex1).toBeLessThan(reasoningIndex2);
      expect(reasoningIndex2).toBeLessThan(textIndex2);
    });
  });

  describe('6. Finish Reason Mapping Comprehensive', () => {
    it('should map all standard finish reasons correctly', async () => {
      const testCases: Array<{ input: string; expected: string }> = [
        { input: 'FINISH_REASON_STOP', expected: 'stop' },
        { input: 'FINISH_REASON_MAX_TOKENS', expected: 'length' },
        { input: 'FINISH_REASON_SAFETY', expected: 'content_filter' },
        { input: 'FINISH_REASON_RECITATION', expected: 'content_filter' },
        { input: 'FINISH_REASON_FUNCTION_CALL', expected: 'tool_calls' },
      ];

      for (const testCase of testCases) {
        const chunks: StitchStreamChunk[] = [
          {
            result: {
              response: {
                model: 'claude-3.5-sonnet',
                choices: [{
                  index: 0,
                  content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                  finish_reason: testCase.input
                }]
              }
            }
          }
        ];

        const result = await processStreamChunks(chunks);
        const finishDelta = result.deltas.find(d => d.choices[0]?.finish_reason);
        expect(finishDelta?.choices[0].finish_reason).toBe(testCase.expected);
      }
    });

    it('should map all error ResponseCode types to "error"', async () => {
      const errorCodes = [
        'RESPONSE_CODE_BAD_REQUEST',
        'RESPONSE_CODE_INTERNAL_ERROR',
        'RESPONSE_CODE_UNAUTHORIZED',
        'RESPONSE_CODE_RATE_LIMIT_EXCEEDED',
        'RESPONSE_CODE_FORBIDDEN',
        'RESPONSE_CODE_NOT_FOUND'
      ];

      for (const errorCode of errorCodes) {
        const chunks: StitchStreamChunk[] = [
          {
            result: {
              response: {
                model: 'claude-3.5-sonnet',
                choices: [{
                  index: 0,
                  content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                  finish_reason: errorCode
                }]
              }
            }
          }
        ];

        const result = await processStreamChunks(chunks);
        const finishDelta = result.deltas.find(d => d.choices[0]?.finish_reason);
        expect(finishDelta?.choices[0].finish_reason).toBe('error');
      }
    });
  });

  describe('7. Performance and Data Integrity', () => {
    it('should process large stream efficiently', async () => {
      // Create 100 chunks of content
      const chunks: StitchStreamChunk[] = [];
      for (let i = 0; i < 100; i++) {
        chunks.push({
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: `Chunk ${i} `
                }]
              }]
            }
          }
        });
      }
      // Add finish chunk
      chunks.push({
        result: {
          response: {
            model: 'claude-3.5-sonnet',
            choices: [{
              index: 0,
              finish_reason: 'FINISH_REASON_STOP'
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 500,
              total_tokens: 600
            }
          }
        }
      });

      const result = await processStreamChunks(chunks);

      // Should complete in reasonable time
      expect(result.processingTimeMs).toBeLessThan(2000);

      // Should have all content deltas
      const contentDeltas = result.deltas.filter(d => d.choices[0]?.delta?.content);
      expect(contentDeltas.length).toBe(100);

      // Verify no data loss
      for (let i = 0; i < 100; i++) {
        const found = contentDeltas.find(d => d.choices[0]?.delta?.content === `Chunk ${i} `);
        expect(found).toBeDefined();
      }

      // Should have finish and usage
      expect(result.deltas.find(d => d.choices[0]?.finish_reason)).toBeDefined();
      expect(result.deltas.find(d => d.usage)).toBeDefined();
      expect(result.hasDone).toBe(true);
    });

    it('should verify no event drops in rapid succession', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [
                  { type: 'CONTENT_TYPE_REASONING', data: 'R1' },
                  { type: 'CONTENT_TYPE_TEXT', data: 'T1' }
                ]
              }]
            }
          }
        },
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [
                  { type: 'CONTENT_TYPE_REASONING', data: 'R2' },
                  { type: 'CONTENT_TYPE_TEXT', data: 'T2' }
                ]
              }]
            }
          }
        },
        {
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [
                  { type: 'CONTENT_TYPE_REASONING', data: 'R3' },
                  { type: 'CONTENT_TYPE_TEXT', data: 'T3' }
                ],
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 50,
                completion_tokens: 25,
                total_tokens: 75
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);

      // Should have exactly 3 reasoning deltas
      const reasoningDeltas = result.deltas.filter(d => d.choices[0]?.delta?.reasoning_text);
      expect(reasoningDeltas.length).toBe(3);
      expect(reasoningDeltas.map(d => d.choices[0].delta.reasoning_text)).toEqual(['R1', 'R2', 'R3']);

      // Should have exactly 3 text deltas
      const contentDeltas = result.deltas.filter(d => d.choices[0]?.delta?.content);
      expect(contentDeltas.length).toBe(3);
      expect(contentDeltas.map(d => d.choices[0].delta.content)).toEqual(['T1', 'T2', 'T3']);

      // Should have finish and usage
      expect(result.deltas.find(d => d.choices[0]?.finish_reason === 'stop')).toBeDefined();
      expect(result.deltas.find(d => d.usage?.total_tokens === 75)).toBeDefined();
    });
  });
});
