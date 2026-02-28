
import { CircuitState, type CircuitBreakerConfig, type CircuitBreakerState } from './types';
import { TelemetryLogger } from '../robustness/telemetry';

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  failureWindowMs: 30000,
  openStateDurationMs: 60000,
  halfOpenAttempts: 1
};

/**
 * Circuit Breaker pattern implementation.
 * Protects downstream services from being overwhelmed by repeated failures.
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: Array<{ timestamp: number; error: Error }> = [];
  private openedAt: number | null = null;
  private halfOpenSuccessCount: number = 0;
  private telemetry: TelemetryLogger;

  constructor(
    private config: CircuitBreakerConfig = DEFAULT_CIRCUIT_CONFIG,
    private name: string = 'stitch-api'
  ) {
    this.telemetry = TelemetryLogger.getInstance();
  }

  /**
   * Executes an operation with circuit breaker protection.
   * 
   * @param operation The async operation to execute
   * @param fallback Fallback function to call if circuit is open
   * @returns Result of operation or fallback
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback: () => T
  ): Promise<T> {

    // Check if circuit should transition to HALF_OPEN (timeout elapsed)
    if (this.state === CircuitState.OPEN && this.shouldAttemptReset()) {
      this.transitionToHalfOpen();
    }

    // Circuit is OPEN - fail fast with fallback
    if (this.state === CircuitState.OPEN) {
      this.telemetry.log({
        eventType: 'circuit_breaker_open',
        severity: 'warning',
        details: {
          circuit: this.name,
          openedAt: this.openedAt,
          recentFailures: this.failures.length
        }
      });

      return fallback();
    }

    // Circuit is CLOSED or HALF_OPEN - attempt operation
    try {
      const result = await operation();

      // Success - reset or fully close circuit
      this.onSuccess();

      return result;

    } catch (error) {
      // Failure - record and potentially open circuit
      this.onFailure(error instanceof Error ? error : new Error(String(error)));

      // If circuit just opened during this call, use fallback
      if ((this.state as any) === CircuitState.OPEN) {
        return fallback();
      }

      // Otherwise, propagate error (likely for retry logic to handle)
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.openedAt) return false;

    const elapsedMs = Date.now() - this.openedAt;
    return elapsedMs >= this.config.openStateDurationMs;
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.halfOpenSuccessCount = 0;

    this.telemetry.log({
      eventType: 'circuit_breaker_half_open',
      severity: 'info',
      details: {
        circuit: this.name,
        wasOpenFor: Date.now() - (this.openedAt || 0)
      }
    });
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenSuccessCount++;

      // Check if enough successes to fully close
      if (this.halfOpenSuccessCount >= this.config.halfOpenAttempts) {
        this.state = CircuitState.CLOSED;
        this.failures = [];
        this.openedAt = null;
        this.halfOpenSuccessCount = 0;

        this.telemetry.log({
          eventType: 'circuit_breaker_closed',
          severity: 'info',
          details: {
            circuit: this.name,
            reason: 'test_request_succeeded'
          }
        });
      }
    } else {
      // If CLOSED, just clear old failures to keep memory clean
      this.cleanupOldFailures();
    }
  }

  private onFailure(error: Error): void {
    const now = Date.now();
    this.failures.push({ timestamp: now, error });

    // Clean up old failures outside window
    this.cleanupOldFailures();

    // Check if threshold exceeded
    if (this.state === CircuitState.CLOSED) {
      if (this.failures.length >= this.config.failureThreshold) {
        this.tripCircuit();
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Any failure during HALF_OPEN trips it back to OPEN immediately
      this.tripCircuit();
    }
  }

  private tripCircuit(): void {
    this.state = CircuitState.OPEN;
    this.openedAt = Date.now();

    this.telemetry.log({
      eventType: 'circuit_breaker_opened',
      severity: 'critical',
      details: {
        circuit: this.name,
        failureCount: this.failures.length,
        recentErrors: this.failures.slice(-3).map(f => f.error.message)
      }
    });
  }

  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindowMs;
    // Keep failures that happened within the window
    this.failures = this.failures.filter(f => f.timestamp > cutoff);
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getState(): CircuitBreakerState {
    return {
      state: this.state,
      failures: this.failures.length,
      openedAt: this.openedAt
    };
  }
}
