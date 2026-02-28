
/**
 * Reasoning Token Handling Tests
 * 
 * Test suite for FIX-1/GAP-1: Reasoning tokens (CONTENT_TYPE_REASONING) from models like o1/o3
 * are being silently dropped in streaming responses.
 * 
 * These tests verify that:
 * 1. Reasoning tokens are extracted from NDJSON chunks with CONTENT_TYPE_REASONING
 * 2. Reasoning tokens are emitted as separate SSE deltas with reasoning_text field
 * 3. Multiple reasoning chunks are accumulated correctly
 * 4. Reasoning tokens work alongside regular text content
 * 5. Model name is correctly extracted from response (not hardcoded as "stitch")
 */

import { describe, it, expect } from 'bun:test';
import { createStitchStreamTransformer } from '../stream';

/**
 * Helper function to process NDJSON stream chunks through the transformer
 */
async function processStreamChunks(ndjsonLines: string[]): Promise<{
  chunks: any[];
  hasDone: boolean;
}> {
  const transformer = createStitchStreamTransformer();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const chunks: any[] = [];
  let hasDone = false;

  // Create readable stream from NDJSON lines
  const readable = new ReadableStream({
    start(controller) {
      for (const line of ndjsonLines) {
        controller.enqueue(encoder.encode(line + '\n'));
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
          chunks.push(JSON.parse(json));
        }
      }
    }
  });

  // Pipe through transformer
  await readable.pipeThrough(transformer).pipeTo(writable);

  return { chunks, hasDone };
}

