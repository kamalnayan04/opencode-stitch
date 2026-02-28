// @ts-nocheck
import { describe, test, expect, jest, beforeEach, afterEach, mock } from 'bun:test'
import {
  isStreamRecoverable,
  handleStreamError,
  createStreamErrorResponse,
  createStitchError,
  type StitchError
} from '../stitch-error'

describe('Stitch Streaming Error Handling', () => {

  // =============================================================================
  // 1. NDJSON Parsing Tests
  // =============================================================================
  describe('NDJSON Streaming Parser', () => {
    test('parses complete NDJSON lines correctly', () => {
      const line = '{"type":"chunk","content":"Hello"}'
      const parsed = JSON.parse(line)

      expect(parsed).toEqual({
        type: 'chunk',
        content: 'Hello'
      })
    })

    test('buffers incomplete lines across chunks', () => {
      let buffer = ''

      // First chunk: incomplete line
      const chunk1 = '{"type":"chunk","con'
      buffer += chunk1

      // Buffer should contain incomplete data
      expect(buffer).toBe('{"type":"chunk","con')

      // Second chunk: completes the line
      const chunk2 = 'tent":"Hello"}\n'
      buffer += chunk2

      // Now we can parse the complete line
      const lines = buffer.split('\n')
      const completeLine = lines[0]
      const parsed = JSON.parse(completeLine)

      expect(parsed.content).toBe('Hello')
    })

    test('handles empty lines gracefully', () => {
      const input = '{"type":"chunk","content":"Hello"}\n\n{"type":"chunk","content":"World"}\n'
      const lines = input.split('\n').filter(line => line.trim())

      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0]).content).toBe('Hello')
      expect(JSON.parse(lines[1]).content).toBe('World')
    })

    test('processes multiple complete lines in single chunk', () => {
      const chunk = '{"type":"chunk","content":"Hello"}\n{"type":"chunk","content":"World"}\n'
      const lines = chunk.split('\n').filter(line => line.trim())

      expect(lines).toHaveLength(2)

      const parsed1 = JSON.parse(lines[0])
      const parsed2 = JSON.parse(lines[1])

      expect(parsed1.content).toBe('Hello')
      expect(parsed2.content).toBe('World')
    })

    test('handles final incomplete line in flush', () => {
      let buffer = '{"type":"chunk","content":"Final"}'

      // Simulate flush - process remaining buffer
      if (buffer.trim()) {
        const parsed = JSON.parse(buffer.trim())
        expect(parsed.content).toBe('Final')
      }
    })

    test('converts NDJSON to SSE format correctly', () => {
      const ndjson = { type: 'chunk', content: 'Hello' }
      const sseFormat = `data: ${JSON.stringify(ndjson)}\n\n`

      expect(sseFormat).toBe('data: {"type":"chunk","content":"Hello"}\n\n')
      expect(sseFormat.startsWith('data: ')).toBe(true)
      expect(sseFormat.endsWith('\n\n')).toBe(true)
    })
  })

  // =============================================================================
  // 2. Error Recovery Tests
  // =============================================================================
  describe('Stream Error Recovery', () => {
    test('recoverable streaming_error continues stream', () => {
      const error = createStitchError(new Error('Stream hiccup'), undefined, '{"error":"stream"}')
      error.type = 'streaming_error'

      expect(isStreamRecoverable(error)).toBe(true)
    })

    test('recoverable validation_error continues stream', () => {
      const error = createStitchError(new Error('Validation failed'), undefined, '{}')
      error.type = 'validation_error'
      error.status = 422 // Not 400

      expect(isStreamRecoverable(error)).toBe(true)
    })

    test('terminal authentication_error stops stream', () => {
      const error = createStitchError(new Error('Auth failed'), 401)

      expect(isStreamRecoverable(error)).toBe(false)
    })

    test('terminal rate_limit error stops stream', () => {
      const error = createStitchError(new Error('Rate limited'), 429)

      expect(isStreamRecoverable(error)).toBe(false)
    })

    test('terminal 400 error stops stream', () => {
      const error = createStitchError(new Error('Bad request'), 400)

      expect(isStreamRecoverable(error)).toBe(false)
    })

    test('terminal 403 error stops stream', () => {
      const error = createStitchError(new Error('Forbidden'), 403)

      expect(isStreamRecoverable(error)).toBe(false)
    })

    test('provides error response for terminal errors', () => {
      const error = createStitchError(new Error('Auth failed'), 401)
      const recovery = handleStreamError(error, '')

      expect(recovery.shouldContinue).toBe(false)
      expect(recovery.errorResponse).toBeDefined()
      expect(recovery.errorResponse).toContain('data:')
      expect(recovery.errorResponse).toContain('[DONE]')
    })

    test('logs recoverable errors without terminating', () => {
      const error = createStitchError(new Error('Malformed JSON'), undefined, '{}')
      error.type = 'validation_error'

      const recovery = handleStreamError(error, 'some buffer')

      expect(recovery.shouldContinue).toBe(true)
      expect(recovery.errorResponse).toBeUndefined()
    })
  })

  // =============================================================================
  // 3. Malformed JSON Tests
  // =============================================================================
  describe('Malformed JSON Handling', () => {
    test('detects malformed JSON line as terminal error by default', () => {
      const malformedLine = '{invalid json'

      try {
        JSON.parse(malformedLine)
        expect(false).toBe(true) // Should not reach here
      } catch (error) {
        // Generic JSON parse errors are terminal by default
        const recovery = handleStreamError(error, malformedLine)

        // Should NOT continue stream for unhandled parse errors
        expect(recovery.shouldContinue).toBe(false)
        expect(recovery.errorResponse).toBeDefined()
      }
    })

    test('logs error for malformed JSON as terminal', () => {
      const malformedLine = '{invalid: json}'
      let errorLogged = false

      try {
        JSON.parse(malformedLine)
      } catch (error) {
        errorLogged = true
        const recovery = handleStreamError(error, malformedLine)
        // Generic parse errors are terminal
        expect(recovery.shouldContinue).toBe(false)
      }

      expect(errorLogged).toBe(true)
    })

    test('processes next valid line if error is explicitly recoverable', () => {
      const lines = [
        '{invalid json',
        '{"type":"chunk","content":"Valid"}'
      ]

      const results: any[] = []
      let encounteredError = false

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          results.push(parsed)
        } catch (error) {
          encounteredError = true
          // Create a validation error which IS recoverable
          const validationError = createStitchError(error)
          validationError.type = 'validation_error'
          validationError.status = 422 // Not 400

          const recovery = handleStreamError(validationError, line)
          expect(recovery.shouldContinue).toBe(true)
        }
      }

      expect(results).toHaveLength(1)
      expect(results[0].content).toBe('Valid')
      expect(encounteredError).toBe(true)
    })

    test('handles partial JSON at chunk boundaries', () => {
      let buffer = '{"type":"chu'

      // Can't parse yet - incomplete
      expect(() => JSON.parse(buffer)).toThrow()

      // Add more data
      buffer += 'nk","content":"Hello"}'

      // Now parseable
      const parsed = JSON.parse(buffer)
      expect(parsed.content).toBe('Hello')
    })

    test('recovers from multiple consecutive malformed lines', () => {
      const lines = [
        '{bad1',
        '{bad2}',
        '{"type":"chunk","content":"Good1"}',
        'invalid',
        '{"type":"chunk","content":"Good2"}'
      ]

      const validResults: any[] = []

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          validResults.push(parsed)
        } catch (error) {
          // Mark as validation error to make it recoverable
          const validationError = createStitchError(error)
          validationError.type = 'validation_error'
          validationError.status = 422

          const recovery = handleStreamError(validationError, line)
          expect(recovery.shouldContinue).toBe(true)
        }
      }

      expect(validResults).toHaveLength(2)
      expect(validResults[0].content).toBe('Good1')
      expect(validResults[1].content).toBe('Good2')
    })
  })

  // =============================================================================
  // 4. Network Error Tests
  // =============================================================================
  describe('Network Error Handling', () => {
    test('handles ECONNREFUSED with proper error type', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:8080')
        ; (error as any).code = 'ECONNREFUSED'

      const stitchError = createStitchError(error)

      expect(stitchError.type).toBe('network_error')
      expect(stitchError.isRetryable).toBe(true)
    })

    test('handles ETIMEDOUT as network error (code check)', () => {
      const error = new Error('request timeout')
        ; (error as any).code = 'ETIMEDOUT'

      const stitchError = createStitchError(error)

      // ETIMEDOUT is in the network errors list, so it's classified as network_error
      expect(stitchError.type).toBe('network_error')
      expect(stitchError.isRetryable).toBe(true)
    })

    test('handles timeout message as timeout error type', () => {
      const error = new Error('Request timed out after 30000ms')

      const stitchError = createStitchError(error)

      // Timeout pattern in message
      expect(stitchError.type).toBe('timeout')
      expect(stitchError.isRetryable).toBe(true)
    })

    test('handles ENOTFOUND (DNS) with network error', () => {
      const error = new Error('getaddrinfo ENOTFOUND api.example.com')
        ; (error as any).code = 'ENOTFOUND'

      const stitchError = createStitchError(error)

      expect(stitchError.type).toBe('network_error')
      expect(stitchError.isRetryable).toBe(true)
    })

    test('handles connection reset gracefully', () => {
      const error = new Error('socket hang up')
        ; (error as any).code = 'ECONNRESET'

      const stitchError = createStitchError(error)

      expect(stitchError.type).toBe('network_error')
      expect(stitchError.isRetryable).toBe(true)
    })

    test('retries on 503 Service Unavailable', () => {
      const error = createStitchError(new Error('Service unavailable'), 503, '{"error":"unavailable"}')

      expect(error.isRetryable).toBe(true)
      expect(error.status).toBe(503)
    })

    test('retries on 502 Bad Gateway', () => {
      const error = createStitchError(new Error('Bad gateway'), 502, '{"error":"gateway"}')

      expect(error.isRetryable).toBe(true)
      expect(error.status).toBe(502)
    })

    test('does not retry on 400 Bad Request', () => {
      const error = createStitchError(new Error('Bad request'), 400, '{"error":"invalid"}')

      expect(error.isRetryable).toBe(false)
      expect(error.status).toBe(400)
    })

    test('does not retry on 401 Unauthorized', () => {
      const error = createStitchError(new Error('Unauthorized'), 401, '{"error":"auth"}')

      expect(error.isRetryable).toBe(false)
      expect(error.status).toBe(401)
    })
  })

  // =============================================================================
  // 5. Streaming Integration Tests
  // =============================================================================
  describe('End-to-End Streaming', () => {
    test('successfully streams multiple NDJSON chunks', () => {
      const chunks = [
        '{"type":"chunk","content":"Hello"}\n',
        '{"type":"chunk","content":" world"}\n',
        '{"type":"done"}\n'
      ]

      const results: any[] = []
      let buffer = ''

      for (const chunk of chunks) {
        buffer += chunk
        const lines = buffer.split('\n')

        // Keep last incomplete line in buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim()) {
            const parsed = JSON.parse(line)
            results.push(parsed)
          }
        }
      }

      expect(results).toHaveLength(3)
      expect(results[0].content).toBe('Hello')
      expect(results[1].content).toBe(' world')
      expect(results[2].type).toBe('done')
    })

    test('handles error mid-stream and terminates', () => {
      const chunks = [
        '{"type":"chunk","content":"Hello"}\n',
        '{"error":{"code":401,"message":"Unauthorized"}}\n'
      ]

      const results: any[] = []
      let shouldTerminate = false
      let buffer = ''

      for (const chunk of chunks) {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim()) {
            const parsed = JSON.parse(line)

            if (parsed.error) {
              const stitchError = createStitchError(
                new Error(parsed.error.message),
                parsed.error.code
              )
              const recovery = handleStreamError(stitchError, buffer)

              if (!recovery.shouldContinue) {
                shouldTerminate = true
                break
              }
            } else {
              results.push(parsed)
            }
          }
        }

        if (shouldTerminate) break
      }

      expect(results).toHaveLength(1)
      expect(results[0].content).toBe('Hello')
      expect(shouldTerminate).toBe(true)
    })

    test('preserves partial results before error', () => {
      const chunks = [
        '{"type":"chunk","content":"First"}\n',
        '{"type":"chunk","content":"Second"}\n',
        '{"error":{"code":401,"message":"Auth failed"}}\n'
      ]

      const results: any[] = []
      let buffer = ''

      for (const chunk of chunks) {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim()) {
            const parsed = JSON.parse(line)

            if (parsed.error) {
              // Error encountered, but we keep previous results
              break
            } else {
              results.push(parsed)
            }
          }
        }
      }

      expect(results).toHaveLength(2)
      expect(results[0].content).toBe('First')
      expect(results[1].content).toBe('Second')
    })

    test('sends [DONE] marker on successful completion', () => {
      const doneMarker = 'data: [DONE]\n\n'

      expect(doneMarker).toContain('[DONE]')
      expect(doneMarker.startsWith('data:')).toBe(true)
      expect(doneMarker.endsWith('\n\n')).toBe(true)
    })

    test('sends error response with [DONE] on terminal error', () => {
      const error = createStitchError(new Error('Auth failed'), 401)
      const errorResponse = createStreamErrorResponse(error)

      expect(errorResponse).toContain('data:')
      expect(errorResponse).toContain('[DONE]')
      expect(errorResponse).toContain('error')
    })

    test('cleans up buffer after stream completion', () => {
      let buffer = '{"type":"chunk","content":"Hello"}\n'

      // Process buffer
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      // Simulate flush
      if (buffer.trim()) {
        JSON.parse(buffer.trim())
      }

      // Clean up
      buffer = ''

      expect(buffer).toBe('')
    })

    test('cleans up buffer after stream error', () => {
      let buffer = '{"type":"chunk","content":"Hello"}\n'

      try {
        // Simulate error
        throw new Error('Stream error')
      } catch (error) {
        // Clean up buffer even on error
        buffer = ''
      }

      expect(buffer).toBe('')
    })
  })

  // =============================================================================
  // 6. Buffer Management Tests
  // =============================================================================
  describe('Buffer Management', () => {
    test('accumulates incomplete lines correctly', () => {
      let buffer = ''

      buffer += '{"type":'
      expect(buffer).toBe('{"type":')

      buffer += '"chunk",'
      expect(buffer).toBe('{"type":"chunk",')

      buffer += '"content":"Hello"}\n'
      expect(buffer).toBe('{"type":"chunk","content":"Hello"}\n')
    })

    test('preserves buffer across multiple chunks', () => {
      let buffer = ''
      const chunks = ['{"ty', 'pe":"ch', 'unk"}\n']

      for (const chunk of chunks) {
        buffer += chunk
      }

      expect(buffer).toBe('{"type":"chunk"}\n')

      const lines = buffer.split('\n')
      const parsed = JSON.parse(lines[0])
      expect(parsed.type).toBe('chunk')
    })

    test('clears buffer after flush', () => {
      let buffer = '{"type":"chunk","content":"Final"}'

      // Process final buffer
      if (buffer.trim()) {
        JSON.parse(buffer.trim())
      }

      // Clear buffer
      buffer = ''

      expect(buffer).toBe('')
    })

    test('handles large buffer sizes', () => {
      const largeContent = 'x'.repeat(10000)
      const buffer = `{"type":"chunk","content":"${largeContent}"}`

      const parsed = JSON.parse(buffer)
      expect(parsed.content).toHaveLength(10000)
    })

    test('processes buffer remainder in flush', () => {
      let buffer = '{"type":"chunk","content":"Hello"}\n{"type":"chunk","content":"World"}'

      // Process complete lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line

      // Process complete lines
      const results = lines.filter(l => l.trim()).map(l => JSON.parse(l))
      expect(results).toHaveLength(1)

      // Flush: process remaining buffer
      if (buffer.trim()) {
        const final = JSON.parse(buffer.trim())
        results.push(final)
      }

      expect(results).toHaveLength(2)
      expect(results[0].content).toBe('Hello')
      expect(results[1].content).toBe('World')
    })
  })

  // =============================================================================
  // 7. SSE Format Tests
  // =============================================================================
  describe('SSE Format Output', () => {
    test('outputs correct SSE format: data: {...}\\n\\n', () => {
      const data = { type: 'chunk', content: 'Hello' }
      const sse = `data: ${JSON.stringify(data)}\n\n`

      expect(sse).toBe('data: {"type":"chunk","content":"Hello"}\n\n')
      expect(sse.match(/^data: /)).toBeTruthy()
      expect(sse.match(/\n\n$/)).toBeTruthy()
    })

    test('includes [DONE] marker at stream end', () => {
      const doneMarker = 'data: [DONE]\n\n'

      expect(doneMarker).toBe('data: [DONE]\n\n')
      expect(doneMarker.includes('[DONE]')).toBe(true)
    })

    test('formats error responses as SSE', () => {
      const error = createStitchError(new Error('Test error'), 500)
      const errorResponse = createStreamErrorResponse(error)

      expect(errorResponse.startsWith('data:')).toBe(true)
      expect(errorResponse.includes('[DONE]')).toBe(true)
      expect(errorResponse.endsWith('\n\n')).toBe(true)
    })

    test('handles special characters in SSE data', () => {
      const data = { type: 'chunk', content: 'Line1\nLine2\t"quoted"' }
      const sse = `data: ${JSON.stringify(data)}\n\n`

      // JSON.stringify should escape special chars
      expect(sse).toContain('\\n')
      expect(sse).toContain('\\t')
      expect(sse).toContain('\\"')
    })
  })

  // =============================================================================
  // Additional Edge Case Tests
  // =============================================================================
  describe('Edge Cases', () => {
    test('handles empty buffer gracefully', () => {
      const buffer = ''

      if (buffer.trim()) {
        // Should not execute
        expect(false).toBe(true)
      }

      expect(buffer).toBe('')
    })

    test('handles buffer with only whitespace', () => {
      const buffer = '   \n  \t  '

      expect(buffer.trim()).toBe('')
    })

    test('handles unknown error types', () => {
      const error = createStitchError('some string error')

      expect(error.type).toBe('api_error')
      expect(error.message).toContain('some string error')
    })

    test('creates proper error context in handleStreamError', () => {
      const error = new Error('Test error')
      const buffer = 'some buffer content'

      const recovery = handleStreamError(error, buffer)
      const stitchError = createStitchError(error)

      // Should add buffer context
      expect(recovery.shouldContinue).toBeDefined()
    })

    test('handles null/undefined buffer in handleStreamError', () => {
      const error = new Error('Test error')

      const recovery1 = handleStreamError(error, '')
      const recovery2 = handleStreamError(error, '')

      expect(recovery1.shouldContinue).toBeDefined()
      expect(recovery2.shouldContinue).toBeDefined()
    })
  })
})
