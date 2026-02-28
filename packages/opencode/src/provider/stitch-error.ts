
/**
 * Comprehensive error handling for Stitch AI Gateway provider
 * 
 * This module implements:
 * - Network error handling (connection failures, timeouts, DNS, SSL)
 * - API error mapping (all HTTP status codes)
 * - Retry logic with exponential backoff
 * - Streaming error recovery
 * - Standardized error response format
 * 
 * Reference: opencode/docs/plans/2026-02-25-opencode-stitch-integration-design.md
 * Sections 2.5, 7.4, 8, 10.5
 */

import { Log } from "../util/log"

const log = Log.create({ service: "stitch-error" })

/**
 * Standardized error types for Stitch provider
 */
export type StitchErrorType =
  | 'network_error'
  | 'timeout'
  | 'api_error'
  | 'validation_error'
  | 'streaming_error'
  | 'authentication_error'
  | 'rate_limit'

/**
 * Stitch-specific error codes that may be returned in the error.code field
 */
export const STITCH_ERROR_CODES = {
  INVALID_REQUEST: {
    message: 'The request format is invalid',
    suggestion: 'Check your message format and ensure all required fields are present'
  },
  MODEL_NOT_FOUND: {
    message: 'The specified model does not exist',
    suggestion: 'Verify the model ID is correct and the model is available'
  },
  CONTEXT_LENGTH_EXCEEDED: {
    message: 'The prompt is too long for this model',
    suggestion: 'Try reducing the message length or using a model with a larger context window'
  },
  REASONING_BUDGET_EXCEEDED: {
    message: 'The reasoning token budget has been exceeded',
    suggestion: 'Reduce the complexity of the task or use a model with higher reasoning capacity'
  },
  INVALID_PARAMETER: {
    message: 'One or more request parameters are invalid',
    suggestion: 'Check parameter values are within acceptable ranges'
  },
  UNSUPPORTED_FEATURE: {
    message: 'The requested feature is not supported by this model',
    suggestion: 'Check the model documentation for supported features'
  }
} as const

/**
 * Maps Stitch error codes to user-friendly messages
 */
function mapStitchErrorCode(code?: string): { message: string; suggestion: string } | undefined {
  if (!code) return undefined
  
  const errorInfo = STITCH_ERROR_CODES[code as keyof typeof STITCH_ERROR_CODES]
  if (errorInfo) return errorInfo
  
  // Return generic message for unknown codes
  return {
    message: `API error: ${code}`,
    suggestion: 'Check the API documentation for details about this error'
  }
}

/**
 * User-friendly error messages with actionable suggestions for HTTP status codes
 */
const HTTP_STATUS_GUIDANCE = {
  400: {
    message: 'Bad Request - The request was invalid or malformed',
    suggestion: 'Check your message format and parameter values. See validation errors for details.'
  },
  401: {
    message: 'Unauthorized - Authentication failed',
    suggestion: 'Verify your API key is correct and has not expired. You can update it in OpenCode settings.'
  },
  403: {
    message: 'Forbidden - Insufficient permissions',
    suggestion: 'Your API key does not have access to this resource. Check your account permissions.'
  },
  404: {
    message: 'Not Found - The requested endpoint or model does not exist',
    suggestion: 'Verify the model ID is correct. Use the model selector to see available models.'
  },
  408: {
    message: 'Request Timeout - The request took too long',
    suggestion: 'The server did not respond in time. Try again or reduce the request complexity.'
  },
  413: {
    message: 'Payload Too Large - Request body is too large',
    suggestion: 'Reduce the message length or number of messages in your request.'
  },
  429: {
    message: 'Rate Limited - Too many requests',
    suggestion: 'You have exceeded the rate limit. Wait a moment before trying again.'
  },
  500: {
    message: 'Internal Server Error - The server encountered an error',
    suggestion: 'This is a server-side issue. Try again in a moment. If it persists, contact support.'
  },
  502: {
    message: 'Bad Gateway - Invalid response from upstream server',
    suggestion: 'The API gateway encountered an error. Try again in a moment.'
  },
  503: {
    message: 'Service Unavailable - The service is temporarily unavailable',
    suggestion: 'The API is temporarily down. Try again in a few moments.'
  },
  504: {
    message: 'Gateway Timeout - The gateway did not receive a response in time',
    suggestion: 'The request timed out. Try again or reduce the request size.'
  }
} as const

/**
 * Gets user-friendly error message and suggestion for HTTP status code
 */
