
import { createStitchError, type StitchError } from './stitch-error'

/**
 * Validation configuration for Stitch API requests
 */
const VALIDATION_RULES = {
  temperature: { min: 0, max: 2 },
  max_tokens: { min: 1, max: 100000 },
  top_p: { min: 0, max: 1 },
  frequency_penalty: { min: -2, max: 2 },
  presence_penalty: { min: -2, max: 2 }
} as const

/**
 * Validates request parameters before sending to Stitch API
 * @throws StitchError if validation fails
 */
export function validateStitchRequest(request: {
  model?: string
  messages?: any[]
  temperature?: number
  max_tokens?: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  stream?: boolean
  [key: string]: any
}): void {
  const errors: string[] = []
  
  // Validate model is provided
  if (!request.model || typeof request.model !== 'string') {
    errors.push('Model ID is required and must be a string')
  }
  
  // Validate messages array
  if (!request.messages || !Array.isArray(request.messages)) {
    errors.push('Messages must be an array')
  } else if (request.messages.length === 0) {
    errors.push('At least one message is required')
  } else {
    // Validate message format
    request.messages.forEach((msg, idx) => {
      if (!msg.role || typeof msg.role !== 'string') {
        errors.push(`Message ${idx}: role is required and must be a string`)
      }
      if (!msg.content) {
        errors.push(`Message ${idx}: content is required`)
      }
    })
  }
  
  // Validate numeric parameters
  for (const [param, rules] of Object.entries(VALIDATION_RULES)) {
    const value = request[param]
    if (value !== undefined && value !== null) {
      if (typeof value !== 'number') {
        errors.push(`${param} must be a number`)
      } else if (value < rules.min || value > rules.max) {
        errors.push(`${param} must be between ${rules.min} and ${rules.max}`)
      }
    }
  }
  
  // Throw validation error if any issues found
  if (errors.length > 0) {
    throw createStitchError(
      new Error('Request validation failed'),
      400,
      {
        type: 'validation_error',
        validationErrors: errors
      }
    )
  }
}

/**
 * Validates a model ID format
 */
export function validateModelId(modelId: string): boolean {
  if (!modelId || typeof modelId !== 'string') return false
  if (modelId.trim().length === 0) return false
  // Add any specific Stitch model ID format rules here
  return true
}
