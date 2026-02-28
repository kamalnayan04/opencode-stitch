// @ts-nocheck

/**
 * State Machine XML Parser Tests
 * 
 * Comprehensive test suite for the StateMachineXmlParser that validates:
 * - Chunk boundary splitting (<gre + p>)
 * - Hyphenated tag names (search-term, file-pattern)
 * - Nested JSON arrays in parameters
 * - System tag exclusion (thinking, attempt_completion)
 * - Error recovery from malformed XML
 * - Performance requirements (< 1ms per chunk)
 */

import { describe, it, expect } from 'bun:test';
import { StateMachineXmlParser } from '../state-machine-parser';

describe('StateMachineXmlParser', () => {
  
  describe('Basic Tool Call Parsing', () => {
    it('should parse simple tool call', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk('<grep><search_term>foo</search_term></grep>');
      
      expect(result.content).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].function.name).toBe('grep');
      
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args.pattern).toBe('foo'); // Mapped from search_term
    });
    
    it('should parse tool call with multiple parameters', () => {
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
    
    it('should separate text content from tool calls', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        'Let me search for that.\n<grep><search_term>test</search_term></grep>\nFound it!'
      );
      
      expect(result.content).toContain('Let me search for that.');
      expect(result.content).toContain('Found it!');
      expect(result.content).not.toContain('<grep>');
      expect(result.toolCalls).toHaveLength(1);
    });
  });
  
  describe('Chunk Boundary Handling', () => {
    it('should handle tool call split across chunks - basic', () => {
      const parser = new StateMachineXmlParser();
      
      // Chunk 1: Opening tag split
      const result1 = parser.parseStreamChunk('<gre');
      expect(result1.content).toBe('');
      expect(result1.toolCalls).toHaveLength(0);
      
      // Chunk 2: Complete the tag and content
      const result2 = parser.parseStreamChunk('p><search_term>foo</search_term></grep>');
      expect(result2.toolCalls).toHaveLength(1);
      expect(result2.toolCalls[0].function.name).toBe('grep');
    });
    
    it('should handle parameter tag split across chunks', () => {
      const parser = new StateMachineXmlParser();
      
      const result1 = parser.parseStreamChunk('<grep><search_te');
      expect(result1.toolCalls).toHaveLength(0);
      
      const result2 = parser.parseStreamChunk('rm>test</search_term></grep>');
      expect(result2.toolCalls).toHaveLength(1);
      
      const args = JSON.parse(result2.toolCalls[0].function.arguments);
      expect(args.pattern).toBe('test');
    });
    
    it('should handle parameter value split across chunks', () => {
      const parser = new StateMachineXmlParser();
      
      const result1 = parser.parseStreamChunk('<grep><search_term>very_long_se');
      expect(result1.toolCalls).toHaveLength(0);
      
      const result2 = parser.parseStreamChunk('arch_pattern</search_term></grep>');
      expect(result2.toolCalls).toHaveLength(1);
      
      const args = JSON.parse(result2.toolCalls[0].function.arguments);
      expect(args.pattern).toBe('very_long_search_pattern');
    });
  });
  
  describe('Hyphenated Tag Names', () => {
    it('should parse tags with hyphens - search-term', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<grep><search-term>pattern</search-term></grep>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args['search-term']).toBe('pattern');
    });
    
    it('should parse tags with hyphens - file-pattern', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<search_files><file-pattern>*.ts</file-pattern></search_files>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args['file-pattern']).toBe('*.ts');
    });
    
    it('should parse tags with hyphens - start-line and end-line', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<apply_diff><start-line>10</start-line><end-line>20</end-line></apply_diff>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args['start-line']).toBe(10); // Parsed as number
      expect(args['end-line']).toBe(20);
    });
  });
  
  describe('Nested JSON Handling', () => {
    it('should parse JSON array in parameter', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<task><items>["item1", "item2", "item3"]</items></task>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args.items).toEqual(['item1', 'item2', 'item3']);
    });
    
    it('should parse nested JSON object in parameter', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<task><config>{"timeout": 5000, "retry": true}</config></task>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args.config).toEqual({ timeout: 5000, retry: true });
    });
    
    it('should parse complex nested JSON with arrays and objects', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<task><data>{"users": [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]}</data></task>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args.data.users).toHaveLength(2);
      expect(args.data.users[0].name).toBe('Alice');
    });
  });
  
  describe('System Tag Exclusion', () => {
    it('should NOT parse <thinking> as tool call', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<thinking>Let me analyze this...</thinking>'
      );
      
      expect(result.toolCalls).toHaveLength(0);
      expect(result.content).toContain('<thinking>');
      expect(result.content).toContain('Let me analyze this...');
    });
    
    it('should NOT parse <attempt_completion> as tool call', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<attempt_completion><result>Task complete</result></attempt_completion>'
      );
      
      expect(result.toolCalls).toHaveLength(0);
      expect(result.content).toContain('<attempt_completion>');
    });
    
    it('should parse tool calls but exclude system tags', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<thinking>Planning...</thinking>\n<grep><search_term>test</search_term></grep>\n<result>Done</result>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].function.name).toBe('grep');
      expect(result.content).toContain('<thinking>');
      expect(result.content).toContain('<result>');
    });
  });
  
  describe('Type Inference', () => {
    it('should parse boolean values', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<search_files><case_sensitive>true</case_sensitive><recursive>false</recursive></search_files>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args.case_sensitive).toBe(true);
      expect(args.recursive).toBe(false);
    });
    
    it('should parse number values', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<task><priority>5</priority><timeout>30000</timeout></task>'
      );
      
      expect(result.toolCalls).toHaveLength(1);
      const args = JSON.parse(result.toolCalls[0].function.arguments);
      expect(args.priority).toBe(5);
      expect(args.timeout).toBe(30000);
    });
  });
  
  describe('Error Recovery', () => {
    it('should handle malformed XML gracefully', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<grep><search_term>test</search_term'
      );
      
      // Should not crash, may emit partial content
      expect(() => parser.flush()).not.toThrow();
    });
    
    it('should recover from mismatched closing tags', () => {
      const parser = new StateMachineXmlParser();
      const result = parser.parseStreamChunk(
        '<grep><search_term>test</wrong_tag></grep>'
      );
      
      // Should handle gracefully
      expect(() => parser.flush()).not.toThrow();
    });
    
    it('should handle unclosed tags at stream end', () => {
      const parser = new StateMachineXmlParser();
      parser.parseStreamChunk('<grep><search_term>test');
      
      const flushed = parser.flush();
      // Should not crash
      expect(flushed).toBeDefined();
    });
  });
  
  describe('Performance', () => {
    it('should parse chunks in < 1ms', () => {
      const parser = new StateMachineXmlParser();
      const largeChunk = '<grep><search_term>' + 'x'.repeat(1000) + '</search_term></grep>';
      
      const start = performance.now();
      parser.parseStreamChunk(largeChunk);
      const duration = performance.now() - start;
      
      expect(duration).toBeLessThan(1);
    });
    
    it('should handle multiple tool calls efficiently', () => {
      const parser = new StateMachineXmlParser();
      const multipleTools = [
        '<grep><search_term>test1</search_term></grep>',
        '<read><filePath>/path1</filePath></read>',
        '<grep><search_term>test2</search_term></grep>',
        '<write><filePath>/path2</filePath><content>data</content></write>',
        '<grep><search_term>test3</search_term></grep>'
      ].join('\n');
      
      const start = performance.now();
      const result = parser.parseStreamChunk(multipleTools);
      const duration = performance.now() - start;
      
      expect(result.toolCalls).toHaveLength(5);
      expect(duration).toBeLessThan(5); // < 1ms per tool call
    });
  });
  
  describe('Flush Behavior', () => {
    it('should return remaining content on flush', () => {
      const parser = new StateMachineXmlParser();
      parser.parseStreamChunk('Some text ');
      
      const flushed = parser.flush();
      expect(flushed.content).toContain('Some text');
    });
    
    it('should attempt to complete partial tool call on flush', () => {
      const parser = new StateMachineXmlParser();
      parser.parseStreamChunk('<grep><search_term>test</search_term></grep>');
      
      const flushed = parser.flush();
      expect(flushed.toolCalls).toHaveLength(1);
    });
    
    it('should reset state after flush', () => {
      const parser = new StateMachineXmlParser();
      parser.parseStreamChunk('test');
      parser.flush();
      
      // Should be able to parse again
      const result = parser.parseStreamChunk('<grep><search_term>new</search_term></grep>');
      expect(result.toolCalls).toHaveLength(1);
    });
  });
  
  describe('Real-World Scenarios', () => {
    it('should handle complete assistant response with thinking and tool call', () => {
      const parser = new StateMachineXmlParser();
      const response = `<thinking>
I need to search for the authentication logic in the codebase.
</thinking>

Let me search for that.

<grep>
<search_term>authenticate</search_term>
<case_sensitive>false</case_sensitive>
</grep>`;
      
      const result = parser.parseStreamChunk(response);
      
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].function.name).toBe('grep');
      expect(result.content).toContain('<thinking>');
      expect(result.content).toContain('Let me search for that.');
    });
    
    it('should handle streaming response with multiple chunks', () => {
      const parser = new StateMachineXmlParser();
      
      const chunk1 = 'I\'ll help you with that.\n\n<gre';
      const chunk2 = 'p>\n<search_term>authentication</sear';
      const chunk3 = 'ch_term>\n<case_sensitive>false</case';
      const chunk4 = '_sensitive>\n</grep>\n\nSearching now...';
      
      const result1 = parser.parseStreamChunk(chunk1);
      const result2 = parser.parseStreamChunk(chunk2);
      const result3 = parser.parseStreamChunk(chunk3);
      const result4 = parser.parseStreamChunk(chunk4);
      
      // Tool call should be emitted when complete
      expect(result4.toolCalls).toHaveLength(1);
      expect(result1.content + result2.content + result3.content + result4.content)
        .toContain('I\'ll help you with that.');
    });
  });
});
