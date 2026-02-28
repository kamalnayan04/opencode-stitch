// @ts-nocheck

/**
 * Function Calls Format Test - Verify <function_calls><invoke> format is parsed correctly
 * 
 * This test verifies support for the actual Stitch XML format:
 * <function_calls>
 *   <invoke name="tool_name">
 *     <parameter name="arg_name">value</parameter>
 *   </invoke>
 * </function_calls>
 */

import { describe, it, expect } from 'bun:test';
import { createStitchStreamTransformer } from '../stream';

describe('Function Calls Format (<function_calls><invoke>)', () => {
  
  it('should parse write_file in function_calls format', async () => {
    const xmlContent = `<function_calls>
<invoke name="write_file">
<parameter name="path">deeplink-verifier/src/capture/activity_capture.py</parameter>
<parameter name="content">print("Hello World")</parameter>
</invoke>
</function_calls>`;
    
    const ndjsonChunk = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: xmlContent }]
          }]
        }
      }
    }) + '\n';
    
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ndjsonChunk));
        controller.close();
      }
    });
    
    const transformer = createStitchStreamTransformer();
    const transformed = readable.pipeThrough(transformer);
    const reader = transformed.getReader();
    
    const outputs: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outputs.push(new TextDecoder().decode(value));
    }
    
    const combined = outputs.join('');
    const dataLines = combined.split('\n').filter(line => line.startsWith('data: ') && !line.includes('[DONE]'));
    
    // Parse the tool call
    const toolCallLine = dataLines.find(line => line.includes('tool_calls'));
    expect(toolCallLine).toBeDefined();
    
    if (toolCallLine) {
      const parsed = JSON.parse(toolCallLine.substring(6));
      const toolCall = parsed.choices[0].delta.tool_calls[0];
      
      // Verify tool name is mapped
      expect(toolCall.function.name).toBe('write'); // write_file → write
      
      const args = JSON.parse(toolCall.function.arguments);
      // Verify argument mapping: path → filePath
      expect(args.filePath).toBe('deeplink-verifier/src/capture/activity_capture.py');
      expect(args.path).toBeUndefined();
      expect(args.content).toBe('print("Hello World")');
    }
  });
  
  it('should parse read_file in function_calls format', async () => {
    const xmlContent = `<function_calls>
<invoke name="read_file">
<parameter name="path">deeplink-verifier/src/automation/device_manager.py</parameter>
<parameter name="start_line">220</parameter>
<parameter name="end_line">280</parameter>
</invoke>
</function_calls>`;
    
    const ndjsonChunk = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: xmlContent }]
          }]
        }
      }
    }) + '\n';
    
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ndjsonChunk));
        controller.close();
      }
    });
    
    const transformer = createStitchStreamTransformer();
    const transformed = readable.pipeThrough(transformer);
    const reader = transformed.getReader();
    
    const outputs: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outputs.push(new TextDecoder().decode(value));
    }
    
    const combined = outputs.join('');
    const dataLines = combined.split('\n').filter(line => line.startsWith('data: ') && !line.includes('[DONE]'));
    
    // Parse the tool call
    const toolCallLine = dataLines.find(line => line.includes('tool_calls'));
    expect(toolCallLine).toBeDefined();
    
    if (toolCallLine) {
      const parsed = JSON.parse(toolCallLine.substring(6));
      const toolCall = parsed.choices[0].delta.tool_calls[0];
      
      // Verify tool name is mapped: read_file → read
      expect(toolCall.function.name).toBe('read');
      
      const args = JSON.parse(toolCall.function.arguments);
      // Verify argument mapping: path → filePath
      expect(args.filePath).toBe('deeplink-verifier/src/automation/device_manager.py');
      expect(args.path).toBeUndefined();
      // Verify numeric parameters are parsed
      expect(args.start_line).toBe(220);
      expect(args.end_line).toBe(280);
    }
  });
  
  it('should handle mixed text and function_calls format', async () => {
    const mixedContent = `I'll write that file for you.

<function_calls>
<invoke name="write_file">
<parameter name="path">test.txt</parameter>
<parameter name="content">Test content</parameter>
</invoke>
</function_calls>

File created successfully!`;
    
    const ndjsonChunk = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: mixedContent }]
          }]
        }
      }
    }) + '\n';
    
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ndjsonChunk));
        controller.close();
      }
    });
    
    const transformer = createStitchStreamTransformer();
    const transformed = readable.pipeThrough(transformer);
    const reader = transformed.getReader();
    
    const outputs: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outputs.push(new TextDecoder().decode(value));
    }
    
    const combined = outputs.join('');
    
    // Should have both text content and tool call
    expect(combined).toContain('I\'ll write that file for you');
    expect(combined).toContain('File created successfully');
    expect(combined).toContain('tool_calls');
    expect(combined).toContain('"name":"write"');
  });
  
  it('should handle function_calls with boolean and number parameters', async () => {
    const xmlContent = `<function_calls>
<invoke name="search_files">
<parameter name="path">src/</parameter>
<parameter name="regex">test.*file</parameter>
<parameter name="case_sensitive">true</parameter>
<parameter name="max_results">10</parameter>
</invoke>
</function_calls>`;
    
    const ndjsonChunk = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: xmlContent }]
          }]
        }
      }
    }) + '\n';
    
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ndjsonChunk));
        controller.close();
      }
    });
    
    const transformer = createStitchStreamTransformer();
    const transformed = readable.pipeThrough(transformer);
    const reader = transformed.getReader();
    
    const outputs: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outputs.push(new TextDecoder().decode(value));
    }
    
    const combined = outputs.join('');
    const dataLines = combined.split('\n').filter(line => line.startsWith('data: ') && !line.includes('[DONE]'));
    
    // Parse the tool call
    const toolCallLine = dataLines.find(line => line.includes('tool_calls'));
    expect(toolCallLine).toBeDefined();
    
    if (toolCallLine) {
      const parsed = JSON.parse(toolCallLine.substring(6));
      const args = JSON.parse(parsed.choices[0].delta.tool_calls[0].function.arguments);
      
      // Verify type conversions
      expect(args.case_sensitive).toBe(true); // boolean
      expect(args.max_results).toBe(10); // number
      expect(typeof args.path).toBe('string');
      // Verify argument mapping: regex → pattern
      expect(args.pattern).toBe('test.*file');
      expect(args.regex).toBeUndefined();
    }
  });
  
  it('should still support legacy format alongside function_calls format', async () => {
    const legacyXml = `<read_file>
<path>legacy.txt</path>
</read_file>`;
    
    const ndjsonChunk = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: legacyXml }]
          }]
        }
      }
    }) + '\n';
    
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ndjsonChunk));
        controller.close();
      }
    });
    
    const transformer = createStitchStreamTransformer();
    const transformed = readable.pipeThrough(transformer);
    const reader = transformed.getReader();
    
    const outputs: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outputs.push(new TextDecoder().decode(value));
    }
    
    const combined = outputs.join('');
    
    // Legacy format should still work
    expect(combined).toContain('tool_calls');
    expect(combined).toContain('"name":"read"');
    // Arguments are JSON-stringified, so they have escaped quotes
    expect(combined).toContain('\\"filePath\\":\\"legacy.txt\\"');
  });
});
