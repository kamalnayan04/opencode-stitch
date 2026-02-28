/**
 * Usage Metadata Handling Tests
 * 
 * Tests for GAP-3/FIX-3: Usage metadata preservation in streaming responses
 * 
 * Problem: Usage metadata (token counts, cache statistics) is completely lost
 * in streaming responses because the stream transformer never extracts or
 * forwards the `usage` field from chunks.
 * 
 * Solution: Extract usage metadata from final NDJSON chunk and emit as separate
 * SSE delta after finish_reason, preserving all token count fields.
 */

import { describe, it, expect } from 'bun:test';
import { createStitchStreamTransformer } from '../stream';
import type { StitchStreamChunk, OpenCodeStreamDelta } from '../types';

/**
 * Helper to process stream chunks through transformer
 */
async function processStreamChunks(chunks: StitchStreamChunk[]): Promise<{
  deltas: OpenCodeStreamDelta[];
  hasDone: boolean;
}> {
  const transformer = createStitchStreamTransformer();
  const reader = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const line = JSON.stringify(chunk) + '\n';
        controller.enqueue(new TextEncoder().encode(line));
      }
      controller.close();
    }
  })
    .pipeThrough(transformer)
    .getReader();

  const deltas: OpenCodeStreamDelta[] = [];
  let hasDone = false;
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.substring(6);
        if (data === '[DONE]') {
          hasDone = true;
        } else {
          try {
            deltas.push(JSON.parse(data));
          } catch (e) {
            // Skip malformed lines
          }
        }
      }
    }
  }

  return { deltas, hasDone };
}

describe('Usage Metadata Handling', () => {
  describe('Basic Usage Extraction', () => {
    it('should extract usage metadata from final chunk with finish_reason', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hello, world!' }]
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
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      
      // Find the usage delta (should be after finish_reason delta)
      const usageDelta = result.deltas.find(d => d.usage !== undefined);
      
      expect(usageDelta).toBeDefined();
      expect(usageDelta?.usage?.prompt_tokens).toBe(100);
      expect(usageDelta?.usage?.completion_tokens).toBe(50);
      expect(usageDelta?.usage?.total_tokens).toBe(150);
    });

    it('should emit usage delta after finish_reason delta', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Response' }]
              }]
            }
          }
        },
        {
          result: {
            response: {
              choices: [{
                index: 0,
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 150,
                completion_tokens: 200,
                total_tokens: 350
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      
      // Find indices
      const finishDeltaIndex = result.deltas.findIndex(d => d.choices[0]?.finish_reason !== null);
      const usageDeltaIndex = result.deltas.findIndex(d => d.usage !== undefined);
      
      expect(finishDeltaIndex).toBeGreaterThanOrEqual(0);
      expect(usageDeltaIndex).toBeGreaterThan(finishDeltaIndex);
    });
  });

  describe('Cache Statistics Mapping', () => {
    it('should map cached_tokens to cache_read_tokens', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 200,
                completion_tokens: 100,
                total_tokens: 300,
                prompt_tokens_details: {
                  cached_tokens: 150
                }
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const usageDelta = result.deltas.find(d => d.usage !== undefined);
      
      expect(usageDelta?.usage?.cache_read_tokens).toBe(150);
    });

    it('should map input_cache_creation_tokens to cache_write_tokens', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 200,
                completion_tokens: 100,
                total_tokens: 300,
                prompt_tokens_details: {
                  input_cache_creation_tokens: 50
                }
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const usageDelta = result.deltas.find(d => d.usage !== undefined);
      
      expect(usageDelta?.usage?.cache_write_tokens).toBe(50);
    });

    it('should map both cache fields when present', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 200,
                completion_tokens: 100,
                total_tokens: 300,
                prompt_tokens_details: {
                  cached_tokens: 100,
                  input_cache_creation_tokens: 25
                }
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const usageDelta = result.deltas.find(d => d.usage !== undefined);
      
      expect(usageDelta?.usage?.cache_read_tokens).toBe(100);
      expect(usageDelta?.usage?.cache_write_tokens).toBe(25);
    });
  });

  describe('Reasoning Tokens Mapping', () => {
    it('should map reasoning_tokens from completion_tokens_details', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 150,
                total_tokens: 250,
                completion_tokens_details: {
                  reasoning_tokens: 50
                }
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const usageDelta = result.deltas.find(d => d.usage !== undefined);
      
      expect(usageDelta?.usage?.reasoning_tokens).toBe(50);
    });
  });

  describe('Complete Usage Metadata', () => {
    it('should preserve all usage fields together', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Response text' }]
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
                  reasoning_tokens: 15
                }
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const usageDelta = result.deltas.find(d => d.usage !== undefined);
      
      expect(usageDelta?.usage).toEqual({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        cache_read_tokens: 25,
        cache_write_tokens: 10,
        reasoning_tokens: 15
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing optional usage fields gracefully', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
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
      const usageDelta = result.deltas.find(d => d.usage !== undefined);
      
      expect(usageDelta?.usage?.prompt_tokens).toBe(100);
      expect(usageDelta?.usage?.completion_tokens).toBe(50);
      expect(usageDelta?.usage?.total_tokens).toBe(150);
      expect(usageDelta?.usage?.cache_read_tokens).toBeUndefined();
      expect(usageDelta?.usage?.cache_write_tokens).toBeUndefined();
      expect(usageDelta?.usage?.reasoning_tokens).toBeUndefined();
    });

    it('should not emit usage delta when no usage data present', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Response' }]
              }]
            }
          }
        },
        {
          result: {
            response: {
              choices: [{
                index: 0,
                finish_reason: 'FINISH_REASON_STOP'
              }]
              // No usage field
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const usageDelta = result.deltas.find(d => d.usage !== undefined);
      
      expect(usageDelta).toBeUndefined();
    });

    it('should handle usage without finish_reason in same chunk', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Text' }]
              }]
            }
          }
        },
        {
          result: {
            response: {
              choices: [{
                index: 0,
                finish_reason: 'FINISH_REASON_STOP'
              }]
            }
          }
        },
        {
          result: {
            response: {
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const usageDelta = result.deltas.find(d => d.usage !== undefined);
      
      // Should still capture usage even if in separate chunk
      expect(usageDelta?.usage?.prompt_tokens).toBe(100);
    });
  });

  describe('Usage Delta Structure', () => {
    it('should emit usage delta with proper SSE structure', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                finish_reason: 'FINISH_REASON_STOP'
              }],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                total_tokens: 150
              }
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const usageDelta = result.deltas.find(d => d.usage !== undefined);
      
      expect(usageDelta?.id).toBeDefined();
      expect(usageDelta?.object).toBe('chat.completion.chunk');
      expect(usageDelta?.model).toBe('claude-3.5-sonnet');
      expect(usageDelta?.choices).toHaveLength(1);
      expect(usageDelta?.choices[0].index).toBe(0);
      expect(usageDelta?.choices[0].delta).toEqual({});
      expect(usageDelta?.choices[0].finish_reason).toBeNull();
    });
  });
});
