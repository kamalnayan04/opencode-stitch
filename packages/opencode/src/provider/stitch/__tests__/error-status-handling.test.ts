/**
 * Error Status Code Handling Tests
 * 
 * Tests for GAP-2/FIX-2: Error status codes from stitch-backend's ResponseStatus
 * are not being propagated in streaming responses, leading to silent failures.
 * 
 * This test suite verifies that:
 * 1. Non-success status codes are detected and converted to error deltas
 * 2. All ResponseCode error types are handled
 * 3. Error status messages are included in the error delta
 * 4. Success status (RESPONSE_CODE_SUCCESS) is allowed through
 * 5. Status code errors stop further processing of the chunk
 */

import { describe, it, expect } from 'bun:test';
import { createStitchStreamTransformer } from '../stream';

/**
 * Helper function to process NDJSON chunks through the stream transformer
 */
async function processStreamChunks(chunks: any[]): Promise<{
  deltas: any[];
  hasDone: boolean;
}> {
  const transformer = createStitchStreamTransformer();
  const deltas: any[] = [];
  let hasDone = false;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Create NDJSON input stream
  const ndjsonLines = chunks.map(chunk => JSON.stringify(chunk) + '\n').join('');
  const inputStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(ndjsonLines));
      controller.close();
    }
  });

  // Pipe through transformer and collect output
  const outputStream = inputStream.pipeThrough(transformer);
  const reader = outputStream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataContent = line.substring(6); // Remove 'data: ' prefix
          if (dataContent === '[DONE]') {
            hasDone = true;
          } else {
            try {
              deltas.push(JSON.parse(dataContent));
            } catch (e) {
              // Ignore parse errors for this test
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { deltas, hasDone };
}

describe('Error Status Code Handling', () => {
  describe('Non-Success Status Codes Detection', () => {
    it('should detect RESPONSE_CODE_BAD_REQUEST and convert to error delta', async () => {
      const chunks = [{
        result: {
          response: {
            status: {
              code: 'RESPONSE_CODE_BAD_REQUEST',
              message: 'Invalid request parameters'
            },
            choices: [{
              index: 0,
              content: [],
              finish_reason: 'FINISH_REASON_STOP'
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      expect(result.deltas.length).toBeGreaterThanOrEqual(1);
      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.delta?.content?.includes('RESPONSE_CODE_BAD_REQUEST')
      );
      expect(errorDelta).toBeDefined();
      expect(errorDelta.choices[0].delta.content).toContain('Invalid request parameters');
      expect(errorDelta.choices[0].finish_reason).toBe('error');
    });

    it('should detect RESPONSE_CODE_INTERNAL_ERROR and convert to error delta', async () => {
      const chunks = [{
        result: {
          response: {
            status: {
              code: 'RESPONSE_CODE_INTERNAL_ERROR',
              message: 'Internal server error occurred'
            },
            choices: [{
              index: 0,
              content: [],
              finish_reason: 'FINISH_REASON_STOP'
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.delta?.content?.includes('RESPONSE_CODE_INTERNAL_ERROR')
      );
      expect(errorDelta).toBeDefined();
      expect(errorDelta.choices[0].delta.content).toContain('Internal server error occurred');
      expect(errorDelta.choices[0].finish_reason).toBe('error');
    });

    it('should detect RESPONSE_CODE_UNAUTHORIZED and convert to error delta', async () => {
      const chunks = [{
        result: {
          response: {
            status: {
              code: 'RESPONSE_CODE_UNAUTHORIZED',
              message: 'Authentication required'
            },
            choices: [{
              index: 0,
              content: []
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.delta?.content?.includes('RESPONSE_CODE_UNAUTHORIZED')
      );
      expect(errorDelta).toBeDefined();
      expect(errorDelta.choices[0].delta.content).toContain('Authentication required');
      expect(errorDelta.choices[0].finish_reason).toBe('error');
    });

    it('should detect RESPONSE_CODE_RATE_LIMIT_EXCEEDED and convert to error delta', async () => {
      const chunks = [{
        result: {
          response: {
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
      }];

      const result = await processStreamChunks(chunks);

      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.delta?.content?.includes('RESPONSE_CODE_RATE_LIMIT_EXCEEDED')
      );
      expect(errorDelta).toBeDefined();
      expect(errorDelta.choices[0].delta.content).toContain('Rate limit exceeded, retry after 60s');
      expect(errorDelta.choices[0].finish_reason).toBe('error');
    });

    it('should detect RESPONSE_CODE_FORBIDDEN and convert to error delta', async () => {
      const chunks = [{
        result: {
          response: {
            status: {
              code: 'RESPONSE_CODE_FORBIDDEN',
              message: 'Access forbidden'
            },
            choices: [{
              index: 0,
              content: []
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.delta?.content?.includes('RESPONSE_CODE_FORBIDDEN')
      );
      expect(errorDelta).toBeDefined();
      expect(errorDelta.choices[0].delta.content).toContain('Access forbidden');
      expect(errorDelta.choices[0].finish_reason).toBe('error');
    });

    it('should detect RESPONSE_CODE_NOT_FOUND and convert to error delta', async () => {
      const chunks = [{
        result: {
          response: {
            status: {
              code: 'RESPONSE_CODE_NOT_FOUND',
              message: 'Resource not found'
            },
            choices: [{
              index: 0,
              content: []
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.delta?.content?.includes('RESPONSE_CODE_NOT_FOUND')
      );
      expect(errorDelta).toBeDefined();
      expect(errorDelta.choices[0].delta.content).toContain('Resource not found');
      expect(errorDelta.choices[0].finish_reason).toBe('error');
    });
  });

  describe('Success Status Code Handling', () => {
    it('should allow RESPONSE_CODE_SUCCESS status through without error', async () => {
      const chunks = [{
        result: {
          response: {
            status: {
              code: 'RESPONSE_CODE_SUCCESS',
              message: 'Request successful'
            },
            choices: [{
              index: 0,
              content: [{
                type: 'CONTENT_TYPE_TEXT',
                data: 'Hello, world!'
              }]
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      // Should have content delta, not error delta
      const contentDelta = result.deltas.find(d => 
        d.choices?.[0]?.delta?.content === 'Hello, world!'
      );
      expect(contentDelta).toBeDefined();
      
      // Should not have error delta
      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.finish_reason === 'error'
      );
      expect(errorDelta).toBeUndefined();
    });

    it('should process chunks without status field normally', async () => {
      const chunks = [{
        result: {
          response: {
            choices: [{
              index: 0,
              content: [{
                type: 'CONTENT_TYPE_TEXT',
                data: 'Normal response'
              }]
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      const contentDelta = result.deltas.find(d => 
        d.choices?.[0]?.delta?.content === 'Normal response'
      );
      expect(contentDelta).toBeDefined();
    });
  });

  describe('Error Status Message Formatting', () => {
    it('should include both status code and message in error content', async () => {
      const chunks = [{
        result: {
          response: {
            status: {
              code: 'RESPONSE_CODE_BAD_REQUEST',
              message: 'Missing required field: model'
            },
            choices: [{
              index: 0,
              content: []
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.finish_reason === 'error'
      );
      expect(errorDelta).toBeDefined();
      expect(errorDelta.choices[0].delta.content).toContain('RESPONSE_CODE_BAD_REQUEST');
      expect(errorDelta.choices[0].delta.content).toContain('Missing required field: model');
    });

    it('should handle error status without message field', async () => {
      const chunks = [{
        result: {
          response: {
            status: {
              code: 'RESPONSE_CODE_INTERNAL_ERROR'
            },
            choices: [{
              index: 0,
              content: []
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.finish_reason === 'error'
      );
      expect(errorDelta).toBeDefined();
      expect(errorDelta.choices[0].delta.content).toContain('RESPONSE_CODE_INTERNAL_ERROR');
    });
  });

  describe('Error Processing Behavior', () => {
    it('should stop processing chunk after detecting error status', async () => {
      const chunks = [{
        result: {
          response: {
            status: {
              code: 'RESPONSE_CODE_BAD_REQUEST',
              message: 'Invalid request'
            },
            choices: [{
              index: 0,
              content: [{
                type: 'CONTENT_TYPE_TEXT',
                data: 'This content should not be processed'
              }]
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      // Should only have error delta, not content delta
      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.finish_reason === 'error'
      );
      expect(errorDelta).toBeDefined();

      // Should NOT have content from the chunk
      const contentDelta = result.deltas.find(d => 
        d.choices?.[0]?.delta?.content === 'This content should not be processed'
      );
      expect(contentDelta).toBeUndefined();
    });

    it('should use model name from response in error delta', async () => {
      const chunks = [{
        result: {
          response: {
            model: 'claude-4-sonnet',
            status: {
              code: 'RESPONSE_CODE_RATE_LIMIT_EXCEEDED',
              message: 'Too many requests'
            },
            choices: [{
              index: 0,
              content: []
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.finish_reason === 'error'
      );
      expect(errorDelta).toBeDefined();
      expect(errorDelta.model).toBe('claude-4-sonnet');
    });

    it('should use default model "stitch" when model not in response', async () => {
      const chunks = [{
        result: {
          response: {
            status: {
              code: 'RESPONSE_CODE_INTERNAL_ERROR',
              message: 'Server error'
            },
            choices: [{
              index: 0,
              content: []
            }]
          }
        }
      }];

      const result = await processStreamChunks(chunks);

      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.finish_reason === 'error'
      );
      expect(errorDelta).toBeDefined();
      expect(errorDelta.model).toBe('stitch');
    });
  });

  describe('Multiple Chunks with Errors', () => {
    it('should handle multiple chunks where only some have errors', async () => {
      const chunks = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'First chunk'
                }]
              }]
            }
          }
        },
        {
          result: {
            response: {
              status: {
                code: 'RESPONSE_CODE_BAD_REQUEST',
                message: 'Error in second chunk'
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

      // Should have both content from first chunk and error from second
      const contentDelta = result.deltas.find(d => 
        d.choices?.[0]?.delta?.content === 'First chunk'
      );
      expect(contentDelta).toBeDefined();

      const errorDelta = result.deltas.find(d => 
        d.choices?.[0]?.finish_reason === 'error'
      );
      expect(errorDelta).toBeDefined();
    });
  });
});
