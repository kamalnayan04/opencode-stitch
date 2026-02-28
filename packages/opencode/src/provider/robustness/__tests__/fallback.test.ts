
import { describe, it, expect } from 'bun:test';
import { generateFallbackResponse } from '../fallback';

describe('generateFallbackResponse', () => {
  it('should generate default error message', () => {
    const fallback = generateFallbackResponse({
      errorType: 'unknown_error',
      errorMessage: 'Something bad happened'
    });
    
    expect(fallback.choices[0].delta.content).toContain('Something bad happened');
    expect(fallback.error.code).toBe('UNKNOWN_ERROR');
    expect(fallback.error.recoverable).toBe(true);
  });

  it('should generate parse error message', () => {
    const fallback = generateFallbackResponse({
      errorType: 'parse_error',
      errorMessage: 'Invalid JSON'
    });
    
    expect(fallback.choices[0].delta.content).toContain('Unable to process the response format');
  });

  it('should generate missing content message with last valid content', () => {
    const fallback = generateFallbackResponse({
      errorType: 'missing_content',
      errorMessage: 'Stream ended',
      context: { lastValidContent: 'Hello world' }
    });
    
    expect(fallback.choices[0].delta.content).toContain('Hello world');
    expect(fallback.choices[0].delta.content).toContain('Response incomplete');
  });

  it('should generate circuit breaker open message', () => {
    const fallback = generateFallbackResponse({
      errorType: 'circuit_breaker_open',
      errorMessage: 'Circuit open'
    });
    
    expect(fallback.choices[0].delta.content).toContain('Service is temporarily unavailable');
  });
});
