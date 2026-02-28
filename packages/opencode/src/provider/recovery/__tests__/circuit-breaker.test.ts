
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { CircuitBreaker } from '../circuit-breaker';
import { CircuitState } from '../types';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  
  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 2,
      failureWindowMs: 1000,
      openStateDurationMs: 100, // Short for testing
      halfOpenAttempts: 1
    });
  });

  it('should be closed initially', () => {
    expect(breaker.getState().state).toBe(CircuitState.CLOSED);
  });

  it('should pass through successful calls', async () => {
    const operation = mock().mockResolvedValue('success');
    const result = await breaker.execute(operation, () => 'fallback');
    
    expect(result).toBe('success');
    expect(breaker.getState().state).toBe(CircuitState.CLOSED);
  });

  it('should open after threshold failures', async () => {
    const operation = mock().mockRejectedValue(new Error('fail'));
    const fallback = mock().mockReturnValue('fallback');
    
    // 1st failure
    try { await breaker.execute(operation, fallback); } catch {}
    expect(breaker.getState().state).toBe(CircuitState.CLOSED);
    
    // 2nd failure (threshold met) -> Opens
    try { await breaker.execute(operation, fallback); } catch {}
    expect(breaker.getState().state).toBe(CircuitState.OPEN);
    
    // 3rd call -> Fallback immediately
    const result = await breaker.execute(operation, fallback);
    expect(result).toBe('fallback');
    expect(operation).toHaveBeenCalledTimes(2); // Not called 3rd time
  });

  it('should transition to half-open after timeout', async () => {
    // Trip circuit
    const operation = mock().mockRejectedValue(new Error('fail'));
    try { await breaker.execute(operation, () => 'fb'); } catch {}
    try { await breaker.execute(operation, () => 'fb'); } catch {}
    
    expect(breaker.getState().state).toBe(CircuitState.OPEN);
    
    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Next call should try operation (half-open)
    operation.mockResolvedValueOnce('success');
    await breaker.execute(operation, () => 'fb');
    
    // Should close after success
    expect(breaker.getState().state).toBe(CircuitState.CLOSED);
  });
});
