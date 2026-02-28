
import { describe, test, expect } from 'bun:test'
import { createStitchStreamTransformer } from '../stitch/stream'

/**
 * Test suite for response metadata extraction from stitch-backend
 * 
 * GAP-4 Fix: Verify that response metadata (request_id, latency_ms) is properly
 * extracted from stitch-backend streaming responses and propagated in SSE deltas.
 * 
 * This addresses the observability gap where production systems cannot trace
 * requests or measure latency because metadata is never extracted from:
 * parsed.result?.response?.metadata
 */

describe('Stitch Metadata Extraction', () => {
  
  /**
   * Helper to simulate streaming NDJSON chunks through the transformer
   */
  async function processStreamChunk(chunk: string): Promise<string[]> {
    const transformer = createStitchStreamTransformer()
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(chunk))
        controller.close()
      }
    })
    
    const transformed = readable.pipeThrough(transformer)
    const reader = transformed.getReader()
    const results: string[] = []
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const text = new TextDecoder().decode(value)
      // Split SSE format lines (data: {...}\n\n)
      const lines = text.split('data: ').filter(l => l.trim())
      results.push(...lines.map(l => l.trim()))
    }
    
    return results
  }
  
  /**
   * Helper to parse SSE lines into JSON objects
   */
  function parseSSELines(lines: string[]): any[] {
    return lines
      .filter(line => line !== '[DONE]')
      .map(line => {
        try {
          return JSON.parse(line)
        } catch (e) {
          return null
        }
      })
      .filter(obj => obj !== null)
  }
  
  // ============================================================================
  // TEST 1: request_id extraction
  // ============================================================================
  test('extracts request_id from response metadata', async () => {
    const chunk = JSON.stringify({
      result: {
        response: {
          model: "claude-3.5-sonnet",
          choices: [{
            index: 0,
            content: [{
              type: "CONTENT_TYPE_TEXT",
              data: "Response text"
            }],
            finish_reason: "FINISH_REASON_STOP"
          }],
          metadata: {
            request_id: "req_abc123",
            latency_ms: 250
          },
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150
          }
        }
      }
    }) + '\n'
    
    const results = await processStreamChunk(chunk)
    const parsed = parseSSELines(results)
    
    // Find the delta that contains metadata
    const metadataDelta = parsed.find(delta => delta.metadata)
    
    expect(metadataDelta).toBeDefined()
    expect(metadataDelta.metadata.request_id).toBe('req_abc123')
  })
  
  // ============================================================================
  // TEST 2: latency_ms extraction
  // ============================================================================
  test('extracts latency_ms from response metadata', async () => {
    const chunk = JSON.stringify({
      result: {
        response: {
          model: "claude-3.5-sonnet",
          choices: [{
            index: 0,
            content: [{
              type: "CONTENT_TYPE_TEXT",
              data: "Response text"
            }],
            finish_reason: "FINISH_REASON_STOP"
          }],
          metadata: {
            request_id: "req_abc123",
            latency_ms: 250
          }
        }
      }
    }) + '\n'
    
    const results = await processStreamChunk(chunk)
    const parsed = parseSSELines(results)
    
    // Find the delta that contains metadata
    const metadataDelta = parsed.find(delta => delta.metadata)
    
    expect(metadataDelta).toBeDefined()
    expect(metadataDelta.metadata.latency_ms).toBe(250)
  })
  
  // ============================================================================
  // TEST 3: Metadata with finish_reason
  // ============================================================================
  test('includes metadata in delta with finish_reason', async () => {
    const chunk = JSON.stringify({
      result: {
        response: {
          model: "claude-3.5-sonnet",
          choices: [{
            index: 0,
            content: [{
              type: "CONTENT_TYPE_TEXT",
              data: "Response"
            }],
            finish_reason: "FINISH_REASON_STOP"
          }],
          metadata: {
            request_id: "req_xyz789",
            latency_ms: 180
          }
        }
      }
    }) + '\n'
    
    const results = await processStreamChunk(chunk)
    const parsed = parseSSELines(results)
    
    // Should find a delta with both finish_reason and metadata
    const finishDelta = parsed.find(delta => delta.choices?.[0]?.finish_reason === 'stop')
    
    expect(finishDelta).toBeDefined()
    expect(finishDelta.metadata).toBeDefined()
    expect(finishDelta.metadata.request_id).toBe('req_xyz789')
    expect(finishDelta.metadata.latency_ms).toBe(180)
  })
  
  // ============================================================================
  // TEST 4: Metadata with usage data
  // ============================================================================
  test('preserves metadata alongside usage data', async () => {
    const chunk = JSON.stringify({
      result: {
        response: {
          model: "claude-3.5-sonnet",
          choices: [{
            index: 0,
            content: [{
              type: "CONTENT_TYPE_TEXT",
              data: "Response"
            }],
            finish_reason: "FINISH_REASON_STOP"
          }],
          metadata: {
            request_id: "req_usage123",
            latency_ms: 320
          },
          usage: {
            prompt_tokens: 200,
            completion_tokens: 75,
            total_tokens: 275
          }
        }
      }
    }) + '\n'
    
    const results = await processStreamChunk(chunk)
    const parsed = parseSSELines(results)
    
    // Find delta with usage
    const usageDelta = parsed.find(delta => delta.usage)
    
    expect(usageDelta).toBeDefined()
    expect(usageDelta.usage.prompt_tokens).toBe(200)
    expect(usageDelta.usage.completion_tokens).toBe(75)
    
    // Metadata should be present in the same or adjacent delta
    const metadataDelta = parsed.find(delta => delta.metadata)
    expect(metadataDelta).toBeDefined()
    expect(metadataDelta.metadata.request_id).toBe('req_usage123')
    expect(metadataDelta.metadata.latency_ms).toBe(320)
  })
  
  // ============================================================================
  // TEST 5: Missing request_id handled gracefully
  // ============================================================================
  test('handles missing request_id gracefully', async () => {
    const chunk = JSON.stringify({
      result: {
        response: {
          model: "claude-3.5-sonnet",
          choices: [{
            index: 0,
            content: [{
              type: "CONTENT_TYPE_TEXT",
              data: "Response"
            }],
            finish_reason: "FINISH_REASON_STOP"
          }],
          metadata: {
            latency_ms: 150
          }
        }
      }
    }) + '\n'
    
    const results = await processStreamChunk(chunk)
    const parsed = parseSSELines(results)
    
    // Find delta with metadata
    const metadataDelta = parsed.find(delta => delta.metadata)
    
    expect(metadataDelta).toBeDefined()
    expect(metadataDelta.metadata.request_id).toBeUndefined()
    expect(metadataDelta.metadata.latency_ms).toBe(150)
  })
  
  // ============================================================================
  // TEST 6: Missing latency_ms handled gracefully
  // ============================================================================
  test('handles missing latency_ms gracefully', async () => {
    const chunk = JSON.stringify({
      result: {
        response: {
          model: "claude-3.5-sonnet",
          choices: [{
            index: 0,
            content: [{
              type: "CONTENT_TYPE_TEXT",
              data: "Response"
            }],
            finish_reason: "FINISH_REASON_STOP"
          }],
          metadata: {
            request_id: "req_only_id"
          }
        }
      }
    }) + '\n'
    
    const results = await processStreamChunk(chunk)
    const parsed = parseSSELines(results)
    
    // Find delta with metadata
    const metadataDelta = parsed.find(delta => delta.metadata)
    
    expect(metadataDelta).toBeDefined()
    expect(metadataDelta.metadata.request_id).toBe('req_only_id')
    expect(metadataDelta.metadata.latency_ms).toBeUndefined()
  })
  
  // ============================================================================
  // TEST 7: No metadata field at all
  // ============================================================================
  test('handles completely missing metadata field', async () => {
    const chunk = JSON.stringify({
      result: {
        response: {
          model: "claude-3.5-sonnet",
          choices: [{
            index: 0,
            content: [{
              type: "CONTENT_TYPE_TEXT",
              data: "Response"
            }],
            finish_reason: "FINISH_REASON_STOP"
          }]
        }
      }
    }) + '\n'
    
    const results = await processStreamChunk(chunk)
    const parsed = parseSSELines(results)
    
    // Should still process successfully without errors
    expect(parsed.length).toBeGreaterThan(0)
    
    // No delta should have metadata
    const metadataDelta = parsed.find(delta => delta.metadata)
    expect(metadataDelta).toBeUndefined()
  })
  
  // ============================================================================
  // TEST 8: Empty metadata object
  // ============================================================================
  test('handles empty metadata object', async () => {
    const chunk = JSON.stringify({
      result: {
        response: {
          model: "claude-3.5-sonnet",
          choices: [{
            index: 0,
            content: [{
              type: "CONTENT_TYPE_TEXT",
              data: "Response"
            }],
            finish_reason: "FINISH_REASON_STOP"
          }],
          metadata: {}
        }
      }
    }) + '\n'
    
    const results = await processStreamChunk(chunk)
    const parsed = parseSSELines(results)
    
    // Should process without errors
    expect(parsed.length).toBeGreaterThan(0)
  })
})
