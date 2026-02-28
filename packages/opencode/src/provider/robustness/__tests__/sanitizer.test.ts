
import { describe, it, expect } from 'bun:test';
import { sanitizeStitchResponse, DEFAULT_CONTEXT } from '../sanitizer';

describe('sanitizeStitchResponse', () => {
  it('should sanitize valid response', () => {
    const raw = {
      result: {
        response: {
          choices: [
            {
              index: 0,
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
    
    const sanitized = sanitizeStitchResponse(raw);
    
    expect(sanitized.choices).toHaveLength(1);
    expect(sanitized.choices[0].content).toHaveLength(1);
    expect(sanitized.choices[0].content[0].data).toBe('hello');
    expect(sanitized.usage.total_tokens).toBe(10);
  });

  it('should handle missing choices', () => {
    const raw = {
      result: {
        response: {}
      }
    };
    
    const sanitized = sanitizeStitchResponse(raw);
    
    expect(sanitized.choices).toHaveLength(0);
    expect(sanitized.usage).toEqual({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
  });

  it('should truncate oversized content', () => {
    const longString = 'a'.repeat(DEFAULT_CONTEXT.maxContentLength + 100);
    const raw = {
      result: {
        response: {
          choices: [
            {
              content: [
                { type: 'CONTENT_TYPE_TEXT', data: longString }
              ]
            }
          ]
        }
      }
    };
    
    const sanitized = sanitizeStitchResponse(raw);
    
    expect(sanitized.choices[0].content[0].data.length).toBeLessThan(longString.length);
    expect(sanitized.choices[0].content[0].data).toEndWith('[truncated]');
  });

  it('should filter disallowed content types', () => {
    const raw = {
      result: {
        response: {
          choices: [
            {
              content: [
                { type: 'CONTENT_TYPE_TEXT', data: 'allowed' },
                { type: 'CONTENT_TYPE_IMAGE', data: 'disallowed' }, // Not in default allowed set
                { type: 'CONTENT_TYPE_REASONING', data: 'allowed reasoning' }
              ]
            }
          ]
        }
      }
    };
    
    const sanitized = sanitizeStitchResponse(raw);
    
    expect(sanitized.choices[0].content).toHaveLength(2);
    expect(sanitized.choices[0].content.some(c => c.data === 'allowed')).toBe(true);
    expect(sanitized.choices[0].content.some(c => c.data === 'disallowed')).toBe(false);
  });

  it('should handle null data gracefully', () => {
    const sanitized = sanitizeStitchResponse(null);
    expect(sanitized.choices).toHaveLength(0);
    expect(sanitized.usage).toBeDefined();
  });
});
