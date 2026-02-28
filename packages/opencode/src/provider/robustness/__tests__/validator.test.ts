
import { describe, it, expect } from 'bun:test';
import { validateStitchResponse } from '../validator';

describe('validateStitchResponse', () => {
  it('should pass valid response with text content', () => {
    const valid = {
      result: {
        response: {
          choices: [
            {
              content: [
                { type: 'CONTENT_TYPE_TEXT', data: 'hello' }
              ],
              finish_reason: 'stop'
            }
          ],
          usage: { total_tokens: 10 }
        }
      }
    };
    
    const result = validateStitchResponse(valid);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.severity).toBe('minor');
  });

  it('should pass valid response with empty choices (e.g. initial stream)', () => {
    const valid = {
      result: {
        response: {
          choices: [],
          usage: {}
        }
      }
    };
    
    const result = validateStitchResponse(valid);
    expect(result.valid).toBe(true);
    expect(result.severity).not.toBe('critical');
  });

  it('should pass valid error response', () => {
    const errorResponse = {
      error: {
        code: 'RATE_LIMIT',
        message: 'Too many requests'
      }
    };
    
    const result = validateStitchResponse(errorResponse);
    expect(result.valid).toBe(true);
    expect(result.severity).toBe('minor');
  });

  it('should detect null data', () => {
    const result = validateStitchResponse(null);
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('critical');
    expect(result.issues[0].field).toBe('root');
  });

  it('should detect undefined data', () => {
    const result = validateStitchResponse(undefined);
    expect(result.valid).toBe(false);
    expect(result.severity).toBe('critical');
  });

  it('should detect missing result object', () => {
    const invalid = { foo: 'bar' };
    const result = validateStitchResponse(invalid);
    expect(result.valid).toBe(false); // Can't proceed if structure is totally wrong
    expect(result.severity).toBe('critical');
    expect(result.issues[0].field).toBe('result');
  });

  it('should detect missing choices array', () => {
    const invalid = {
      result: {
        response: {
          choices: null // Should be array
        }
      }
    };
    
    const result = validateStitchResponse(invalid);
    // This is technically recoverable (treat as empty), but still an issue
    expect(result.valid).toBe(true); 
    expect(result.issues.some(i => i.field === 'choices')).toBe(true);
    // Severity depends on recoverability logic
    expect(result.severity).not.toBe('critical');
  });
});
