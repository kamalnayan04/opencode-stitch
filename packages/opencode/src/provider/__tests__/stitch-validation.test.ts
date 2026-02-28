
import { describe, test, expect } from 'bun:test'
import { validateStitchRequest, validateModelId } from '../stitch-validation'
import { STITCH_ERROR_CODES } from '../stitch-error'

describe('Stitch Request Validation', () => {
  test('rejects request without model', () => {
    expect(() => {
      validateStitchRequest({
        messages: [{ role: 'user', content: 'test' }]
      })
    }).toThrow()
  })

  test('rejects request without messages', () => {
    expect(() => {
      validateStitchRequest({
        model: 'gpt-4'
      })
    }).toThrow()
  })

  test('rejects empty messages array', () => {
    expect(() => {
      validateStitchRequest({
        model: 'gpt-4',
        messages: []
      })
    }).toThrow()
  })

  test('rejects messages with missing role', () => {
    try {
      validateStitchRequest({
        model: 'gpt-4',
        messages: [{ content: 'test' }]
      })
      expect(true).toBe(false) // Should not reach here
    } catch (error: any) {
      expect(error.details?.validationErrors).toBeDefined()
      expect(error.details.validationErrors.some((e: string) => e.includes('role'))).toBe(true)
    }
  })

  test('rejects messages with missing content', () => {
    try {
      validateStitchRequest({
        model: 'gpt-4',
        messages: [{ role: 'user' }]
      })
      expect(true).toBe(false) // Should not reach here
    } catch (error: any) {
      expect(error.details?.validationErrors).toBeDefined()
      expect(error.details.validationErrors.some((e: string) => e.includes('content'))).toBe(true)
    }
  })

  test('rejects invalid temperature range (too low)', () => {
    try {
      validateStitchRequest({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        temperature: -1
      })
      expect(true).toBe(false) // Should not reach here
    } catch (error: any) {
      expect(error.details?.validationErrors).toBeDefined()
      expect(error.details.validationErrors.some((e: string) => e.includes('temperature'))).toBe(true)
    }
  })

  test('rejects invalid temperature range (too high)', () => {
    try {
      validateStitchRequest({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 3
      })
      expect(true).toBe(false) // Should not reach here
    } catch (error: any) {
      expect(error.details?.validationErrors).toBeDefined()
      expect(error.details.validationErrors.some((e: string) => e.includes('temperature'))).toBe(true)
    }
  })

  test('rejects invalid max_tokens range', () => {
    try {
      validateStitchRequest({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 0
      })
      expect(true).toBe(false) // Should not reach here
    } catch (error: any) {
      expect(error.details?.validationErrors).toBeDefined()
      expect(error.details.validationErrors.some((e: string) => e.includes('max_tokens'))).toBe(true)
    }
  })

  test('rejects invalid top_p range', () => {
    try {
      validateStitchRequest({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        top_p: 1.5
      })
      expect(true).toBe(false) // Should not reach here
    } catch (error: any) {
      expect(error.details?.validationErrors).toBeDefined()
      expect(error.details.validationErrors.some((e: string) => e.includes('top_p'))).toBe(true)
    }
  })

  test('rejects invalid frequency_penalty range', () => {
    try {
      validateStitchRequest({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        frequency_penalty: -3
      })
      expect(true).toBe(false) // Should not reach here
    } catch (error: any) {
      expect(error.details?.validationErrors).toBeDefined()
      expect(error.details.validationErrors.some((e: string) => e.includes('frequency_penalty'))).toBe(true)
    }
  })

  test('rejects invalid presence_penalty range', () => {
    try {
      validateStitchRequest({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        presence_penalty: 3
      })
      expect(true).toBe(false) // Should not reach here
    } catch (error: any) {
      expect(error.details?.validationErrors).toBeDefined()
      expect(error.details.validationErrors.some((e: string) => e.includes('presence_penalty'))).toBe(true)
    }
  })

  test('rejects non-numeric temperature', () => {
    try {
      validateStitchRequest({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }],
        temperature: '1.5' as any
      })
      expect(true).toBe(false) // Should not reach here
    } catch (error: any) {
      expect(error.details?.validationErrors).toBeDefined()
      expect(error.details.validationErrors.some((e: string) => e.includes('temperature'))).toBe(true)
    }
  })

  test('validates correct request passes', () => {
    expect(() => {
      validateStitchRequest({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' }
        ],
        temperature: 1.0,
        max_tokens: 1000,
        top_p: 0.9,
        frequency_penalty: 0.5,
        presence_penalty: 0.5
      })
    }).not.toThrow()
  })

  test('validates request with minimal fields passes', () => {
    expect(() => {
      validateStitchRequest({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'test' }]
      })
    }).not.toThrow()
  })

  test('provides helpful validation error messages', () => {
    try {
      validateStitchRequest({
        messages: []
      })
    } catch (error: any) {
      expect(error.details?.validationErrors).toBeDefined()
      expect(error.details.validationErrors).toContain('Model ID is required and must be a string')
      expect(error.details.validationErrors).toContain('At least one message is required')
    }
  })

  test('lists all validation errors at once', () => {
    try {
      validateStitchRequest({
        temperature: 5,
        max_tokens: 0,
        top_p: 2
      })
    } catch (error: any) {
      expect(error.details?.validationErrors).toBeDefined()
      expect(error.details.validationErrors.length).toBeGreaterThan(3)
    }
  })
})

