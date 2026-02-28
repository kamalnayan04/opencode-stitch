// @ts-nocheck

/**
 * XML Tool Call Interceptor Tests
 * 
 * Tests for detecting and parsing XML tool calls from Stitch stream
 * and converting them to OpenAI tool_calls format.
 */

import { describe, it, expect } from 'bun:test';
import { createStitchStreamTransformer } from '../stream';

describe('XML Tool Call Interceptor', () => {
  
  it('should detect and parse simple XML tool call', async () => {
    const xmlContent = `<explore>
<info>Exploring the project structure</info>
<search_dir>/Users/demo/project</search_dir>
</explore>`;
    
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
    
    // Verify tool_calls format
    expect(combined).toContain('tool_calls');
    expect(combined).toContain('"name":"explore"');
    // Arguments are JSON-stringified, so they have escaped quotes
    expect(combined).toContain('\\"info\\":\\"Exploring the project structure\\"');
    expect(combined).toContain('\\"search_dir\\":\\"/Users/demo/project\\"');
  });
  
  it('should handle multiple XML tool calls in sequence', async () => {
    const xmlContent = `<grep>
<search_term>activity.*list</search_term>
<case_sensitive>false</case_sensitive>
</grep>
<read>
<file_path>/path/to/file.ts</file_path>
</read>`;
    
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
    
    // Should have two tool calls
    expect(combined).toContain('"name":"grep"');
    expect(combined).toContain('"name":"read"');
  });
  
  it('should handle mixed text and XML tool calls', async () => {
    const mixedContent = `I'll help you search for that.

<grep>
<search_term>function.*test</search_term>
</grep>

Here's what I found.`;
    
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
    expect(combined).toContain('I\'ll help you search');
    expect(combined).toContain('"name":"grep"');
    expect(combined).toContain('Here\'s what I found');
  });
  
  it('should handle boolean and number values in XML', async () => {
    const xmlContent = `<search_files>
<path>src/</path>
<regex>test.*file</regex>
<case_sensitive>true</case_sensitive>
<max_results>10</max_results>
</search_files>`;
    
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
    }
  });
  
  it.skip('should handle fragmented XML across chunks (known limitation: opening tag must not be split)', async () => {
    const chunk1 = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: '<explor' }]
          }]
        }
      }
    }) + '\n';
    
    const chunk2 = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: 'e>\n<path>/test</path>\n</explore>' }]
          }]
        }
      }
    }) + '\n';
    
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(chunk1));
        controller.enqueue(new TextEncoder().encode(chunk2));
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
    
    // Should successfully parse the fragmented XML
    expect(combined).toContain('"name":"explore"');
    expect(combined).toContain('"path":"/test"');
  });
  
  it('should not emit XML content as regular text', async () => {
    const xmlContent = `<read_file>
<path>src/app.ts</path>
</read_file>`;
    
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
    
    // XML should not appear in regular content deltas
    const contentLines = combined.split('\n').filter(line => 
      line.startsWith('data: ') && 
      line.includes('"content"') && 
      !line.includes('tool_calls')
    );
    
    for (const line of contentLines) {
      const parsed = JSON.parse(line.substring(6));
      const content = parsed.choices[0].delta.content || '';
      expect(content).not.toContain('<read_file>');
      expect(content).not.toContain('</read_file>');
    }
  });
  
  it('should handle malformed XML gracefully', async () => {
    const malformedXml = `<grep>
<search_term>test</search_term>
<!-- Missing closing tag -->`;
    
    const ndjsonChunk = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: malformedXml }],
            finish_reason: 'FINISH_REASON_STOP'
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
    
    // Should still emit [DONE] marker
    expect(combined).toContain('data: [DONE]');
  });
  
  it('should map read_file to read tool name', async () => {
    const xmlContent = `<read_file>
<path>src/index.ts</path>
</read_file>`;
    
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
      
      // Verify mapping: read_file → read
      expect(toolCall.function.name).toBe('read');
      
      const args = JSON.parse(toolCall.function.arguments);
      // Verify argument mapping: path → filePath
      expect(args.filePath).toBe('src/index.ts');
      expect(args.path).toBeUndefined();
    }
  });
  
  it('should map search_files to grep tool name', async () => {
    const xmlContent = `<search_files>
<path>src/</path>
<regex>function.*test</regex>
</search_files>`;
    
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
      
      // Verify mapping: search_files → grep
      expect(toolCall.function.name).toBe('grep');
      
      const args = JSON.parse(toolCall.function.arguments);
      expect(args.path).toBe('src/');
      // Verify argument mapping: regex → pattern
      expect(args.pattern).toBe('function.*test');
      expect(args.regex).toBeUndefined();
    }
  });
  
  it('should map execute_command to bash tool name', async () => {
    const xmlContent = `<execute_command>
<command>npm test</command>
</execute_command>`;
    
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
      
      // Verify mapping: execute_command → bash
      expect(toolCall.function.name).toBe('bash');
      
      const args = JSON.parse(toolCall.function.arguments);
      expect(args.command).toBe('npm test');
    }
  });
  
  it('should map write_to_file to write tool name', async () => {
    const xmlContent = `<write_to_file>
<path>test.txt</path>
<content>Hello World</content>
</write_to_file>`;
    
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
      
      // Verify mapping: write_to_file → write
      expect(toolCall.function.name).toBe('write');
      
      const args = JSON.parse(toolCall.function.arguments);
      // Verify argument mapping: path → filePath
      expect(args.filePath).toBe('test.txt');
      expect(args.path).toBeUndefined();
      expect(args.content).toBe('Hello World');
    }
  });
  
  it('should map apply_diff to edit tool name', async () => {
    const xmlContent = `<apply_diff>
<path>src/app.ts</path>
<diff>Some diff content</diff>
</apply_diff>`;
    
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
      
      // Verify mapping: apply_diff → edit
      expect(toolCall.function.name).toBe('edit');
      
      const args = JSON.parse(toolCall.function.arguments);
      // Verify argument mapping: path → filePath
      expect(args.filePath).toBe('src/app.ts');
      expect(args.path).toBeUndefined();
      expect(args.diff).toBe('Some diff content');
    }
  });
});
