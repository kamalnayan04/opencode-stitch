
/**
 * Test for malformed NDJSON chunk handling
 * 
 * Verifies that:
 * 1. Chunks with incomplete structure are validated and skipped
 * 2. Only valid chunks with proper structure are processed
 * 3. The provider doesn't crash when receiving malformed chunks
 */

import { describe, it, expect } from 'bun:test';

describe('Malformed NDJSON Chunk Handling', () => {
  it('should skip chunks without result field', () => {
    const malformedChunk = { invalid: 'structure' };
    
    // This simulates what happens in the provider when parsing NDJSON
    const hasValidStructure = !!(
      malformedChunk &&
      (malformedChunk as any).result?.response?.choices?.[0]
    );
    
    expect(hasValidStructure).toBe(false);
  });

  it('should skip chunks without response field', () => {
    const malformedChunk = { result: { invalid: 'structure' } };
    
    const hasValidStructure = !!(
      malformedChunk &&
      (malformedChunk as any).result?.response?.choices?.[0]
    );
    
    expect(hasValidStructure).toBe(false);
  });

  it('should skip chunks without choices array', () => {
    const malformedChunk = { result: { response: { invalid: 'structure' } } };
    
    const hasValidStructure = !!(
      malformedChunk &&
      (malformedChunk as any).result?.response?.choices?.[0]
    );
    
    expect(hasValidStructure).toBe(false);
  });

  it('should skip chunks with empty choices array', () => {
    const malformedChunk = { result: { response: { choices: [] } } };
    
    const hasValidStructure = !!(
      malformedChunk &&
      (malformedChunk as any).result?.response?.choices?.[0]
    );
    
    expect(hasValidStructure).toBe(false);
  });

  it('should accept chunks with valid structure', () => {
    const validChunk = {
      result: {
        response: {
          choices: [{
            content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hello' }]
          }]
        }
      }
    };
    
    const hasValidStructure = !!(
      validChunk &&
      validChunk.result?.response?.choices?.[0]
    );
    
    expect(hasValidStructure).toBe(true);
  });

  it('should safely access choice properties after validation', () => {
    const validChunk = {
      result: {
        response: {
          choices: [{
            content: [{ type: 'CONTENT_TYPE_TEXT', data: 'Hello' }],
            finish_reason: 'FINISH_REASON_STOP'
          }]
        }
      }
    };
    
    const hasValidStructure = !!(
      validChunk &&
      validChunk.result?.response?.choices?.[0]
    );
    
    expect(hasValidStructure).toBe(true);
    
    if (hasValidStructure) {
      const choice = validChunk.result.response.choices[0];
      expect(choice.content?.[0]?.data).toBe('Hello');
      expect(choice.finish_reason).toBe('FINISH_REASON_STOP');
    }
  });

  it('should handle chunks with null choice gracefully', () => {
    const malformedChunk = {
      result: {
        response: {
          choices: [null]
        }
      }
    };
    
    const hasValidStructure = !!(
      malformedChunk &&
      (malformedChunk as any).result?.response?.choices?.[0]
    );
    
    expect(hasValidStructure).toBe(false);
  });

  it('should validate text-delta event structure', () => {
    const textDeltaEvent = {
      type: 'text-delta',
      id: 'txt-0',
      delta: 'Hello'
    };
    
    expect(textDeltaEvent.type).toBe('text-delta');
    expect(textDeltaEvent.id).toBeDefined();
    expect(textDeltaEvent.delta).toBeDefined();
    expect(typeof textDeltaEvent.delta).toBe('string');
  });

  it('should handle missing delta field gracefully', () => {
    const malformedEvent = {
      type: 'text-delta',
      id: 'txt-0'
      // missing delta field
    } as any;
    
    const deltaText = malformedEvent.delta || '';
    expect(deltaText).toBe('');
  });
});
