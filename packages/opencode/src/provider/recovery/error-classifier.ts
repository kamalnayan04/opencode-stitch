
import { ErrorRecoverability } from './types';

/**
 * Classifies an error to determine if and how it should be retried.
 * 
 * @param error The error object to classify
 * @returns The recoverability status of the error
 */
export function classifyError(error: any): ErrorRecoverability {
  // Extract error details safely
  const message = error?.message || '';
  const code = error?.code || '';
  const status = typeof error?.status === 'number' ? error.status : undefined;
  
  // 1. Network/Connection errors (Transient) -> Retry Immediately
  if (
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    message.includes('EHOSTUNREACH') ||
    message.includes('socket hang up') ||
    message.includes('network timeout') ||
    code === 'NETWORK_ERROR' ||
    code === 'ECONNRESET'
  ) {
    return ErrorRecoverability.RETRIABLE;
  }
  
  // 2. Rate Limiting (Transient but needs wait) -> Retry with Backoff
  if (
    code === 'RATE_LIMIT_EXCEEDED' ||
    code === 'TOO_MANY_REQUESTS' ||
    status === 429
  ) {
    return ErrorRecoverability.RETRIABLE_WITH_BACKOFF;
  }
  
  // 3. Server Errors (Transient) -> Retry with Backoff
  // 500: Internal Server Error
  // 502: Bad Gateway
  // 503: Service Unavailable
  // 504: Gateway Timeout
  if (status && status >= 500) {
    return ErrorRecoverability.RETRIABLE_WITH_BACKOFF;
  }
  
  // 4. Client/Auth Errors (Permanent) -> Do Not Retry
  // 400: Bad Request
  // 401: Unauthorized
  // 403: Forbidden
  // 404: Not Found
  // 422: Unprocessable Entity
  if (status && status >= 400 && status < 500) {
    return ErrorRecoverability.NON_RETRIABLE;
  }
  
  // Specific Stitch/Provider errors that are non-recoverable
  if (
    code === 'INVALID_API_KEY' ||
    code === 'INVALID_REQUEST' ||
    code === 'MODEL_NOT_FOUND' ||
    message.includes('validation failed')
  ) {
    return ErrorRecoverability.NON_RETRIABLE;
  }
  
  // Default: If we don't know what it is, assume it might be transient but risky.
  // Conservative approach: Don't retry unknown errors to avoid loops.
  // Aggressive approach: Retry with backoff.
  // Choosing conservative for now to prevent infinite loops on logic bugs.
  return ErrorRecoverability.NON_RETRIABLE;
}
