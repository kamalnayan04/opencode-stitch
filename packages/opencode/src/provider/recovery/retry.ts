
import { ErrorRecoverability, type RetryConfig } from './types';
import { classifyError } from './error-classifier';
import { TelemetryLogger } from '../robustness/telemetry';

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true
};

/**
 * Calculates the delay for the next retry attempt using exponential backoff.
 * 
 * @param attemptNumber Current attempt number (0-indexed)
 * @param config Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attemptNumber: number,
  config: RetryConfig
): number {
  // Exponential: delay = baseDelay * (multiplier ^ attemptNumber)
  let delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attemptNumber);

  // Cap at max delay
  delay = Math.min(delay, config.maxDelayMs);

  // Add jitter to prevent thundering herd
  if (config.jitter) {
    // Random jitter between -30% and +30% of the delay
    const jitterRange = delay * 0.3;
    delay += (Math.random() * jitterRange * 2) - jitterRange;
  }

  // Ensure delay is at least 0 and integer
  return Math.max(0, Math.floor(delay));
}

interface RetryContext {
  attemptNumber: number;
  lastError: Error | null;
  totalDelay: number;
  startTime: number;
}

/**
 * Executes an asynchronous operation with retry logic.
 * 
 * @param operation The async function to execute
 * @param config Retry configuration
 * @param errorClassifier Function to determine if an error is retriable
 * @returns The result of the operation
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  errorClassifier: (e: any) => ErrorRecoverability = classifyError
): Promise<T> {
  const telemetry = TelemetryLogger.getInstance();

  const context: RetryContext = {
    attemptNumber: 0,
    lastError: null,
    totalDelay: 0,
    startTime: Date.now()
  };

  while (context.attemptNumber <= config.maxAttempts) {
    try {
      const result = await operation();

      // Log success if this was a retry
      if (context.attemptNumber > 0) {
        telemetry.log({
          eventType: 'retry_success',
          severity: 'info',
          details: {
            attempts: context.attemptNumber + 1,
            totalDelay: context.totalDelay,
            duration: Date.now() - context.startTime
          }
        });
      }

      return result;

    } catch (error) {
      context.lastError = error instanceof Error ? error : new Error(String(error));
      const recoverability = errorClassifier(error);

      // If we've exhausted attempts, throw immediately
      if (context.attemptNumber >= config.maxAttempts) {
        telemetry.log({
          eventType: 'retry_exhausted',
          severity: 'warning',
          details: {
            attempts: context.attemptNumber + 1,
            totalDelay: context.totalDelay,
            lastError: context.lastError.message
          }
        });
        throw context.lastError;
      }

      // If error is non-retriable, throw immediately
      if (recoverability === ErrorRecoverability.NON_RETRIABLE) {
        telemetry.log({
          eventType: 'retry_failed',
          severity: 'warning',
          details: {
            reason: 'non_retriable',
            error: context.lastError.message,
            attempts: context.attemptNumber + 1
          }
        });
        throw context.lastError;
      }

      // Calculate delay based on recoverability
      const delay = recoverability === ErrorRecoverability.RETRIABLE
        ? 0  // Immediate retry for transient network errors
        : calculateBackoffDelay(context.attemptNumber, config);

      context.totalDelay += delay;
      context.attemptNumber++;

      telemetry.log({
        eventType: 'retry_attempt',
        severity: 'info',
        details: {
          attempt: context.attemptNumber, // This is the *upcoming* attempt number
          nextRetryIn: delay,
          error: context.lastError.message,
          recoverability
        }
      });

      // Wait before next attempt
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Should never be reached due to throw in loop
  throw context.lastError || new Error('Retry logic error');
}
