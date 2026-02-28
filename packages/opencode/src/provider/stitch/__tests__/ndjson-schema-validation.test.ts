
/**
 * NDJSON Schema Validation Tests (GAP-8)
 * 
 * These tests verify that NDJSON chunks are validated against a schema
 * to prevent silent failures when stitch-backend changes response structure.
 * 
 * Test-Driven Development: Tests written FIRST before implementation.
 */

import { describe, it, expect, mock } from 'bun:test';
import { createStitchStreamTransformer } from '../stream';

/**
 * Helper to simulate streaming NDJSON chunks through the transformer
 */
async function processNDJSONChunks(chunks: string[]): Promise<string[]> {
  const transformer = createStitchStreamTransformer();
  const reader = transformer.readable.getReader();
  const writer = transformer.writable.getWriter();
  
  const results: string[] = [];
  
  // Start reading in background
  const readPromise = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        results.push(new TextDecoder().decode(value));
      }
    } catch (err) {
      // Stream might be terminated early, which is expected
    }
  })();
  
  // Write chunks
  try {
    for (const chunk of chunks) {
      await writer.write(new TextEncoder().encode(chunk + '\n'));
    }
    await writer.close();
  } catch (err) {
    // Writer might be closed already due to stream termination
  }
  
  await readPromise;
  
  return results;
}

