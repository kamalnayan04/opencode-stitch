// @ts-nocheck

/**
 * Finish Reason Mapping Tests
 * 
 * Tests for GAP-7/FIX-6: Incomplete finish reason mapping
 * Verifies that all ResponseCode error types from proto are properly mapped to 'error'
 */

import { describe, it, expect } from 'bun:test';
import { createStitchStreamTransformer } from '../stream';
import type { StitchStreamChunk } from '../types';

/**
 * Helper to process stream chunks through the transformer
 */
async function processStreamChunks(chunks: any[]): Promise<{
  outputChunks: string[];
  lastChunk: any;
}> {
  const transformer = createStitchStreamTransformer();
  const outputChunks: string[] = [];
  
  // Create a readable stream from chunks
  const readable = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const json = JSON.stringify(chunk) + '\n';
        controller.enqueue(new TextEncoder().encode(json));
      }
      controller.close();
    }
  });
  
  // Process through transformer
  const transformed = readable.pipeThrough(transformer);
  const reader = transformed.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const text = new TextDecoder().decode(value);
    outputChunks.push(text);
  }
  
  // Parse the last meaningful chunk (before [DONE])
  let lastChunk = null;
  for (let i = outputChunks.length - 1; i >= 0; i--) {
    const chunk = outputChunks[i];
    if (chunk.includes('data: [DONE]')) continue;
    if (chunk.startsWith('data: ')) {
      const json = chunk.substring(6).trim();
      lastChunk = JSON.parse(json);
      break;
    }
  }
  
  return { outputChunks, lastChunk };
}

describe('Finish Reason Mapping', () => {
  describe('Existing Finish Reasons', () => {
    it('should map FINISH_REASON_STOP to "stop"', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                finish_reason: 'FINISH_REASON_STOP'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('stop');
    });
    
    it('should map FINISH_REASON_MAX_TOKENS to "length"', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                finish_reason: 'FINISH_REASON_MAX_TOKENS'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('length');
    });
    
    it('should map FINISH_REASON_SAFETY to "content_filter"', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                finish_reason: 'FINISH_REASON_SAFETY'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('content_filter');
    });
    
    it('should map FINISH_REASON_FUNCTION_CALL to "tool_calls"', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                finish_reason: 'FINISH_REASON_FUNCTION_CALL'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('tool_calls');
    });
  });
  
  describe('New Error-Type Finish Reasons (GAP-7)', () => {
    it('should map RESPONSE_CODE_BAD_REQUEST to "error"', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                finish_reason: 'RESPONSE_CODE_BAD_REQUEST'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('error');
    });
    
    it('should map RESPONSE_CODE_INTERNAL_ERROR to "error"', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                finish_reason: 'RESPONSE_CODE_INTERNAL_ERROR'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('error');
    });
    
    it('should map RESPONSE_CODE_UNAUTHORIZED to "error"', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                finish_reason: 'RESPONSE_CODE_UNAUTHORIZED'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('error');
    });
    
    it('should map RESPONSE_CODE_RATE_LIMIT_EXCEEDED to "error"', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                finish_reason: 'RESPONSE_CODE_RATE_LIMIT_EXCEEDED'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('error');
    });
    
    it('should map RESPONSE_CODE_FORBIDDEN to "error"', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                finish_reason: 'RESPONSE_CODE_FORBIDDEN'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('error');
    });
    
    it('should map RESPONSE_CODE_NOT_FOUND to "error"', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                finish_reason: 'RESPONSE_CODE_NOT_FOUND'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('error');
    });
  });
  
  describe('Fallback Behavior', () => {
    it('should use lowercase fallback for unknown finish reasons', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }],
                finish_reason: 'UNKNOWN_REASON'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('unknown_reason');
    });
    
    it('should handle missing finish_reason gracefully', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'test' }]
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      // System returns null for missing finish_reason, not undefined
      expect(lastChunk.choices[0].finish_reason).toBeNull();
    });
  });
  
  describe('Integration with Stream Transformation', () => {
    it('should correctly map finish reasons with actual content streaming', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hello' }]
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
                content: [{ type: 'CONTENT_TYPE_TEXT', data: ' World' }]
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
                finish_reason: 'RESPONSE_CODE_RATE_LIMIT_EXCEEDED'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('error');
    });
    
    it('should map finish reasons correctly in mixed content scenarios', async () => {
      const chunks = [
        {
          result: {
            response: {
              model: 'claude-3.5-sonnet',
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Response text' }],
                finish_reason: 'FINISH_REASON_STOP'
              }]
            }
          }
        }
      ];
      
      const { lastChunk } = await processStreamChunks(chunks);
      expect(lastChunk.choices[0].finish_reason).toBe('stop');
    });
  });
});
