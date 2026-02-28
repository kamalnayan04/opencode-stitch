// @ts-nocheck

/**
 * System Tags Test - Verify system/message tags are NOT intercepted as tool calls
 * 
 * CRITICAL: This test verifies the fix for the "loader spinning forever" bug
 * where <attempt_completion> was being intercepted as a tool call instead of
 * being passed through as regular message content.
 */

import { describe, it, expect } from 'bun:test';
import { createStitchStreamTransformer } from '../stream';

describe('System Tags - Should NOT Be Intercepted', () => {
  
  it('should NOT intercept <attempt_completion> as a tool call', async () => {
    const messageWithCompletion = `I've completed the task successfully.

<attempt_completion>
<result>
The feature has been implemented and tested.
</result>
</attempt_completion>`;
    
    const ndjsonChunk = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: messageWithCompletion }],
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
    
    // CRITICAL: Verify that attempt_completion is NOT converted to tool_calls
    expect(combined).not.toContain('tool_calls');
    expect(combined).not.toContain('"name":"attempt_completion"');
    
    // CRITICAL: Verify the text is passed through as regular content
    expect(combined).toContain('I\'ve completed the task successfully');
    expect(combined).toContain('<attempt_completion>');
    expect(combined).toContain('</attempt_completion>');
    
    // Verify [DONE] marker is emitted
    expect(combined).toContain('data: [DONE]');
  });
  
  it('should NOT intercept <thinking> tags', async () => {
    const messageWithThinking = `<thinking>
I need to analyze this problem first.
Let me break it down step by step.
</thinking>

Here's my analysis of the issue.`;
    
    const ndjsonChunk = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: messageWithThinking }]
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
    
    // Verify thinking is NOT converted to tool_calls
    expect(combined).not.toContain('"name":"thinking"');
    
    // Verify the thinking content is passed through as text
    expect(combined).toContain('<thinking>');
    expect(combined).toContain('I need to analyze this problem first');
  });
  
  it('should NOT intercept <result> or <error> tags', async () => {
    const messageWithSystemTags = `<result>
Success: Operation completed
</result>

<error>
Warning: Minor issue detected
</error>`;
    
    const ndjsonChunk = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: messageWithSystemTags }]
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
    
    // Verify system tags are NOT converted to tool_calls
    expect(combined).not.toContain('"name":"result"');
    expect(combined).not.toContain('"name":"error"');
    
    // Verify content is passed through
    expect(combined).toContain('<result>');
    expect(combined).toContain('<error>');
  });
  
  it('should still intercept actual tool calls like <read_file>', async () => {
    const messageWithToolCall = `Let me read that file for you.

<read_file>
<path>src/app.ts</path>
</read_file>`;
    
    const ndjsonChunk = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: messageWithToolCall }]
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
    
    // VERIFY: read_file SHOULD be intercepted as a tool call
    expect(combined).toContain('tool_calls');
    expect(combined).toContain('"name":"read"'); // mapped to 'read'
    // Arguments are JSON-stringified, so they have escaped quotes
    expect(combined).toContain('\\"filePath\\":\\"src/app.ts\\"');
    
    // VERIFY: XML should NOT appear in content
    const contentLines = combined.split('\n').filter(line => 
      line.startsWith('data: ') && 
      line.includes('"content"') && 
      !line.includes('tool_calls')
    );
    
    for (const line of contentLines) {
      const parsed = JSON.parse(line.substring(6));
      const content = parsed.choices[0].delta.content || '';
      expect(content).not.toContain('<read_file>');
    }
  });
  
  it('should handle mixed system tags and tool calls correctly', async () => {
    const mixedContent = `<thinking>
I'll read the file and complete the task.
</thinking>

Let me check that file.

<read_file>
<path>config.json</path>
</read_file>

<attempt_completion>
<result>
Task completed successfully.
</result>
</attempt_completion>`;
    
    const ndjsonChunk = JSON.stringify({
      result: {
        response: {
          choices: [{
            index: 0,
            content: [{ type: 'CONTENT_TYPE_TEXT', data: mixedContent }],
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
    
    // Verify read_file IS intercepted
    expect(combined).toContain('tool_calls');
    expect(combined).toContain('"name":"read"');
    
    // Verify system tags are NOT intercepted
    expect(combined).not.toContain('"name":"thinking"');
    expect(combined).not.toContain('"name":"attempt_completion"');
    
    // Verify system tags appear in content
    expect(combined).toContain('<thinking>');
    expect(combined).toContain('<attempt_completion>');
    expect(combined).toContain('</attempt_completion>');
  });
});