function getStatusGuidance(status: number): { message: string; suggestion: string } {
  const guidance = HTTP_STATUS_GUIDANCE[status as keyof typeof HTTP_STATUS_GUIDANCE]
  if (guidance) return guidance
  
  // Default messages for unknown status codes
  if (status >= 500) {
    return {
      message: `Server Error (${status})`,
      suggestion: 'This is a server-side issue. Try again later.'
    }
  } else if (status >= 400) {
    return {
      message: `Client Error (${status})`,
      suggestion: 'There was an issue with your request. Check the error details.'
    }
  }
  
  return {
    message: `HTTP Error ${status}`,
    suggestion: 'An unexpected error occurred. Check the error details.'
  }
}

/**
 * Standardized error response structure
 */
export interface StitchError {
  type: StitchErrorType
  message: string
  status?: number
  details?: Record<string, any>
  originalError?: Error
  isRetryable: boolean
  retryAfter?: number
}

/**
 * Configuration for retry logic
 */
export interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2
}

/**
 * Timeout configuration for different request types
 */
export interface TimeoutConfig {
  streaming: number
  nonStreaming: number
}

/**
 * Default timeout configuration (in milliseconds)
 */
const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  streaming: 30000, // 30 seconds
  nonStreaming: 60000 // 60 seconds
}

/**
 * Check if an HTTP status code indicates a retryable error
 */
export function isRetryableStatusCode(status: number): boolean {
  // Retry on server errors (5xx) and specific client errors
  return (
    status === 408 || // Request Timeout
    status === 429 || // Too Many Requests
    status >= 500     // Server errors
  )
}

/**
 * Check if an error is a network-related error
 */
export function isNetworkError(error: Error): boolean {
  const networkErrors = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'ECONNABORTED',
    'EPIPE',
    'cert',
    'self signed certificate',
    'unable to verify',
    'network',
    'fetch failed',
    'failed to fetch'
  ]
  
  const errorMessage = error.message?.toLowerCase() || ''
  const errorName = (error as any).code?.toLowerCase() || ''
  
  return networkErrors.some(pattern => 
    errorMessage.includes(pattern.toLowerCase()) || 
    errorName.includes(pattern.toLowerCase())
  )
}

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: Error): boolean {
  const timeoutPatterns = [
    'timeout',
    'timed out',
    'ETIMEDOUT',
    'aborted',
    'AbortError'
  ]
  
  const errorMessage = error.message?.toLowerCase() || ''
  const errorName = error.name?.toLowerCase() || ''
  
  return timeoutPatterns.some(pattern => 
    errorMessage.includes(pattern.toLowerCase()) || 
    errorName.includes(pattern.toLowerCase())
  )
}

/**
 * Parse Stitch API error response
 */
export function parseStitchErrorResponse(response: Response, body: any): StitchError {
  const status = response.status
  
  // Extract error details from Stitch response
  const errorData = body?.error || body
  const errorCode = errorData?.code
  const errorMessage = errorData?.message
  const errorDetails = errorData?.details
  
  // Map Stitch-specific error codes first
  const stitchError = mapStitchErrorCode(errorCode)
  
  // Get HTTP status guidance
  const statusGuidance = getStatusGuidance(status)
  
  // Determine error type based on status code
  let type: StitchErrorType
  if (status === 401) {
    type = 'authentication_error'
  } else if (status === 400) {
    type = 'validation_error'
  } else if (status === 429) {
    type = 'rate_limit'
  } else {
    type = 'api_error'
  }
  
  // Build user-friendly message with priority:
  // 1. Stitch error code mapping (most specific)
  // 2. HTTP status guidance (generic but helpful)
  // 3. Original error message (fallback)
  let userMessage: string
  if (stitchError) {
    userMessage = `${stitchError.message}. ${stitchError.suggestion}`
  } else {
    userMessage = `${statusGuidance.message}\n\n${statusGuidance.suggestion}`
  }
  
  return {
    type,
    message: userMessage,
    status,
    details: {
      code: errorCode,
      originalMessage: errorMessage,
      ...errorDetails
    },
    isRetryable: isRetryableStatusCode(status),
    retryAfter: errorData?.retry_after
  }
}

/**
 * Create a standardized StitchError from a caught error
 */
