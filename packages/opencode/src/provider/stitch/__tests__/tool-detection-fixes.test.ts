
/**
 * Tests for Tool Detection Fixes
 * 
 * Verifies that write_file and execute tools are properly detected and mapped
 */

import { describe, it, expect } from 'bun:test';
import { UniversalXmlParser } from '../state-machine-parser';

describe('Tool Detection Fixes', () => {

  it('should detect and parse <write_file> tool call', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<write_file><path>test.ts</path><content>console.log("hello");</content></write_file>'
    );

    expect(result.content).toBe('');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe('write');

    const args = JSON.parse(result.toolCalls[0].args);
    expect(args.filePath).toBe('test.ts');
    expect(args.content).toBe('console.log("hello");');
  });

  it('should detect and parse <execute> tool call', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<execute><command>npm test</command></execute>'
    );

    expect(result.content).toBe('');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe('bash');

    const args = JSON.parse(result.toolCalls[0].args);
    expect(args.command).toBe('npm test');
    expect(args.description).toBeDefined();
  });

  it('should auto-generate description for write tool', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<write_file><path>src/app.ts</path><content>code</content></write_file>'
    );

    const args = JSON.parse(result.toolCalls[0].args);
    expect(args.filePath).toBeDefined();
  });

  it('should auto-generate description for bash tool', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<execute_command><command>ls -la</command></execute_command>'
    );

    const args = JSON.parse(result.toolCalls[0].args);
    expect(args.description).toBe('ls -la');
  });

  it('should handle write_file with file_path argument', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<write_file><file_path>test.txt</file_path><content>data</content></write_file>'
    );

    const args = JSON.parse(result.toolCalls[0].args);
    expect(args.filePath).toBe('test.txt');
    expect(args.content).toBe('data');
  });

  it('should handle execute with cmd argument', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<execute><cmd>pwd</cmd></execute>'
    );

    const args = JSON.parse(result.toolCalls[0].args);
    expect(args.command).toBe('pwd');
  });

  it('should NOT detect write_file as regular text anymore', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      'Here is the code: <write_file><path>app.js</path><content>code</content></write_file>'
    );

    // write_file should be intercepted, not in content
    expect(result.content).not.toContain('<write_file>');
    expect(result.content).toBe('Here is the code: ');
    expect(result.toolCalls).toHaveLength(1);
  });

  it('should NOT detect execute as regular text anymore', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      'Running command: <execute><command>npm start</command></execute>'
    );

    // execute should be intercepted, not in content
    expect(result.content).not.toContain('<execute>');
    expect(result.content).toBe('Running command: ');
    expect(result.toolCalls).toHaveLength(1);
  });

  it('should handle multiple tool calls including write_file and execute', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<write_file><path>test.js</path><content>code</content></write_file><execute><command>node test.js</command></execute>'
    );

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].toolName).toBe('write');
    expect(result.toolCalls[1].toolName).toBe('bash');
  });

  // New tests for sed/str_replace mappings
  it('should detect and parse <sed> as edit tool', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<sed><path>test.ts</path><old>foo</old><new>bar</new></sed>'
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe('edit');

    const args = JSON.parse(result.toolCalls[0].args);
    expect(args.filePath).toBe('test.ts');
    expect(args.oldString).toBe('foo');
    expect(args.newString).toBe('bar');
  });

  it('should detect and parse <str_replace> as edit tool', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<str_replace><path>test.ts</path><old_str>hello</old_str><new_str>world</new_str></str_replace>'
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe('edit');

    const args = JSON.parse(result.toolCalls[0].args);
    expect(args.filePath).toBe('test.ts');
    expect(args.oldString).toBe('hello');
    expect(args.newString).toBe('world');
  });

  it('should detect and parse <search_and_replace> as edit tool', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<search_and_replace><path>test.ts</path><search>old_code</search><replace>new_code</replace></search_and_replace>'
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe('edit');

    const args = JSON.parse(result.toolCalls[0].args);
    expect(args.filePath).toBe('test.ts');
    expect(args.oldString).toBe('old_code');
    expect(args.newString).toBe('new_code');
  });

  it('should detect <invoke> format tool calls', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<invoke name="write_file"><parameter name="path">test.ts</parameter><parameter name="content">hello</parameter></invoke>'
    );

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe('write');

    const args = JSON.parse(result.toolCalls[0].args);
    expect(args.filePath).toBe('test.ts');
    expect(args.content).toBe('hello');
  });

  it('should extract tool calls from flush on stream end', () => {
    const parser = new UniversalXmlParser();

    // Simulate partial stream chunks
    const result1 = parser.parseStreamChunk('<write_file><path>test.ts</path>');
    expect(result1.toolCalls).toHaveLength(0); // Not complete yet

    const result2 = parser.parseStreamChunk('<content>code</content></write_file>');

    // Should have been extracted now
    expect(result2.toolCalls).toHaveLength(1);
    expect(result2.toolCalls[0].toolName).toBe('write');
  });

  it('should handle flush with incomplete tool call', () => {
    const parser = new UniversalXmlParser();

    // Simulate incomplete tool call at stream end
    parser.parseStreamChunk('<bash><command>ls -la</command>');
    const flushed = parser.flush();

    // Flush should extract the incomplete tool call
    expect(flushed.toolCalls).toHaveLength(1);
    expect(flushed.toolCalls[0].toolName).toBe('bash');

    const args = JSON.parse(flushed.toolCalls[0].args);
    expect(args.command).toBe('ls -la');
  });

  it('should strip <function_calls> wrappers', () => {
    const parser = new UniversalXmlParser();
    const result = parser.parseStreamChunk(
      '<function_calls><write_file><path>test.ts</path><content>code</content></write_file></function_calls>'
    );

    expect(result.content).toBe('');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe('write');
  });
});
