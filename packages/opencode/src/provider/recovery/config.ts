
import { RecoveryConfig } from './types';

export const AGGRESSIVE_RECOVERY: RecoveryConfig = {
  retry: {
    maxAttempts: 5,
    baseDelayMs: 500,
    maxDelayMs: 15000,
    backoffMultiplier: 1.5,
    jitter: true
  },
  circuitBreaker: {
    failureThreshold: 3,
    failureWindowMs: 20000,
    openStateDurationMs: 30000,
    halfOpenAttempts: 1
  },
  enableRetry: true,
  enableCircuitBreaker: true,
  propagateNonRetriableErrors: true,
  maxTotalRetryTime: 120000
};

export const CONSERVATIVE_RECOVERY: RecoveryConfig = {
  retry: {
    maxAttempts: 2,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    backoffMultiplier: 3,
    jitter: true
  },
  circuitBreaker: {
    failureThreshold: 10,
    failureWindowMs: 60000,
    openStateDurationMs: 120000,
    halfOpenAttempts: 2
  },
  enableRetry: true,
  enableCircuitBreaker: true,
  propagateNonRetriableErrors: false,
  maxTotalRetryTime: 180000
};

export const DEFAULT_RECOVERY =
  process.env.NODE_ENV === 'production'
    ? CONSERVATIVE_RECOVERY
    : AGGRESSIVE_RECOVERY;