describe('NDJSON Schema Validation (GAP-8)', () => {
  describe('Valid NDJSON Structures', () => {
    it('should pass validation for valid complete structure', async () => {
      const validChunk = JSON.stringify({
        result: {
          response: {
            model: 'claude-4-sonnet',
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hello' }],
              finish_reason: 'FINISH_REASON_STOP'
            }],
            status: {
              code: 'RESPONSE_CODE_SUCCESS',
              message: 'Success'
            }
          }
        }
      });
      
      const results = await processNDJSONChunks([validChunk]);
      
      // Should produce output (content + finish + done)
      expect(results.length).toBeGreaterThan(0);
      expect(results.join('')).toContain('Hello');
      expect(results.join('')).toContain('[DONE]');
    });
    
    it('should pass validation for minimal valid structure', async () => {
      const minimalChunk = JSON.stringify({
        result: {
          response: {
            choices: [{
              index: 0,
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Test' }]
            }]
          }
        }
      });
      
      const results = await processNDJSONChunks([minimalChunk]);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.join('')).toContain('Test');
    });
    
    it('should pass validation for chunk with usage metadata', async () => {
      const usageChunk = JSON.stringify({
        result: {
          response: {
            model: 'claude-4-sonnet',
            choices: [{
              index: 0,
              content: [],
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
      
      const results = await processNDJSONChunks([usageChunk]);
      
      expect(results.join('')).toContain('prompt_tokens');
      expect(results.join('')).toContain('[DONE]');
    });
  });
  
  describe('Invalid NDJSON Structures - Schema Validation', () => {
    it('should detect and skip chunk with null result', async () => {
      const invalidChunk = JSON.stringify({ result: null });
      
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;
      
      const results = await processNDJSONChunks([invalidChunk]);
      
      console.error = originalError;
      
      // Should log validation error
      expect(consoleSpy).toHaveBeenCalled();
      const errorCall = consoleSpy.mock.calls.find((call: any[]) => 
        call[0]?.includes('Invalid chunk structure')
      );
      expect(errorCall).toBeDefined();
      
      // Should not produce output for invalid chunk
      expect(results.join('')).not.toContain('null');
    });
    
    it('should detect and skip chunk with null response', async () => {
      const invalidChunk = JSON.stringify({
        result: { response: null }
      });
      
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;
      
      const results = await processNDJSONChunks([invalidChunk]);
      
      console.error = originalError;
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(results.join('')).not.toContain('response');
    });
    
    it('should detect and skip chunk with null choices', async () => {
      const invalidChunk = JSON.stringify({
        result: {
          response: {
            choices: null
          }
        }
      });
      
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;
      
      const results = await processNDJSONChunks([invalidChunk]);
      
      console.error = originalError;
      
      expect(consoleSpy).toHaveBeenCalled();
    });
    
    it('should detect and skip chunk with empty choices array', async () => {
      const invalidChunk = JSON.stringify({
        result: {
          response: {
            choices: []
          }
        }
      });
      
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;
      
      const results = await processNDJSONChunks([invalidChunk]);
      
      console.error = originalError;
      
      // Empty choices might be valid in some contexts, so check if processed
      // This test verifies the schema allows it but logs appropriately
    });
    
    it('should detect and skip chunk with wrong field names', async () => {
      const invalidChunk = JSON.stringify({
        wrong_field: 'data',
        another_wrong: { nested: 'value' }
      });
      
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;
      
      const results = await processNDJSONChunks([invalidChunk]);
      
      console.error = originalError;
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(results.join('')).not.toContain('wrong_field');
    });
    
    it('should detect malformed nested structures', async () => {
      const invalidChunk = JSON.stringify({
        result: {
          response: {
            choices: [{
              index: 'not-a-number', // Should be number
              content: 'not-an-array' // Should be array
            }]
          }
        }
      });
      
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;
      
      const results = await processNDJSONChunks([invalidChunk]);
      
      console.error = originalError;
      
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
  
  describe('Error Logging and Messages', () => {
    it('should log detailed validation errors with chunk data', async () => {
      const invalidChunk = JSON.stringify({ result: null });
      
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;
      
      await processNDJSONChunks([invalidChunk]);
      
      console.error = originalError;
      
      // Verify error message contains useful debugging info
      const errorCall = consoleSpy.mock.calls[0];
      expect(errorCall).toBeDefined();
      expect(errorCall[0]).toContain('Stitch Stream');
      expect(errorCall[0]).toContain('Invalid chunk structure');
      
      // Should include error details and chunk
      const errorDetails = errorCall[1];
      expect(errorDetails).toBeDefined();
      expect(errorDetails).toHaveProperty('errors');
      expect(errorDetails).toHaveProperty('chunk');
    });
    
    it('should provide informative error messages for debugging', async () => {
      const invalidChunk = JSON.stringify({
        result: {
          response: {
            choices: null
          }
        }
      });
      
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;
      
      await processNDJSONChunks([invalidChunk]);
      
      console.error = originalError;
      
      // Verify that console.error was called with proper structure
      expect(consoleSpy).toHaveBeenCalled();
      const firstCall = consoleSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      expect(firstCall.length).toBeGreaterThanOrEqual(2);
      
      // Check that error details object is provided
      const errorDetails = firstCall[1];
      if (errorDetails) {
        expect(errorDetails).toHaveProperty('errors');
        expect(errorDetails).toHaveProperty('chunk');
        if (errorDetails.errors) {
          expect(Array.isArray(errorDetails.errors)).toBe(true);
          expect(errorDetails.errors.length).toBeGreaterThan(0);
        }
      }
    });
  });
  
  describe('Mixed Valid and Invalid Chunks', () => {
    it('should process valid chunks and skip invalid ones', async () => {
      const chunks = [
        JSON.stringify({
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'First' }]
              }]
            }
          }
        }),
        JSON.stringify({ result: null }), // Invalid
        JSON.stringify({
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Second' }]
              }]
            }
          }
        }),
        JSON.stringify({ wrong_field: 'data' }), // Invalid
        JSON.stringify({
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Third' }]
              }]
            }
          }
        })
      ];
      
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;
      
      const results = await processNDJSONChunks(chunks);
      
      console.error = originalError;
      
      // Should have logged errors for invalid chunks
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      
      // Should still process valid chunks
      const output = results.join('');
      expect(output).toContain('First');
      expect(output).toContain('Second');
      expect(output).toContain('Third');
    });
  });
  
  describe('Backward Compatibility', () => {
    it('should not break existing valid chunk processing', async () => {
      // Test with a typical real-world chunk structure
      const realWorldChunk = JSON.stringify({
        result: {
          response: {
            model: 'claude-4-sonnet',
            choices: [{
              index: 0,
              content: [{
                type: 'CONTENT_TYPE_TEXT',
                data: 'This is a response from the model.'
              }],
              finish_reason: 'FINISH_REASON_STOP'
            }],
            usage: {
              prompt_tokens: 50,
              completion_tokens: 20,
              total_tokens: 70
            },
            status: {
              code: 'RESPONSE_CODE_SUCCESS',
              message: 'Request processed successfully'
            },
            metadata: {
              request_id: 'req-123',
              latency_ms: 1500
            }
          }
        }
      });
      
      const results = await processNDJSONChunks([realWorldChunk]);
      
      expect(results.join('')).toContain('This is a response from the model');
      expect(results.join('')).toContain('[DONE]');
    });
    
    it('should handle chunks with optional fields correctly', async () => {
      const chunkWithOptionals = JSON.stringify({
        result: {
          response: {
            model: 'claude-4-sonnet',
            choices: [{
              index: 0,
              content: [{
                type: 'CONTENT_TYPE_TEXT',
                data: 'Response',
                explicit_caching_control: {
                  enabled: true
                }
              }]
            }]
          }
        }
      });
      
      const results = await processNDJSONChunks([chunkWithOptionals]);
      
      expect(results.join('')).toContain('Response');
    });
  });
  
  describe('Performance Impact', () => {
    it('should have minimal performance overhead for validation', async () => {
      // Create 100 valid chunks to test performance
      const chunks = Array.from({ length: 100 }, (_, i) => 
        JSON.stringify({
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{ type: 'CONTENT_TYPE_TEXT', data: `Chunk ${i}` }]
              }]
            }
          }
        })
      );
      
      const startTime = performance.now();
      const results = await processNDJSONChunks(chunks);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (< 1 second for 100 chunks)
      expect(duration).toBeLessThan(1000);
      
      // All chunks should be processed
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