export function createStitchError(
  error: unknown,
  status?: number,
  additionalDetails?: Record<string, any>
): StitchError {
  // Handle Error objects
  if (error instanceof Error) {
    // Network errors
    if (isNetworkError(error)) {
      return {
        type: 'network_error',
        message: `Network error: ${error.message}. Please check your internet connection.`,
        originalError: error,
        isRetryable: true,
        details: additionalDetails
      }
    }
    
    // Timeout errors
    if (isTimeoutError(error)) {
      return {
        type: 'timeout',
        message: `Request timed out: ${error.message}. The server took too long to respond.`,
        originalError: error,
        isRetryable: true,
        details: additionalDetails
      }
    }
    
    // Get user-friendly guidance if we have a status code
    let finalMessage = error.message || 'An unknown error occurred'
    if (status) {
      const guidance = getStatusGuidance(status)
      finalMessage = `${guidance.message}\n\n${guidance.suggestion}`
    }
    
    // Generic error
    return {
      type: additionalDetails?.type || 'api_error',
      message: finalMessage,
      status,
      originalError: error,
      isRetryable: status ? isRetryableStatusCode(status) : false,
      details: additionalDetails
    }
  }
  
  // Handle non-Error objects
  let finalMessage = String(error) || 'An unknown error occurred'
  if (status) {
    const guidance = getStatusGuidance(status)
    finalMessage = `${guidance.message}\n\n${guidance.suggestion}`
  }
  
  return {
    type: additionalDetails?.type || 'api_error',
    message: finalMessage,
    status,
    isRetryable: status ? isRetryableStatusCode(status) : false,
    details: additionalDetails
  }
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(
  attemptNumber: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attemptNumber - 1)
  
  // Add jitter (±20% randomness) to prevent thundering herd
  const jitter = delay * 0.2 * (Math.random() * 2 - 1)
  
  return Math.min(delay + jitter, config.maxDelay)
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry a fetch operation with exponential backoff
 */
export async function retryFetch<T>(
  fetchFn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context: string = 'request'
): Promise<T> {
  let lastError: StitchError | undefined
  
  for (let attempt = 1; attempt <= config.maxRetries + 1; attempt++) {
    try {
      log.debug(`[${context}] Attempt ${attempt}/${config.maxRetries + 1}`)
      return await fetchFn()
    } catch (error) {
      // Check if it's already a StitchError (has all required properties)
      const isStitchError = error &&
        typeof error === 'object' &&
        'type' in error &&
        'message' in error &&
        'isRetryable' in error
      
      // Use existing StitchError or convert to one
      const stitchError: StitchError = isStitchError
        ? error as StitchError
        : createStitchError(error)
      
      lastError = stitchError
      
      // Check if error is retryable
      if (!stitchError.isRetryable) {
        log.error(`[${context}] Non-retryable error:`, stitchError.message)
        throw stitchError
      }
      
      // Check if we have more retries left
      if (attempt > config.maxRetries) {
        log.error(`[${context}] Max retries (${config.maxRetries}) exceeded`)
        throw stitchError
      }
      
      // Calculate backoff delay
      const retryDelay = stitchError.retryAfter
        ? stitchError.retryAfter * 1000
        : calculateBackoffDelay(attempt, config)
      
      log.warn(
        `[${context}] Retryable error (attempt ${attempt}/${config.maxRetries + 1}): ${stitchError.message}. ` +
        `Retrying in ${Math.round(retryDelay)}ms...`
      )
      
      // Wait before retry
      await sleep(retryDelay)
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError || new Error(`Retry failed with unknown error. Loop count: ${config.maxRetries + 1}`)
}

/**
 * Create an AbortController with timeout
 */
export function createTimeoutController(
  timeoutMs: number,
  existingSignal?: AbortSignal
): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController()
  
  // Combine with existing signal if provided
  if (existingSignal) {
    existingSignal.addEventListener('abort', () => controller.abort())
  }
  
  // Set timeout
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`))
  }, timeoutMs)
  
  // Cleanup function to clear timeout
  const cleanup = () => clearTimeout(timeoutId)
  
  return { controller, cleanup }
}

/**
 * Wrap a fetch call with comprehensive error handling
 */
export async function fetchWithErrorHandling(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: {
    isStreaming?: boolean
    timeoutConfig?: TimeoutConfig
    retryConfig?: RetryConfig
    context?: string
  } = {}
): Promise<Response> {
  const {
    isStreaming = false,
    timeoutConfig = DEFAULT_TIMEOUT_CONFIG,
    retryConfig = DEFAULT_RETRY_CONFIG,
    context = 'Stitch API'
  } = options
  
  // Determine timeout based on request type
  const timeoutMs = isStreaming ? timeoutConfig.streaming : timeoutConfig.nonStreaming
  
  // Create fetch function with timeout
  const fetchFn = async (): Promise<Response> => {
    const { controller, cleanup } = createTimeoutController(timeoutMs, init?.signal)
    
    try {
      log.debug(`[${context}] Making request with ${timeoutMs}ms timeout`)
      
      const response = await fetch(input, {
        ...init,
        signal: controller.signal
      })
      
      cleanup()
      
      // Check for HTTP errors
      if (!response.ok) {
        const responseBody = await response.text().catch(() => '')
        let body: any
        try {
          body = JSON.parse(responseBody)
        } catch {
          body = { message: responseBody }
        }
        const stitchError = parseStitchErrorResponse(response, body)
        
        log.error(`[${context}] HTTP ${response.status}: ${stitchError.message}`)
        throw stitchError
      }
      
      return response
    } catch (error) {
      cleanup()
      
      // If it's already a StitchError, rethrow it
      if (error && typeof error === 'object' && 'type' in error) {
        throw error
      }
      
      // Convert to StitchError
      throw createStitchError(error)
    }
  }
  
  // Execute with retry logic
  return retryFetch(fetchFn, retryConfig, context)
}

/**
 * Create a minimal valid OpenAI-format error response
 */
export function createErrorResponse(error: StitchError): any {
  return {
    choices: [{
      index: 0,
      delta: {},
      finish_reason: 'stop'
    }],
    error: {
      type: error.type,
      message: error.message,
      status: error.status,
      details: error.details
    }
  }
}

/**
 * Log error with structured context
 */
export function logError(
  error: StitchError,
  context: {
    url?: string
    method?: string
    requestBody?: string
    timestamp?: string
  }
): void {
  log.error('Stitch provider error', {
    type: error.type,
    message: error.message,
    status: error.status,
    isRetryable: error.isRetryable,
    retryAfter: error.retryAfter,
    details: error.details,
    context: {
      url: context.url,
      method: context.method,
      timestamp: context.timestamp || new Date().toISOString(),
      // Don't log full request body (may contain sensitive data), just its size
      requestBodySize: context.requestBody?.length
    }
  })
}

/**
 * Determines if a streaming error allows the stream to continue
 * @param error The error that occurred
 * @returns true if stream can continue, false if it must terminate
 */
export function isStreamRecoverable(error: StitchError): boolean {
  // Non-recoverable errors
  if (error.type === 'authentication_error') return false
  if (error.type === 'rate_limit') return false
  if (error.status === 400) return false // Bad request
  if (error.status === 403) return false // Forbidden
  
  // Recoverable errors (malformed chunk, network hiccup)
  if (error.type === 'streaming_error') return true
  if (error.type === 'validation_error') return true // Skip malformed chunk
  
  return false
}

/**
 * Handles errors during streaming, deciding whether to continue or terminate
 * @param error The error that occurred
 * @param buffer Current buffer content
 * @returns Object with recovery decision and error response if needed
 */
export function handleStreamError(
  error: unknown,
  buffer: string
): {
  shouldContinue: boolean
  errorResponse?: string
  partialData?: any
} {
  // Convert to StitchError if not already one
  const stitchError: StitchError = error && typeof error === 'object' && 'type' in error
    ? error as StitchError
    : createStitchError(error)
  
  // Create new error with buffer context (avoid mutating readonly properties)
  const enrichedError: StitchError = {
    ...stitchError,
    details: {
      ...stitchError.details,
      bufferSize: buffer.length,
      context: 'stream_error'
    }
  }
  
  const shouldContinue = isStreamRecoverable(enrichedError)
  
  if (!shouldContinue) {
    // Terminal error - return error response in SSE format
    const errorData = createErrorResponse(enrichedError)
    return {
      shouldContinue: false,
      errorResponse: `data: ${JSON.stringify(errorData)}\n\ndata: [DONE]\n\n`
    }
  }
  
  // Recoverable error - log and continue
  logError(enrichedError, { recoverable: true } as any)
  return {
    shouldContinue: true
  }
}

/**
 * Creates a properly formatted SSE error response for streaming
 * @param error The error to format
 * @returns SSE-formatted error response
 */
export function createStreamErrorResponse(error: StitchError): string {
  const errorResponse = createErrorResponse(error)
  return `data: ${JSON.stringify(errorResponse)}\n\ndata: [DONE]\n\n`
}

/**
 * Export timeout configuration for use in provider
 */
export { DEFAULT_TIMEOUT_CONFIG, DEFAULT_RETRY_CONFIG }
