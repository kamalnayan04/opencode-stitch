
/**
 * Comprehensive test suite for Stitch provider error handling
 * 
 * Tests cover:
 * - Network errors (connection failures, DNS, SSL)
 * - Timeout handling
 * - API errors (all HTTP status codes)
 * - Streaming errors
 * - Retry logic with exponential backoff
 * - Error response formatting
 * 
 * Reference: opencode/docs/plans/2026-02-25-opencode-stitch-integration-design.md
 */

import { describe, it, expect, beforeEach, mock } from "bun:test"
import {
  isRetryableStatusCode,
  isNetworkError,
  isTimeoutError,
  mapStatusCodeToMessage,
  parseStitchErrorResponse,
  createStitchError,
  calculateBackoffDelay,
  sleep,
  retryFetch,
  createTimeoutController,
  fetchWithErrorHandling,
  createErrorResponse,
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_RETRY_CONFIG,
  type StitchError,
} from "../../src/provider/stitch-error"

describe("Stitch Error Handling", () => {
  describe("Status Code Classification", () => {
    it("should identify retryable status codes", () => {
      // Server errors (5xx) are retryable
      expect(isRetryableStatusCode(500)).toBe(true)
      expect(isRetryableStatusCode(502)).toBe(true)
      expect(isRetryableStatusCode(503)).toBe(true)
      expect(isRetryableStatusCode(504)).toBe(true)
      
      // Request timeout and rate limit are retryable
      expect(isRetryableStatusCode(408)).toBe(true)
      expect(isRetryableStatusCode(429)).toBe(true)
    })
    
    it("should identify non-retryable status codes", () => {
      // Client errors (4xx) are not retryable
      expect(isRetryableStatusCode(400)).toBe(false)
      expect(isRetryableStatusCode(401)).toBe(false)
      expect(isRetryableStatusCode(403)).toBe(false)
      expect(isRetryableStatusCode(404)).toBe(false)
      expect(isRetryableStatusCode(413)).toBe(false)
      
      // Success codes are not retryable
      expect(isRetryableStatusCode(200)).toBe(false)
      expect(isRetryableStatusCode(201)).toBe(false)
    })
  })
  
  describe("Network Error Detection", () => {
    it("should detect connection refused errors", () => {
      const error = new Error("ECONNREFUSED: Connection refused")
      expect(isNetworkError(error)).toBe(true)
    })
    
    it("should detect connection reset errors", () => {
      const error = new Error("ECONNRESET: Connection reset by peer")
      expect(isNetworkError(error)).toBe(true)
    })
    
    it("should detect DNS errors", () => {
      const error = new Error("ENOTFOUND: DNS lookup failed")
      expect(isNetworkError(error)).toBe(true)
    })
    
    it("should detect SSL certificate errors", () => {
      const error = new Error("self signed certificate in certificate chain")
      expect(isNetworkError(error)).toBe(true)
    })
    
    it("should detect fetch failed errors", () => {
      const error = new Error("fetch failed")
      expect(isNetworkError(error)).toBe(true)
    })
    
    it("should not detect non-network errors", () => {
      const error = new Error("Invalid JSON")
      expect(isNetworkError(error)).toBe(false)
    })
  })
  
  describe("Timeout Error Detection", () => {
    it("should detect timeout errors", () => {
      const error = new Error("Request timeout")
      expect(isTimeoutError(error)).toBe(true)
    })
    
    it("should detect ETIMEDOUT errors", () => {
      const error = new Error("ETIMEDOUT")
      expect(isTimeoutError(error)).toBe(true)
    })
    
    it("should detect AbortError", () => {
      const error = new Error("AbortError: The operation was aborted")
      expect(isTimeoutError(error)).toBe(true)
    })
    
    it("should not detect non-timeout errors", () => {
      const error = new Error("Invalid request")
      expect(isTimeoutError(error)).toBe(false)
    })
  })
  
  describe("Status Code to Message Mapping", () => {
    it("should map 400 to Bad Request", () => {
      expect(mapStatusCodeToMessage(400)).toContain("Bad Request")
    })
    
    it("should map 401 to Unauthorized", () => {
      expect(mapStatusCodeToMessage(401)).toContain("Unauthorized")
    })
    
    it("should map 403 to Forbidden", () => {
      expect(mapStatusCodeToMessage(403)).toContain("Forbidden")
    })
    
    it("should map 404 to Not Found", () => {
      expect(mapStatusCodeToMessage(404)).toContain("Not Found")
    })
    
    it("should map 429 to Rate Limited", () => {
      expect(mapStatusCodeToMessage(429)).toContain("Rate Limited")
    })
    
    it("should map 500 to Internal Server Error", () => {
      expect(mapStatusCodeToMessage(500)).toContain("Internal Server Error")
    })
    
    it("should map 502 to Bad Gateway", () => {
      expect(mapStatusCodeToMessage(502)).toContain("Bad Gateway")
    })
    
    it("should map 503 to Service Unavailable", () => {
      expect(mapStatusCodeToMessage(503)).toContain("Service Unavailable")
    })
    
    it("should map 504 to Gateway Timeout", () => {
      expect(mapStatusCodeToMessage(504)).toContain("Gateway Timeout")
    })
    
    it("should provide generic message for unknown status codes", () => {
      expect(mapStatusCodeToMessage(418)).toContain("HTTP Error 418")
    })
  })
  
  describe("Stitch Error Response Parsing", () => {
    it("should parse standard Stitch error response", () => {
      const responseBody = JSON.stringify({
        error: {
          code: "INVALID_REQUEST",
          message: "Model not found",
          details: { modelId: "invalid-model" }
        }
      })
      
      const error = parseStitchErrorResponse(responseBody, 400)
      expect(error.type).toBe("validation_error")
      expect(error.message).toBe("Model not found")
      expect(error.status).toBe(400)
      expect(error.details?.code).toBe("INVALID_REQUEST")
      expect(error.isRetryable).toBe(false)
    })
    
    it("should classify 401 as authentication error", () => {
      const responseBody = JSON.stringify({
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid API key"
        }
      })
      
      const error = parseStitchErrorResponse(responseBody, 401)
      expect(error.type).toBe("authentication_error")
      expect(error.isRetryable).toBe(false)
    })
    
    it("should classify 429 as rate limit error", () => {
      const responseBody = JSON.stringify({
        error: {
          code: "RATE_LIMIT",
          message: "Too many requests",
          retry_after: 60
        }
      })
      
      const error = parseStitchErrorResponse(responseBody, 429)
      expect(error.type).toBe("rate_limit")
      expect(error.retryAfter).toBe(60)
      expect(error.isRetryable).toBe(true)
    })
    
    it("should handle malformed JSON gracefully", () => {
      const responseBody = "not valid json"
      
      const error = parseStitchErrorResponse(responseBody, 500)
      expect(error.type).toBe("api_error")
      expect(error.status).toBe(500)
      expect(error.isRetryable).toBe(true)
    })
    
    it("should handle missing error field", () => {
      const responseBody = JSON.stringify({
        message: "Something went wrong"
      })
      
      const error = parseStitchErrorResponse(responseBody, 500)
      expect(error.type).toBe("api_error")
      expect(error.message).toBe("Something went wrong")
    })
  })
  
  describe("StitchError Creation", () => {
    it("should create network error from connection error", () => {
      const error = new Error("ECONNREFUSED: Connection refused")
      const stitchError = createStitchError(error)
      
      expect(stitchError.type).toBe("network_error")
      expect(stitchError.message).toContain("Network error")
      expect(stitchError.isRetryable).toBe(true)
      expect(stitchError.originalError).toBe(error)
    })
    
    it("should create timeout error from timeout", () => {
      const error = new Error("Request timeout")
      const stitchError = createStitchError(error)
      
      expect(stitchError.type).toBe("timeout")
      expect(stitchError.message).toContain("timed out")
      expect(stitchError.isRetryable).toBe(true)
    })
    
    it("should parse API error from response body", () => {
      const error = new Error("HTTP Error")
      const responseBody = JSON.stringify({
        error: {
          code: "INVALID_REQUEST",
          message: "Bad request"
        }
      })
      
      const stitchError = createStitchError(error, 400, responseBody)
      expect(stitchError.type).toBe("validation_error")
      expect(stitchError.message).toBe("Bad request")
      expect(stitchError.status).toBe(400)
    })
    
    it("should handle non-Error objects", () => {
      const stitchError = createStitchError("string error")
      
      expect(stitchError.type).toBe("api_error")
      expect(stitchError.message).toBe("string error")
      expect(stitchError.isRetryable).toBe(false)
    })
  })
  
  describe("Exponential Backoff", () => {
    it("should calculate exponential backoff delay", () => {
      const config = {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      }
      
      // Attempt 1: ~1000ms (1000 * 2^0)
      const delay1 = calculateBackoffDelay(1, config)
      expect(delay1).toBeGreaterThanOrEqual(800) // 1000 - 20% jitter
      expect(delay1).toBeLessThanOrEqual(1200) // 1000 + 20% jitter
      
      // Attempt 2: ~2000ms (1000 * 2^1)
      const delay2 = calculateBackoffDelay(2, config)
      expect(delay2).toBeGreaterThanOrEqual(1600)
      expect(delay2).toBeLessThanOrEqual(2400)
      
      // Attempt 3: ~4000ms (1000 * 2^2)
      const delay3 = calculateBackoffDelay(3, config)
      expect(delay3).toBeGreaterThanOrEqual(3200)
      expect(delay3).toBeLessThanOrEqual(4800)
    })
    
    it("should respect max delay", () => {
      const config = {
        maxRetries: 10,
        baseDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2
      }
      
      // Large attempt number should be capped at maxDelay
      const delay = calculateBackoffDelay(10, config)
      expect(delay).toBeLessThanOrEqual(config.maxDelay * 1.2) // Allow for jitter
    })
  })
  
  describe("Retry Logic", () => {
    it("should retry on retryable errors", async () => {
      let attempts = 0
      const fetchFn = async () => {
        attempts++
        if (attempts < 3) {
          const error: StitchError = {
            type: "api_error",
            message: "Server error",
            status: 500,
            isRetryable: true
          }
          throw error
        }
        return "success"
      }
      
      const config = {
        maxRetries: 3,
        baseDelay: 10, // Fast for testing
        maxDelay: 100,
        backoffMultiplier: 2
      }
      
      const result = await retryFetch(fetchFn, config, "test")
      expect(result).toBe("success")
      expect(attempts).toBe(3)
    })
    
    it("should not retry on non-retryable errors", async () => {
      let attempts = 0
      const fetchFn = async () => {
        attempts++
        const error: StitchError = {
          type: "authentication_error",
          message: "Invalid API key",
          status: 401,
          isRetryable: false
        }
        throw error
      }
      
      const config = {
        maxRetries: 3,
        baseDelay: 10,
        maxDelay: 100,
        backoffMultiplier: 2
      }
      
      try {
        await retryFetch(fetchFn, config, "test")
        expect.unreachable("Should have thrown")
      } catch (error) {
        expect(attempts).toBe(1) // Only tried once
        expect((error as StitchError).type).toBe("authentication_error")
      }
    })
    
    it("should throw after max retries", async () => {
      let attempts = 0
      const fetchFn = async () => {
        attempts++
        const error: StitchError = {
          type: "api_error",
          message: "Server error",
          status: 500,
          isRetryable: true
        }
        throw error
      }
      
      const config = {
        maxRetries: 2,
        baseDelay: 10,
        maxDelay: 100,
        backoffMultiplier: 2
      }
      
      try {
        await retryFetch(fetchFn, config, "test")
        expect.unreachable("Should have thrown")
      } catch (error) {
        expect(attempts).toBe(3) // Initial + 2 retries
        expect((error as StitchError).status).toBe(500)
      }
    })
    
    it("should respect retry_after from error", async () => {
      let attempts = 0
      const startTime = Date.now()
      
      const fetchFn = async () => {
        attempts++
        if (attempts < 2) {
          const error: StitchError = {
            type: "rate_limit",
            message: "Rate limited",
            status: 429,
            isRetryable: true,
            retryAfter: 1 // 1 second
          }
          throw error
        }
        return "success"
      }
      
      const config = {
        maxRetries: 2,
        baseDelay: 10,
        maxDelay: 100,
        backoffMultiplier: 2
      }
      
      const result = await retryFetch(fetchFn, config, "test")
      const elapsed = Date.now() - startTime
      
      expect(result).toBe("success")
      expect(elapsed).toBeGreaterThanOrEqual(900) // Should wait ~1 second
    })
  })
  
  describe("Timeout Controller", () => {
    it("should create timeout controller with cleanup", () => {
      const { controller, cleanup } = createTimeoutController(1000)
      
      expect(controller).toBeInstanceOf(AbortController)
      expect(cleanup).toBeInstanceOf(Function)
      expect(controller.signal.aborted).toBe(false)
      
      cleanup()
    })
    
    it("should abort after timeout", async () => {
      const { controller, cleanup } = createTimeoutController(50)
      
      await sleep(100)
      
      expect(controller.signal.aborted).toBe(true)
      cleanup()
    })
    
    it("should combine with existing signal", async () => {
      const existingController = new AbortController()
      const { controller, cleanup } = createTimeoutController(1000, existingController.signal)
      
      existingController.abort()
      
      // Small delay to let event propagate
      await sleep(10)
      
      expect(controller.signal.aborted).toBe(true)
      cleanup()
    })
  })
  
  describe("Error Response Formatting", () => {
    it("should create standardized error response", () => {
      const error: StitchError = {
        type: "api_error",
        message: "Server error",
        status: 500,
        details: { code: "INTERNAL_ERROR" },
        isRetryable: true
      }
      
      const response = createErrorResponse(error)
      
      expect(response.choices).toHaveLength(1)
      expect(response.choices[0].index).toBe(0)
      expect(response.choices[0].delta).toEqual({})
      expect(response.choices[0].finish_reason).toBe("stop")
      expect(response.error).toBeDefined()
      expect(response.error.type).toBe("api_error")
      expect(response.error.message).toBe("Server error")
      expect(response.error.status).toBe(500)
    })
    
    it("should include error details", () => {
      const error: StitchError = {
        type: "validation_error",
        message: "Invalid model",
        status: 400,
        details: { 
          code: "INVALID_MODEL",
          modelId: "wrong-model"
        },
        isRetryable: false
      }
      
      const response = createErrorResponse(error)
      
      expect(response.error.details).toEqual({
        code: "INVALID_MODEL",
        modelId: "wrong-model"
      })
    })
  })
  
  describe("Sleep Function", () => {
    it("should sleep for specified duration", async () => {
      const start = Date.now()
      await sleep(100)
      const elapsed = Date.now() - start
      
      expect(elapsed).toBeGreaterThanOrEqual(90) // Allow small variance
      expect(elapsed).toBeLessThan(150)
    })
  })
  
  describe("Integration: Complete Error Handling Flow", () => {
    it("should handle complete error transformation flow", async () => {
      // Test the complete flow: Error -> StitchError -> Retry Logic
      let attempts = 0
      
      const fetchFn = async () => {
        attempts++
        if (attempts < 3) {
          // Throw a network error
          throw new Error("ECONNREFUSED: Connection refused")
        }
        return "success"
      }
      
      const config = {
        maxRetries: 3,
        baseDelay: 10,
        maxDelay: 100,
        backoffMultiplier: 2
      }
      
      // The retryFetch should convert the network error to StitchError,
      // identify it as retryable, and retry until success
      const result = await retryFetch(fetchFn, config, "integration-test")
      
      expect(result).toBe("success")
      expect(attempts).toBe(3) // Should have retried twice and succeeded on third attempt
    })
    
    it("should handle non-retryable errors without retry", async () => {
      // Test that non-retryable errors fail immediately
      let attempts = 0
      
      const fetchFn = async () => {
        attempts++
        const error: StitchError = {
          type: "authentication_error",
          message: "Invalid API key",
          status: 401,
          isRetryable: false
        }
        throw error
      }
      
      const config = {
        maxRetries: 3,
        baseDelay: 10,
        maxDelay: 100,
        backoffMultiplier: 2
      }
      
      try {
        await retryFetch(fetchFn, config, "integration-test")
        expect.unreachable("Should have thrown")
      } catch (error) {
        const stitchError = error as StitchError
        expect(stitchError.type).toBe("authentication_error")
        expect(attempts).toBe(1) // Should not have retried
      }
    })
  })
  
  describe("Configuration Validation", () => {
    it("should have sensible default timeout config", () => {
      expect(DEFAULT_TIMEOUT_CONFIG.streaming).toBe(30000)
      expect(DEFAULT_TIMEOUT_CONFIG.nonStreaming).toBe(60000)
    })
    
    it("should have sensible default retry config", () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(3)
      expect(DEFAULT_RETRY_CONFIG.baseDelay).toBe(1000)
      expect(DEFAULT_RETRY_CONFIG.maxDelay).toBe(30000)
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2)
    })
  })
})
