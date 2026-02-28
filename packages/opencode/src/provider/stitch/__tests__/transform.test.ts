// @ts-nocheck

/**
 * Tests for XML ↔ JSON Tool Calling Adapter (transform.ts)
 */

import { describe, it, expect } from 'bun:test';
import { StateMachineXmlParser } from '../state-machine-parser';

describe('XmlToolParser', () => {
  describe('parseStreamChunk', () => {
    it('should parse simple XML tool call', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk('<grep><search_term>foo</search_term></grep>');
      
      expect(result.content).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].type).toBe('function');
      expect(result.toolCalls[0].function.name).toBe('grep');
      expect(result.toolCalls[0].id).toMatch(/^call_\d+_[a-z0-9]+$/);
      
      // Verify argument mapping: search_term → pattern
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args.pattern).toBe('foo');
    });

    it('should parse XML with multiple arguments', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<read><filePath>/path/to/file.ts</filePath><offset>10-20</offset></read>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].function.name).toBe('read');
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args.filePath).toBe('/path/to/file.ts');
      expect(args.offset).toBe('10-20');
    });

    it('should handle boolean and number types', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<task><enabled>true</enabled><priority>5</priority></task>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args.enabled).toBe(true);
      expect(args.priority).toBe(5);
    });

    it('should separate content from tool calls', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        'Here is some text <grep><search_term>foo</search_term></grep> and more text'
      );
      
      expect(result.content).toBe('Here is some text  and more text');
      expect(result.toolCalls).toHaveLength(1);
    });

    it('should handle partial XML across chunks', () => {
      const parser = new StateMachineXmlParser();
      
      // First chunk - partial opening tag
      const result1 = parser.parseStreamChunk('<grep><search');
      expect(result1.content).toBe('');
      expect(result1.toolCalls).toHaveLength(0);
      
      // Second chunk - complete the tag
      const result2 = parser.parseStreamChunk('_term>foo</search_term></grep>');
      expect(result2.content).toBe('');
      expect(result2.toolCalls).toHaveLength(1);
      expect(result2.toolCalls[0].function.name).toBe('grep');
    });

    it('should handle multiple sequential tool calls', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<grep><pattern>foo</pattern></grep><read><filePath>test.ts</filePath></read>'
      );
      
      expect(result.content).toBe('');
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].function.name).toBe('grep');
      expect(result.toolCalls[1].function.name).toBe('read');
    });

    it('should handle function_calls format', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<function_calls><invoke name="grep"><parameter name="search_term">foo</parameter></invoke></function_calls>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].function.name).toBe('grep');
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      // Verify argument mapping: search_term → pattern for grep
      expect(args.pattern).toBe('foo');
    });

    it('should NOT intercept system tags', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<thinking>This is reasoning</thinking><grep><pattern>foo</pattern></grep>'
      );
      
      // thinking tag should pass through as content
      expect(result.content).toContain('<thinking>This is reasoning</thinking>');
      // But grep should be intercepted
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].function.name).toBe('grep');
    });

    it('should handle malformed XML gracefully', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk('<grep><unclosed>');
      
      // Malformed XML should not crash, just buffer
      expect(result.content).toBe('');
      expect(result.toolCalls).toHaveLength(0);
    });
  });

  describe('flush', () => {
    it('should return flush result without crashing', () => {
      const parser = new StateMachineXmlParser();
      
      // Parse some content
      parser.parseStreamChunk('Some text');
      
      // Flush should not crash and should return an object with correct structure
      const result = parser.flush();
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('toolCalls');
      expect(result.toolCalls).toBeInstanceOf(Array);
    });

    it('should clear state after flush', () => {
      const parser = new StateMachineXmlParser();
      
      // Parse content and flush
      parser.parseStreamChunk('Some text');
      parser.flush();
      
      // Subsequent parsing should work normally
      const result = parser.parseStreamChunk('<grep><pattern>foo</pattern></grep>');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].function.name).toBe('grep');
    });
  });
});
