
/**
 * Tool Results Streaming Tests
 * 
 * Tests for GAP-5/FIX-4: Tool execution results (functionResponse) streaming
 * 
 * Problem: Tool execution results (functionResponse) are not being streamed back
 * to the client. The non-streaming code handles this, but streaming does not.
 * This breaks the tool use workflow where tool results need to be sent back.
 * 
 * Solution: Detect functionResponse in content blocks and emit tool message deltas
 * with role: "tool", properly formatted content, and correlation IDs.
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

describe('Tool Results Streaming', () => {
  describe('Basic Tool Result Detection', () => {
    it('should detect and extract functionResponse content blocks', async () => {
      const chunks: StitchStreamChunk[] = [
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
        }
      ];

      const result = await processStreamChunks(chunks);
      
      // Should emit a tool message delta
      const toolDelta = result.deltas.find(d => d.choices[0]?.delta?.role === 'tool');
      expect(toolDelta).toBeDefined();
    });

    it('should emit tool results with role: "tool"', async () => {
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
                      content: 'file contents here'
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
      
      expect(toolDelta?.choices[0].delta.role).toBe('tool');
    });
  });

  describe('Tool Result Content Formatting', () => {
    it('should format string content as-is', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
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
      
      expect(toolDelta?.choices[0].delta.content).toBe('This is the file content');
    });

    it('should stringify object content as JSON', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{
                  functionResponse: {
                    name: 'get_weather',
                    response: {
                      name: 'get_weather',
                      content: {
                        temperature: 72,
                        condition: 'sunny',
                        humidity: 65
                      }
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
      
      const expectedContent = JSON.stringify({
        temperature: 72,
        condition: 'sunny',
        humidity: 65
      });
      expect(toolDelta?.choices[0].delta.content).toBe(expectedContent);
    });

    it('should handle nested object structures', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{
                  functionResponse: {
                    name: 'get_data',
                    response: {
                      name: 'get_data',
                      content: {
                        user: {
                          name: 'John',
                          details: {
                            age: 30,
                            city: 'NYC'
                          }
                        }
                      }
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
      
      const content = JSON.parse(toolDelta?.choices[0].delta.content || '{}');
      expect(content.user.name).toBe('John');
      expect(content.user.details.age).toBe(30);
    });
  });

  describe('Tool Call ID Generation', () => {
    it('should generate unique tool_call_id for each result', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{
                  functionResponse: {
                    name: 'tool1',
                    response: {
                      name: 'tool1',
                      content: 'result1'
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
      
      expect(toolDelta?.choices[0].delta.tool_call_id).toBeDefined();
      expect(typeof toolDelta?.choices[0].delta.tool_call_id).toBe('string');
      expect(toolDelta?.choices[0].delta.tool_call_id).toMatch(/^call_/);
    });

    it('should generate different IDs for multiple tool results', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [
                  {
                    functionResponse: {
                      name: 'tool1',
                      response: {
                        name: 'tool1',
                        content: 'result1'
                      }
                    }
                  },
                  {
                    functionResponse: {
                      name: 'tool2',
                      response: {
                        name: 'tool2',
                        content: 'result2'
                      }
                    }
                  }
                ]
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const toolDeltas = result.deltas.filter(d => d.choices[0]?.delta?.role === 'tool');
      
      expect(toolDeltas).toHaveLength(2);
      const id1 = toolDeltas[0].choices[0].delta.tool_call_id;
      const id2 = toolDeltas[1].choices[0].delta.tool_call_id;
      expect(id1).not.toBe(id2);
    });
  });

  describe('Function Name Preservation', () => {
    it('should preserve function name from functionResponse.name', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{
                  functionResponse: {
                    name: 'read_file',
                    response: {
                      name: 'read_file',
                      content: 'content'
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
      
      expect(toolDelta?.choices[0].delta.name).toBe('read_file');
    });

    it('should preserve different function names correctly', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [
                  {
                    functionResponse: {
                      name: 'get_weather',
                      response: {
                        name: 'get_weather',
                        content: { temp: 72 }
                      }
                    }
                  },
                  {
                    functionResponse: {
                      name: 'read_file',
                      response: {
                        name: 'read_file',
                        content: 'file data'
                      }
                    }
                  }
                ]
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const toolDeltas = result.deltas.filter(d => d.choices[0]?.delta?.role === 'tool');
      
      expect(toolDeltas[0].choices[0].delta.name).toBe('get_weather');
      expect(toolDeltas[1].choices[0].delta.name).toBe('read_file');
    });
  });

  describe('Multiple Tool Results', () => {
    it('should handle multiple tool results in same chunk', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [
                  {
                    functionResponse: {
                      name: 'tool1',
                      response: {
                        name: 'tool1',
                        content: 'result1'
                      }
                    }
                  },
                  {
                    functionResponse: {
                      name: 'tool2',
                      response: {
                        name: 'tool2',
                        content: 'result2'
                      }
                    }
                  },
                  {
                    functionResponse: {
                      name: 'tool3',
                      response: {
                        name: 'tool3',
                        content: 'result3'
                      }
                    }
                  }
                ]
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const toolDeltas = result.deltas.filter(d => d.choices[0]?.delta?.role === 'tool');
      
      expect(toolDeltas).toHaveLength(3);
      expect(toolDeltas[0].choices[0].delta.content).toBe('result1');
      expect(toolDeltas[1].choices[0].delta.content).toBe('result2');
      expect(toolDeltas[2].choices[0].delta.content).toBe('result3');
    });
  });

  describe('Mixed Content Handling', () => {
    it('should handle tool results alongside text content', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [
                  {
                    type: 'CONTENT_TYPE_TEXT',
                    data: 'Here is the result:'
                  },
                  {
                    functionResponse: {
                      name: 'read_file',
                      response: {
                        name: 'read_file',
                        content: 'file contents'
                      }
                    }
                  }
                ]
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      
      const textDelta = result.deltas.find(d => 
        d.choices[0]?.delta?.content === 'Here is the result:' && 
        d.choices[0]?.delta?.role === 'assistant'
      );
      const toolDelta = result.deltas.find(d => d.choices[0]?.delta?.role === 'tool');
      
      expect(textDelta).toBeDefined();
      expect(toolDelta).toBeDefined();
      expect(toolDelta?.choices[0].delta.content).toBe('file contents');
    });

    it('should handle tool results alongside tool calls', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [
                  {
                    type: 'CONTENT_TYPE_TEXT',
                    data: '{"tool":"read_file","path":"test.txt"}'
                  },
                  {
                    functionResponse: {
                      name: 'previous_tool',
                      response: {
                        name: 'previous_tool',
                        content: 'previous result'
                      }
                    }
                  }
                ]
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      
      const toolCallDelta = result.deltas.find(d => d.choices[0]?.delta?.tool_calls);
      const toolResultDelta = result.deltas.find(d => d.choices[0]?.delta?.role === 'tool');
      
      expect(toolCallDelta).toBeDefined();
      expect(toolResultDelta).toBeDefined();
    });
  });

  describe('Tool Result Delta Structure', () => {
    it('should emit tool result with proper SSE structure', async () => {
      const chunks: StitchStreamChunk[] = [
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
                      content: { temperature: 72 }
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
      
      expect(toolDelta?.id).toBeDefined();
      expect(toolDelta?.object).toBe('chat.completion.chunk');
      expect(toolDelta?.model).toBe('claude-3.5-sonnet');
      expect(toolDelta?.choices).toHaveLength(1);
      expect(toolDelta?.choices[0].index).toBe(0);
      expect(toolDelta?.choices[0].finish_reason).toBeNull();
      expect(toolDelta?.choices[0].delta.role).toBe('tool');
      expect(toolDelta?.choices[0].delta.content).toBeDefined();
      expect(toolDelta?.choices[0].delta.tool_call_id).toBeDefined();
      expect(toolDelta?.choices[0].delta.name).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty functionResponse content gracefully', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{
                  functionResponse: {
                    name: 'no_op',
                    response: {
                      name: 'no_op',
                      content: ''
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
      
      expect(toolDelta?.choices[0].delta.content).toBe('');
    });

    it('should not emit tool results for content blocks without functionResponse', async () => {
      const chunks: StitchStreamChunk[] = [
        {
          result: {
            response: {
              choices: [{
                index: 0,
                content: [{
                  type: 'CONTENT_TYPE_TEXT',
                  data: 'Just regular text'
                }]
              }]
            }
          }
        }
      ];

      const result = await processStreamChunks(chunks);
      const toolDelta = result.deltas.find(d => d.choices[0]?.delta?.role === 'tool');
      
      expect(toolDelta).toBeUndefined();
    });
  });
});
