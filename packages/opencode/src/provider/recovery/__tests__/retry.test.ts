
import { describe, it, expect, mock, spyOn } from 'bun:test';
import { withRetry, calculateBackoffDelay } from '../retry';
import { ErrorRecoverability } from '../types';

describe('withRetry', () => {
  it('should return result immediately on success', async () => {
    const operation = mock().mockResolvedValue('success');
    const result = await withRetry(operation);
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should retry retriable errors', async () => {
    const operation = mock()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce('success');
    
    const result = await withRetry(operation, {
      maxAttempts: 3,
      baseDelayMs: 1, // fast
      maxDelayMs: 100,
      backoffMultiplier: 2,
      jitter: false
    });
    
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('should fail immediately on non-retriable errors', async () => {
    const error = new Error('Unauthorized');
    // @ts-ignore
    error.status = 401;
    const operation = mock().mockRejectedValue(error);
    
    await expect(withRetry(operation)).rejects.toThrow('Unauthorized');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('should fail after max attempts exceeded', async () => {
    const operation = mock().mockRejectedValue(new Error('ECONNREFUSED'));
    
    await expect(withRetry(operation, {
      maxAttempts: 2,
      baseDelayMs: 1,
      maxDelayMs: 100,
      backoffMultiplier: 2,
      jitter: false
    })).rejects.toThrow('ECONNREFUSED');
    
    expect(operation).toHaveBeenCalledTimes(3); // 0, 1, 2
  });
});

describe('calculateBackoffDelay', () => {
  it('should calculate exponential backoff', () => {
    const config = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      jitter: false
    };
    
    expect(calculateBackoffDelay(0, config)).toBe(1000);
    expect(calculateBackoffDelay(1, config)).toBe(2000);
    expect(calculateBackoffDelay(2, config)).toBe(4000);
  });

  it('should respect max delay', () => {
    const config = {
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 2000,
      backoffMultiplier: 2,
      jitter: false
    };
    
    expect(calculateBackoffDelay(2, config)).toBe(2000); // Should be 4000 but capped
  });
});
