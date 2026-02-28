
import { describe, it, expect } from 'bun:test';
import { createRobustnessLayer } from '../robustness';
import { DEFAULT_CONFIG } from '../robustness/types';

describe('Chaos Tests', () => {
  const robustness = createRobustnessLayer(DEFAULT_CONFIG);

  it('should handle garbage input gracefully', () => {
    const garbageInputs = [
      null,
      undefined,
      {},
      [],
      123,
      'string',
      { foo: 'bar' },
      { result: null },
      { result: { response: null } },
      { result: { response: { choices: 'not-array' } } },
      // Circular reference (might need careful handling if JSON.stringify used)
    ];

    for (const input of garbageInputs) {
      // transform should never throw
      expect(() => robustness.transform(input)).not.toThrow();
      
      const result = robustness.transform(input);
      // Should return a valid OpenAI structure or error object
      expect(result).toBeDefined();
      if (result.error) {
        expect(result.error).toBeDefined();
      } else {
        expect(Array.isArray(result.choices)).toBe(true);
      }
    }
  });

  it('should handle deeply nested large objects', () => {
    // Construct a deep object
    let deep: any = { content: [] };
    for (let i = 0; i < 1000; i++) {
      deep = { nested: deep };
    }
    
    // Pass as part of a Stitch response
    const input = {
      result: {
        response: {
          choices: [deep]
        }
      }
    };
    
    expect(() => robustness.transform(input)).not.toThrow();
  });
});
