
/**
 * Shared type definitions for the Stitch CLI recovery layer.
 */

/**
 * Categories of error recoverability.
 */
export enum ErrorRecoverability {
  /** Error is transient and operation should be retried immediately (e.g. connection refused) */
  RETRIABLE = 'retriable',
  /** Error requires a backoff period before retry (e.g. rate limit, server busy) */
  RETRIABLE_WITH_BACKOFF = 'backoff',
  /** Error is fatal and should not be retried (e.g. auth error, bad request) */
  NON_RETRIABLE = 'fatal'
}

/**
 * Configuration for the retry mechanism.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds (cap) */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Whether to add random jitter to the delay */
  jitter: boolean;
}

/**
 * Configuration for the circuit breaker.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time window in milliseconds for counting failures */
  failureWindowMs: number;
  /** Duration in milliseconds to keep the circuit open before testing */
  openStateDurationMs: number;
  /** Number of successful test requests required to close the circuit from half-open */
  halfOpenAttempts: number;
}

/**
 * Combined recovery configuration.
 */
export interface RecoveryConfig {
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  
  enableRetry: boolean;
  enableCircuitBreaker: boolean;
  
  /** Whether to propagate errors that are classified as NON_RETRIABLE */
  propagateNonRetriableErrors?: boolean;
  /** Max total time to spend retrying in milliseconds */
  maxTotalRetryTime?: number;
}

/**
 * State of the circuit breaker.
 */
export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  openedAt: number | null;
}