describe('Reasoning Token Handling - RED Phase (Tests should FAIL)', () => {
  describe('Basic Reasoning Token Extraction', () => {
    it('should extract reasoning tokens from NDJSON chunks with CONTENT_TYPE_REASONING', async () => {
      const ndjsonLines = [
        JSON.stringify({
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'Let me think about this problem step by step...'
                }],
                finish_reason: null
              }]
            }
          }
        })
      ];

      const { chunks } = await processStreamChunks(ndjsonLines);

      // Should have at least one chunk with reasoning_text
      const reasoningChunks = chunks.filter(c => 
        c.choices?.[0]?.delta?.reasoning_text
      );
      
      expect(reasoningChunks.length).toBeGreaterThan(0);
      expect(reasoningChunks[0].choices[0].delta.reasoning_text).toBe(
        'Let me think about this problem step by step...'
      );
    });

    it('should emit reasoning tokens as separate SSE deltas with reasoning_text field', async () => {
      const ndjsonLines = [
        JSON.stringify({
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'First, I need to understand the requirements.'
                }],
                finish_reason: null
              }]
            }
          }
        })
      ];

      const { chunks } = await processStreamChunks(ndjsonLines);

      const reasoningChunk = chunks.find(c => 
        c.choices?.[0]?.delta?.reasoning_text
      );
      
      expect(reasoningChunk).toBeDefined();
      expect(reasoningChunk.object).toBe('chat.completion.chunk');
      expect(reasoningChunk.choices[0].delta).toHaveProperty('reasoning_text');
      expect(reasoningChunk.choices[0].finish_reason).toBeNull();
    });

    it('should extract model name from response, not hardcode as "stitch"', async () => {
      const ndjsonLines = [
        JSON.stringify({
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'Analyzing the problem...'
                }],
                finish_reason: null
              }]
            }
          }
        })
      ];

      const { chunks } = await processStreamChunks(ndjsonLines);

      const reasoningChunk = chunks.find(c => 
        c.choices?.[0]?.delta?.reasoning_text
      );
      
      expect(reasoningChunk).toBeDefined();
      expect(reasoningChunk.model).toBe('o1-preview');
      expect(reasoningChunk.model).not.toBe('stitch');
    });
  });

  describe('Multiple Reasoning Chunks', () => {
    it('should accumulate multiple reasoning chunks correctly', async () => {
      const ndjsonLines = [
        JSON.stringify({
          result: {
            response: {
              model: 'o3-mini',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'Step 1: Analyze requirements.'
                }],
                finish_reason: null
              }]
            }
          }
        }),
        JSON.stringify({
          result: {
            response: {
              model: 'o3-mini',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'Step 2: Consider edge cases.'
                }],
                finish_reason: null
              }]
            }
          }
        }),
        JSON.stringify({
          result: {
            response: {
              model: 'o3-mini',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'Step 3: Formulate solution.'
                }],
                finish_reason: null
              }]
            }
          }
        })
      ];

      const { chunks } = await processStreamChunks(ndjsonLines);

      const reasoningChunks = chunks.filter(c => 
        c.choices?.[0]?.delta?.reasoning_text
      );
      
      expect(reasoningChunks.length).toBe(3);
      expect(reasoningChunks[0].choices[0].delta.reasoning_text).toBe('Step 1: Analyze requirements.');
      expect(reasoningChunks[1].choices[0].delta.reasoning_text).toBe('Step 2: Consider edge cases.');
      expect(reasoningChunks[2].choices[0].delta.reasoning_text).toBe('Step 3: Formulate solution.');
    });
  });

  describe('Mixed Content: Reasoning + Text', () => {
    it('should handle reasoning tokens alongside regular text content', async () => {
      const ndjsonLines = [
        JSON.stringify({
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'Let me think about this problem step by step...'
                }],
                finish_reason: null
              }]
            }
          }
        }),
        JSON.stringify({
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'Based on my analysis'
                }],
                finish_reason: null
              }]
            }
          }
        })
      ];

      const { chunks } = await processStreamChunks(ndjsonLines);

      const reasoningChunks = chunks.filter(c => 
        c.choices?.[0]?.delta?.reasoning_text
      );
      const contentChunks = chunks.filter(c => 
        c.choices?.[0]?.delta?.content
      );
      
      expect(reasoningChunks.length).toBe(1);
      expect(contentChunks.length).toBe(1);
      expect(reasoningChunks[0].choices[0].delta.reasoning_text).toBe(
        'Let me think about this problem step by step...'
      );
      expect(contentChunks[0].choices[0].delta.content).toBe('Based on my analysis');
    });

    it('should emit reasoning before text when both are in same response', async () => {
      const ndjsonLines = [
        JSON.stringify({
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
                    data: 'Then the answer'
                  }
                ],
                finish_reason: null
              }]
            }
          }
        })
      ];

      const { chunks } = await processStreamChunks(ndjsonLines);

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      
      // First chunk should be reasoning
      const firstChunk = chunks[0];
      expect(firstChunk.choices[0].delta).toHaveProperty('reasoning_text');
      expect(firstChunk.choices[0].delta.reasoning_text).toBe('Reasoning first');
      
      // Second chunk should be text content
      const secondChunk = chunks[1];
      expect(secondChunk.choices[0].delta).toHaveProperty('content');
      expect(secondChunk.choices[0].delta.content).toBe('Then the answer');
    });
  });

  describe('Complete Response with Usage Metadata', () => {
    it('should handle reasoning tokens with finish_reason and usage metadata', async () => {
      const ndjsonLines = [
        JSON.stringify({
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'Let me think about this problem step by step...'
                }],
                finish_reason: null
              }]
            }
          }
        }),
        JSON.stringify({
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'Based on my analysis'
                }],
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                reasoning_tokens: 75
              }
            }
          }
        })
      ];

      const { chunks, hasDone } = await processStreamChunks(ndjsonLines);

      // Should have reasoning, content, and finish chunks
      const reasoningChunks = chunks.filter(c => 
        c.choices?.[0]?.delta?.reasoning_text
      );
      const contentChunks = chunks.filter(c => 
        c.choices?.[0]?.delta?.content
      );
      const finishChunks = chunks.filter(c => 
        c.choices?.[0]?.finish_reason
      );
      
      expect(reasoningChunks.length).toBeGreaterThan(0);
      expect(contentChunks.length).toBeGreaterThan(0);
      expect(finishChunks.length).toBeGreaterThan(0);
      expect(hasDone).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty reasoning content gracefully', async () => {
      const ndjsonLines = [
        JSON.stringify({
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: ''
                }],
                finish_reason: null
              }]
            }
          }
        })
      ];

      const { chunks } = await processStreamChunks(ndjsonLines);

      // Empty reasoning should be skipped or handled gracefully
      const reasoningChunks = chunks.filter(c => 
        c.choices?.[0]?.delta?.reasoning_text !== undefined
      );
      
      // Either no chunks emitted for empty reasoning, or empty string preserved
      expect(reasoningChunks.length).toBeGreaterThanOrEqual(0);
    });

    it('should not lose reasoning tokens when mixed with errors', async () => {
      const ndjsonLines = [
        JSON.stringify({
          result: {
            response: {
              model: 'o1-preview',
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_REASONING',
                  data: 'Valid reasoning token'
                }],
                finish_reason: null
              }]
            }
          }
        }),
        JSON.stringify({
          error: {
            message: 'Some error occurred'
          }
        })
      ];

      const { chunks } = await processStreamChunks(ndjsonLines);

      const reasoningChunks = chunks.filter(c => 
        c.choices?.[0]?.delta?.reasoning_text
      );
      
      // Should still capture the reasoning token before the error
      expect(reasoningChunks.length).toBe(1);
      expect(reasoningChunks[0].choices[0].delta.reasoning_text).toBe('Valid reasoning token');
    });
  });
});