describe('Model ID Validation', () => {
  test('accepts valid model ID', () => {
    expect(validateModelId('gpt-4')).toBe(true)
    expect(validateModelId('claude-3-opus')).toBe(true)
  })

  test('rejects empty string', () => {
    expect(validateModelId('')).toBe(false)
  })

  test('rejects whitespace only', () => {
    expect(validateModelId('   ')).toBe(false)
  })

  test('rejects null/undefined', () => {
    expect(validateModelId(null as any)).toBe(false)
    expect(validateModelId(undefined as any)).toBe(false)
  })

  test('rejects non-string', () => {
    expect(validateModelId(123 as any)).toBe(false)
    expect(validateModelId({} as any)).toBe(false)
  })
})

describe('Stitch Error Code Mapping', () => {
  test('CONTEXT_LENGTH_EXCEEDED has message and suggestion', () => {
    const error = STITCH_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED
    expect(error.message).toContain('too long')
    expect(error.suggestion).toContain('reducing')
  })

  test('MODEL_NOT_FOUND has message and suggestion', () => {
    const error = STITCH_ERROR_CODES.MODEL_NOT_FOUND
    expect(error.message).toContain('does not exist')
    expect(error.suggestion).toContain('Verify')
  })

  test('REASONING_BUDGET_EXCEEDED has message and suggestion', () => {
    const error = STITCH_ERROR_CODES.REASONING_BUDGET_EXCEEDED
    expect(error.message).toContain('reasoning token budget')
    expect(error.suggestion).toContain('complexity')
  })

  test('INVALID_PARAMETER has message and suggestion', () => {
    const error = STITCH_ERROR_CODES.INVALID_PARAMETER
    expect(error.message).toContain('invalid')
    expect(error.suggestion).toContain('parameter')
  })

  test('UNSUPPORTED_FEATURE has message and suggestion', () => {
    const error = STITCH_ERROR_CODES.UNSUPPORTED_FEATURE
    expect(error.message).toContain('not supported')
    expect(error.suggestion).toContain('documentation')
  })

  test('all error codes have non-empty messages', () => {
    Object.values(STITCH_ERROR_CODES).forEach(error => {
      expect(error.message.length).toBeGreaterThan(0)
      expect(error.suggestion.length).toBeGreaterThan(0)
    })
  })
})
