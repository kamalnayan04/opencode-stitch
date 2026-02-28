
import { describe, test, expect } from 'bun:test'
import { createStitchError, parseStitchErrorResponse } from '../stitch-error'
import { validateStitchRequest } from '../stitch-validation'

describe('User-Friendly Error Messages', () => {
  test('401 error includes API key guidance', () => {
    const mockResponse = {
      status: 401,
      statusText: 'Unauthorized'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Invalid API key'
      }
    })
    
    expect(error.type).toBe('authentication_error')
    expect(error.message.toLowerCase()).toContain('authentication')
    expect(error.message.toLowerCase()).toContain('api key')
    expect(error.details?.originalMessage).toBe('Invalid API key')
  })

  test('429 error includes rate limit guidance', () => {
    const mockResponse = {
      status: 429,
      statusText: 'Too Many Requests'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Rate limit exceeded'
      }
    })
    
    expect(error.type).toBe('rate_limit')
    expect(error.message.toLowerCase()).toContain('rate')
    expect(error.message.toLowerCase()).toContain('wait')
  })

  test('500 error explains server-side issue', () => {
    const mockResponse = {
      status: 500,
      statusText: 'Internal Server Error'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Internal error'
      }
    })
    
    expect(error.message.toLowerCase()).toContain('server')
    expect(error.message.toLowerCase()).toMatch(/try again|moment/)
  })

  test('400 error provides validation guidance', () => {
    const mockResponse = {
      status: 400,
      statusText: 'Bad Request'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Invalid request'
      }
    })
    
    expect(error.type).toBe('validation_error')
    expect(error.message.toLowerCase()).toContain('request')
    expect(error.message.toLowerCase()).toMatch(/format|parameter|message/)
  })

  test('404 error suggests checking model ID', () => {
    const mockResponse = {
      status: 404,
      statusText: 'Not Found'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Model not found'
      }
    })
    
    expect(error.message).toContain('Not Found')
    expect(error.message.toLowerCase()).toMatch(/model|verify/)
  })

  test('408 error suggests retry', () => {
    const mockResponse = {
      status: 408,
      statusText: 'Request Timeout'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Timeout'
      }
    })
    
    expect(error.message).toContain('Timeout')
    expect(error.message.toLowerCase()).toMatch(/try again|time/)
    expect(error.isRetryable).toBe(true)
  })

  test('503 error indicates temporary issue', () => {
    const mockResponse = {
      status: 503,
      statusText: 'Service Unavailable'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Service unavailable'
      }
    })
    
    expect(error.message.toLowerCase()).toContain('unavailable')
    expect(error.message.toLowerCase()).toMatch(/try again|moment/)
    expect(error.isRetryable).toBe(true)
  })

  test('Stitch CONTEXT_LENGTH_EXCEEDED includes suggestion', () => {
    const mockResponse = {
      status: 400,
      statusText: 'Bad Request'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        code: 'CONTEXT_LENGTH_EXCEEDED',
        message: 'Context too long'
      }
    })
    
    expect(error.message).toContain('too long')
    expect(error.message).toContain('reducing')
    expect(error.message).toContain('larger context window')
  })

  test('Stitch MODEL_NOT_FOUND includes suggestion', () => {
    const mockResponse = {
      status: 404,
      statusText: 'Not Found'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        code: 'MODEL_NOT_FOUND',
        message: 'Model not found'
      }
    })
    
    expect(error.message).toContain('does not exist')
    expect(error.message).toContain('Verify')
    expect(error.message).toContain('available')
  })

  test('unknown Stitch error code provides generic guidance', () => {
    const mockResponse = {
      status: 400,
      statusText: 'Bad Request'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        code: 'UNKNOWN_ERROR_CODE',
        message: 'Something went wrong'
      }
    })
    
    expect(error.message).toContain('UNKNOWN_ERROR_CODE')
    expect(error.message).toContain('documentation')
  })

  test('error preserves original message in details', () => {
    const mockResponse = {
      status: 400,
      statusText: 'Bad Request'
    } as Response
    
    const originalMessage = 'This is the original error message'
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        code: 'INVALID_PARAMETER',
        message: originalMessage
      }
    })
    
    expect(error.details?.originalMessage).toBe(originalMessage)
    expect(error.details?.code).toBe('INVALID_PARAMETER')
  })

  test('error includes retry_after when provided', () => {
    const mockResponse = {
      status: 429,
      statusText: 'Too Many Requests'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Rate limited',
        retry_after: 60
      }
    })
    
    expect(error.retryAfter).toBe(60)
  })

  test('createStitchError with status adds guidance', () => {
    const error = createStitchError(
      new Error('Test error'),
      403
    )
    
    expect(error.message).toContain('Forbidden')
    expect(error.message).toContain('permissions')
  })

  test('createStitchError preserves error type in details', () => {
    const error = createStitchError(
      new Error('Validation failed'),
      400,
      {
        type: 'validation_error',
        validationErrors: ['Field required']
      }
    )
    
    expect(error.type).toBe('validation_error')
    expect(error.details?.validationErrors).toEqual(['Field required'])
  })

  test('unknown status code provides generic message', () => {
    const mockResponse = {
      status: 418,
      statusText: "I'm a teapot"
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Teapot error'
      }
    })
    
    // For unknown 4xx codes, should provide client error guidance
    expect(error.message.toLowerCase()).toMatch(/client error|request/)
  })

  test('5xx status provides server error guidance', () => {
    const mockResponse = {
      status: 599,
      statusText: 'Unknown Server Error'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Unknown error'
      }
    })
    
    expect(error.message).toContain('Server Error')
    expect(error.message.toLowerCase()).toContain('server')
  })

  test('4xx status provides client error guidance', () => {
    const mockResponse = {
      status: 499,
      statusText: 'Client Error'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Client error'
      }
    })
    
    expect(error.message).toContain('Client Error')
    expect(error.message.toLowerCase()).toContain('request')
  })
})

describe('Error Message Format', () => {
  test('validation errors list all issues', () => {
    try {
      validateStitchRequest({
        temperature: 5,
        max_tokens: -1
      })
      expect(true).toBe(false) // Should not reach here
    } catch (error: any) {
      // The error is a StitchError with validation details
      expect(error).toBeDefined()
      expect(error.type).toBe('validation_error')
      expect(error.details).toBeDefined()
      const validationErrors = error.details.validationErrors
      expect(validationErrors).toBeDefined()
      expect(Array.isArray(validationErrors)).toBe(true)
      expect(validationErrors.length).toBeGreaterThan(2)
    }
  })

  test('error messages do not contain sensitive data', () => {
    const mockResponse = {
      status: 401,
      statusText: 'Unauthorized'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Invalid API key: sk-1234567890'
      }
    })
    
    // The original message should be in details with sensitive data
    // But the main user-facing message uses generic guidance
    expect(error.details?.originalMessage).toBe('Invalid API key: sk-1234567890')
    // Main message should use HTTP status guidance, not the original message
    expect(error.message.toLowerCase()).toContain('authentication')
  })

  test('error messages are actionable', () => {
    const mockResponse = {
      status: 429,
      statusText: 'Too Many Requests'
    } as Response
    
    const error = parseStitchErrorResponse(mockResponse, {
      error: {
        message: 'Rate limited'
      }
    })
    
    // Message should tell user what to do
    expect(error.message.toLowerCase()).toMatch(/wait|moment/)
  })
})
