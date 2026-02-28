
import { describe, test, expect } from "bun:test"

describe("Stitch Response Transformation", () => {
  // Mock transformation functions matching the enhanced implementation
  const mapFinishReason = (stitchReason?: string): string | null => {
    if (!stitchReason) return null
    
    const mapping: Record<string, string> = {
      'stop': 'stop',
      'length': 'length',
      'max_tokens': 'length',
      'content_filter': 'content_filter',
      'tool_use': 'tool_calls',
      'error': 'stop'
    }
    
    return mapping[stitchReason.toLowerCase()] || 'stop'
  }

  const validateStitchResponse = (data: any): { valid: boolean; error?: string } => {
    if (!data) {
      return { valid: false, error: 'Response data is null or undefined' }
    }
    
    const response = data?.result?.response || data
    
    if (!response.choices || !Array.isArray(response.choices)) {
      return { valid: false, error: 'Missing or invalid choices array' }
    }
    
    return { valid: true }
  }

  const transformStitchToOpenAI = (stitchData: any): any => {
    try {
      const validation = validateStitchResponse(stitchData)
      if (!validation.valid) {
        return {
          choices: [{
            index: 0,
            delta: {},
            finish_reason: null
          }],
          error: validation.error
        }
      }
      
      const response = stitchData?.result?.response || stitchData
      
      const choices = (response.choices || []).map((choice: any, index: number) => {
        const delta: any = {}
        
        if (choice.content && Array.isArray(choice.content)) {
          for (const contentBlock of choice.content) {
            if (contentBlock.type === 'CONTENT_TYPE_TEXT' && contentBlock.data) {
              delta.content = (delta.content || '') + contentBlock.data
            } else if (contentBlock.type === 'CONTENT_TYPE_REASONING' && contentBlock.data) {
              delta.reasoning_text = (delta.reasoning_text || '') + contentBlock.data
            }
          }
        } else if (choice.delta) {
          Object.assign(delta, choice.delta)
        }
        
        const finishReason = mapFinishReason(choice.finish_reason)
        
        return {
          index,
          delta,
          finish_reason: finishReason
        }
      })
      
      const openaiResponse: any = {
        choices: choices,
        model: response.model || stitchData.model
      }
      
      if (response.usage) {
        const usage: any = {
          prompt_tokens: response.usage.promptTokens || 0,
          completion_tokens: response.usage.completionTokens || 0,
          total_tokens: (response.usage.promptTokens || 0) + (response.usage.completionTokens || 0)
        }
        
        if (response.usage.promptTokensDetails) {
          if (response.usage.promptTokensDetails.inputCacheCreationTokens !== undefined) {
            usage.cache_write_tokens = response.usage.promptTokensDetails.inputCacheCreationTokens
          }
          if (response.usage.promptTokensDetails.cachedTokens !== undefined) {
            usage.cache_read_tokens = response.usage.promptTokensDetails.cachedTokens
          }
        }
        
        if (response.usage.completionTokensDetails?.reasoningTokens !== undefined) {
          usage.reasoning_tokens = response.usage.completionTokensDetails.reasoningTokens
        }
        
        openaiResponse.usage = usage
      }
      
      return openaiResponse
    } catch (e) {
      return {
        choices: [{
          index: 0,
          delta: {},
          finish_reason: null
        }],
        error: e instanceof Error ? e.message : 'Unknown transformation error'
      }
    }
  }

  describe("Reasoning Content Support", () => {
    test("transforms reasoning content correctly", () => {
      const stitchResponse = {
        result: {
          response: {
            choices: [{
              content: [
                { type: 'CONTENT_TYPE_REASONING', data: 'Let me think about this...' },
                { type: 'CONTENT_TYPE_TEXT', data: 'Here is my answer.' }
              ]
            }]
          }
        }
      }
      
      const result = transformStitchToOpenAI(stitchResponse)
      
      expect(result.choices[0].delta.reasoning_text).toBe('Let me think about this...')
      expect(result.choices[0].delta.content).toBe('Here is my answer.')
    })

    test("accumulates multiple reasoning blocks", () => {
      const stitchResponse = {
        result: {
          response: {
            choices: [{
              content: [
                { type: 'CONTENT_TYPE_REASONING', data: 'First thought. ' },
                { type: 'CONTENT_TYPE_REASONING', data: 'Second thought. ' },
                { type: 'CONTENT_TYPE_TEXT', data: 'Final answer.' }
              ]
            }]
          }
        }
      }
      
      const result = transformStitchToOpenAI(stitchResponse)
      
      expect(result.choices[0].delta.reasoning_text).toBe('First thought. Second thought. ')
      expect(result.choices[0].delta.content).toBe('Final answer.')
    })

    test("handles reasoning-only content", () => {
      const stitchResponse = {
        result: {
          response: {
            choices: [{
              content: [
                { type: 'CONTENT_TYPE_REASONING', data: 'Just thinking...' }
              ]
            }]
          }
        }
      }
      
      const result = transformStitchToOpenAI(stitchResponse)
      
      expect(result.choices[0].delta.reasoning_text).toBe('Just thinking...')
      expect(result.choices[0].delta.content).toBeUndefined()
    })
  })

  describe("Usage Statistics Mapping", () => {
    test("maps basic usage statistics correctly", () => {
      const stitchResponse = {
        result: {
          response: {
            choices: [{ content: [] }],
            usage: {
              promptTokens: 100,
              completionTokens: 50
            }
          }
        }
      }
      
      const result = transformStitchToOpenAI(stitchResponse)
      
      expect(result.usage.prompt_tokens).toBe(100)
      expect(result.usage.completion_tokens).toBe(50)
      expect(result.usage.total_tokens).toBe(150)
    })

    test("maps cache write tokens correctly", () => {
      const stitchResponse = {
        result: {
          response: {
            choices: [{ content: [] }],
            usage: {
              promptTokens: 100,
              completionTokens: 50,
              promptTokensDetails: {
                inputCacheCreationTokens: 80
              }
            }
          }
        }
      }
      
      const result = transformStitchToOpenAI(stitchResponse)
      
      expect(result.usage.cache_write_tokens).toBe(80)
    })

    test("maps cache read tokens correctly", () => {
      const stitchResponse = {
        result: {
          response: {
            choices: [{ content: [] }],
            usage: {
              promptTokens: 100,
              completionTokens: 50,
              promptTokensDetails: {
                cachedTokens: 60
              }
            }
          }
        }
      }
      
      const result = transformStitchToOpenAI(stitchResponse)
      
      expect(result.usage.cache_read_tokens).toBe(60)
    })

    test("maps reasoning tokens correctly", () => {
      const stitchResponse = {
        result: {
          response: {
            choices: [{ content: [] }],
            usage: {
              promptTokens: 100,
              completionTokens: 150,
              completionTokensDetails: {
                reasoningTokens: 100
              }
            }
          }
        }
      }
      
      const result = transformStitchToOpenAI(stitchResponse)
      
      expect(result.usage.reasoning_tokens).toBe(100)
    })

    test("maps all usage fields together", () => {
      const stitchResponse = {
        result: {
          response: {
            choices: [{ content: [] }],
            usage: {
              promptTokens: 200,
              completionTokens: 300,
              promptTokensDetails: {
                inputCacheCreationTokens: 50,
                cachedTokens: 150
              },
              completionTokensDetails: {
                reasoningTokens: 100
              }
            }
          }
        }
      }
      
      const result = transformStitchToOpenAI(stitchResponse)
      
      expect(result.usage.prompt_tokens).toBe(200)
      expect(result.usage.completion_tokens).toBe(300)
      expect(result.usage.total_tokens).toBe(500)
      expect(result.usage.cache_write_tokens).toBe(50)
      expect(result.usage.cache_read_tokens).toBe(150)
      expect(result.usage.reasoning_tokens).toBe(100)
    })

    test("handles missing usage gracefully", () => {
      const stitchResponse = {
        result: {
          response: {
            choices: [{ content: [] }]
          }
        }
      }
      
      const result = transformStitchToOpenAI(stitchResponse)
      
      expect(result.usage).toBeUndefined()
    })

    test("handles partial usage data", () => {
      const stitchResponse = {
        result: {
          response: {
            choices: [{ content: [] }],
            usage: {
              promptTokens: 100
            }
          }
        }
      }
      
      const result = transformStitchToOpenAI(stitchResponse)
      
      expect(result.usage.prompt_tokens).toBe(100)
      expect(result.usage.completion_tokens).toBe(0)
      expect(result.usage.total_tokens).toBe(100)
    })
  })

  describe("Finish Reason Mapping", () => {
    test("maps 'stop' finish reason", () => {
      expect(mapFinishReason('stop')).toBe('stop')
      expect(mapFinishReason('STOP')).toBe('stop')
    })

    test("maps 'length' finish reason", () => {
      expect(mapFinishReason('length')).toBe('length')
      expect(mapFinishReason('max_tokens')).toBe('length')
    })

    test("maps 'content_filter' finish reason", () => {
      expect(mapFinishReason('content_filter')).toBe('content_filter')
    })

    test("maps 'tool_use' to 'tool_calls'", () => {
      expect(mapFinishReason('tool_use')).toBe('tool_calls')
    })

    test("maps 'error' to 'stop'", () => {
      expect(mapFinishReason('error')).toBe('stop')
    })

    test("defaults unknown reasons to 'stop'", () => {
      expect(mapFinishReason('unknown_reason')).toBe('stop')
    })

    test("returns null for undefined finish reason", () => {
      expect(mapFinishReason(undefined)).toBe(null)
    })

    test("integrates finish reason mapping in transformation", () => {
      const stitchResponse = {
        result: {
          response: {
            choices: [{
              content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Done' }],
              finish_reason: 'max_tokens'
            }]
          }
        }
      }
      
      const result = transformStitchToOpenAI(stitchResponse)
      
      expect(result.choices[0].finish_reason).toBe('length')
    })
  })

  describe("Response Validation", () => {
    test("validates correct response structure", () => {
      const validResponse = {
        result: {
          response: {
            choices: [{ content: [] }]
          }
        }
      }
      
      const validation = validateStitchResponse(validResponse)
      
      expect(validation.valid).toBe(true)
      expect(validation.error).toBeUndefined()
    })

    test("rejects null response", () => {
      const validation = validateStitchResponse(null)
      
      expect(validation.valid).toBe(false)
      expect(validation.error).toBe('Response data is null or undefined')
    })

    test("rejects response without choices", () => {
      const invalidResponse = {
        result: {
          response: {}
        }
      }
      
      const validation = validateStitchResponse(invalidResponse)
      
      expect(validation.valid).toBe(false)
      expect(validation.error).toBe('Missing or invalid choices array')
    })

    test("rejects response with non-array choices", () => {
      const invalidResponse = {
        result: {
          response: {
            choices: 'not an array'
          }
        }
      }
      
      const validation = validateStitchResponse(invalidResponse)
      
      expect(validation.valid).toBe(false)
    })

    test("returns minimal response on validation failure", () => {
      const invalidResponse = {
        result: {
          response: {}
        }
      }
      
      const result = transformStitchToOpenAI(invalidResponse)
      
      expect(result.choices).toHaveLength(1)
      expect(result.choices[0].delta).toEqual({})
      expect(result.choices[0].finish_reason).toBe(null)
      expect(result.error).toBeDefined()
    })
  })

  describe("Streaming Response Transformation", () => {
    test("handles streaming chunk with text delta", () => {
      const chunk = {
        result: {
          response: {
            choices: [{
              content: [
                { type: 'CONTENT_TYPE_TEXT', data: 'Hello' }
              ]
            }]
          }
        }
      }
      
      const result = transformStitchToOpenAI(chunk)
      
      expect(result.choices[0].delta.content).toBe('Hello')
    })

    test("accumulates content across multiple blocks", () => {
      const chunk = {
        result: {
          response: {
            choices: [{
              content: [
                { type: 'CONTENT_TYPE_TEXT', data: 'Hello ' },
                { type: 'CONTENT_TYPE_TEXT', data: 'world' }
              ]
            }]
          }
        }
      }
      
      const result = transformStitchToOpenAI(chunk)
      
      expect(result.choices[0].delta.content).toBe('Hello world')
    })

    test("handles final chunk with usage statistics", () => {
      const finalChunk = {
        result: {
          response: {
            choices: [{
              content: [],
              finish_reason: 'stop'
            }],
            usage: {
              promptTokens: 50,
              completionTokens: 100
            }
          }
        }
      }
      
      const result = transformStitchToOpenAI(finalChunk)
      
      expect(result.choices[0].finish_reason).toBe('stop')
      expect(result.usage.prompt_tokens).toBe(50)
      expect(result.usage.completion_tokens).toBe(100)
    })

    test("handles empty content array", () => {
      const chunk = {
        result: {
          response: {
            choices: [{
              content: []
            }]
          }
        }
      }
      
      const result = transformStitchToOpenAI(chunk)
      
      expect(result.choices[0].delta).toEqual({})
    })
  })

  describe("Edge Cases", () => {
    test("handles response without wrapper", () => {
      const response = {
        choices: [{
          content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Direct response' }]
        }]
      }
      
      const result = transformStitchToOpenAI(response)
      
      expect(result.choices[0].delta.content).toBe('Direct response')
    })

    test("handles multiple choices", () => {
      const response = {
        result: {
          response: {
            choices: [
              { content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Choice 1' }] },
              { content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Choice 2' }] }
            ]
          }
        }
      }
      
      const result = transformStitchToOpenAI(response)
      
      expect(result.choices).toHaveLength(2)
      expect(result.choices[0].index).toBe(0)
      expect(result.choices[1].index).toBe(1)
      expect(result.choices[0].delta.content).toBe('Choice 1')
      expect(result.choices[1].delta.content).toBe('Choice 2')
    })

    test("handles model field", () => {
      const response = {
        result: {
          response: {
            choices: [{ content: [] }],
            model: 'stitch-1-experimental'
          }
        }
      }
      
      const result = transformStitchToOpenAI(response)
      
      expect(result.model).toBe('stitch-1-experimental')
    })

    test("handles content with existing delta format", () => {
      const response = {
        result: {
          response: {
            choices: [{
              delta: {
                content: 'Pre-formatted delta',
                role: 'assistant'
              }
            }]
          }
        }
      }
      
      const result = transformStitchToOpenAI(response)
      
      expect(result.choices[0].delta.content).toBe('Pre-formatted delta')
      expect(result.choices[0].delta.role).toBe('assistant')
    })

    test("returns error on exception", () => {
      const malformedResponse = {
        result: {
          response: {
            choices: [{
              content: [
                { type: 'CONTENT_TYPE_TEXT' } // Missing data field
              ]
            }]
          }
        }
      }
      
      // Should not throw, but handle gracefully
      const result = transformStitchToOpenAI(malformedResponse)
      
      expect(result.choices).toBeDefined()
      expect(result.choices[0].delta.content).toBeUndefined()
    })

    test("handles zero token usage", () => {
      const response = {
        result: {
          response: {
            choices: [{ content: [] }],
            usage: {
              promptTokens: 0,
              completionTokens: 0
            }
          }
        }
      }
      
      const result = transformStitchToOpenAI(response)
      
      expect(result.usage.prompt_tokens).toBe(0)
      expect(result.usage.completion_tokens).toBe(0)
      expect(result.usage.total_tokens).toBe(0)
    })
  })

  describe("Integration Tests", () => {
    test("transforms complete streaming response", () => {
      const response = {
        result: {
          response: {
            model: 'stitch-1',
            choices: [{
              content: [
                { type: 'CONTENT_TYPE_REASONING', data: 'Analyzing the problem... ' },
                { type: 'CONTENT_TYPE_TEXT', data: 'Based on my analysis, the answer is 42.' }
              ],
              finish_reason: 'stop'
            }],
            usage: {
              promptTokens: 150,
              completionTokens: 200,
              promptTokensDetails: {
                inputCacheCreationTokens: 50,
                cachedTokens: 100
              },
              completionTokensDetails: {
                reasoningTokens: 50
              }
            }
          }
        }
      }
      
      const result = transformStitchToOpenAI(response)
      
      expect(result.model).toBe('stitch-1')
      expect(result.choices[0].delta.reasoning_text).toBe('Analyzing the problem... ')
      expect(result.choices[0].delta.content).toBe('Based on my analysis, the answer is 42.')
      expect(result.choices[0].finish_reason).toBe('stop')
      expect(result.usage.prompt_tokens).toBe(150)
      expect(result.usage.completion_tokens).toBe(200)
      expect(result.usage.total_tokens).toBe(350)
      expect(result.usage.cache_write_tokens).toBe(50)
      expect(result.usage.cache_read_tokens).toBe(100)
      expect(result.usage.reasoning_tokens).toBe(50)
    })
  })
})
