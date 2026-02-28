/**
 * Gemini ↔ OpenCode Streaming Transformations
 * 
 * This module handles bidirectional transformation of streaming chunks:
 * 1. transformGeminiStreamChunkToOpenCodeDelta: Gemini stream → OpenCode delta
 * 2. transformOpenCodeDeltaToGeminiStreamChunk: OpenCode delta → Gemini stream
 * 
 * Streaming Assumptions:
 * - Gemini: Returns partial candidates[].content.parts[].text
 * - OpenCode: Returns choices[].delta.content
 * 
 * These transformers enable real-time streaming of responses in either format.
 */

import type {
  GeminiStreamChunk,
  OpenCodeStreamDelta,
} from './types';

/**
 * Transform Gemini stream chunk to OpenCode delta format
 * 
 * Extracts partial text content from Gemini's streaming format and
 * converts it to OpenCode's delta format for real-time streaming.
 * 
 * @param chunk - Gemini streaming chunk (partial response)
 * @returns OpenCode-compatible stream delta
 * 
 * @example
 * ```typescript
 * const geminiChunk: GeminiStreamChunk = {
 *   candidates: [{
 *     content: {
 *       parts: [{ text: 'Hello' }]
 *     }
 *   }]
 * };
 * 
 * const delta = transformGeminiStreamChunkToOpenCodeDelta(geminiChunk);
 * // Result: {
 * //   id: 'gemini-stream-...',
 * //   object: 'chat.completion.chunk',
 * //   choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }]
 * // }
 * ```
 */
export function transformGeminiStreamChunkToOpenCodeDelta(
  chunk: GeminiStreamChunk
): OpenCodeStreamDelta {
  // Extract content from first candidate's first part (if present)
  const content = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  
  // Extract finish reason if present
  const finishReason = chunk.candidates?.[0]?.finishReason;
  
  // Generate unique ID for this chunk
  const id = `gemini-stream-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  return {
    id,
    object: "chat.completion.chunk",
    choices: [{
      index: 0,
      delta: {
        // Only include role for first chunk (when content is present)
        ...(content ? { role: "assistant" as const } : {}),
        content
      },
      finish_reason: finishReason?.toLowerCase() ?? null
    }]
  };
}

/**
 * Transform OpenCode delta to Gemini stream chunk format
 * 
 * Converts OpenCode's streaming delta format back to Gemini's
 * partial response format for compatibility.
 * 
 * @param delta - OpenCode streaming delta
 * @returns Gemini-compatible stream chunk
 * 
 * @example
 * ```typescript
 * const delta: OpenCodeStreamDelta = {
 *   id: 'chatcmpl-stream-123',
 *   object: 'chat.completion.chunk',
 *   choices: [{
 *     index: 0,
 *     delta: { content: 'Hello' },
 *     finish_reason: null
 *   }]
 * };
 * 
 * const chunk = transformOpenCodeDeltaToGeminiStreamChunk(delta);
 * // Result: {
 * //   candidates: [{
 * //     content: { parts: [{ text: 'Hello' }] }
 * //   }]
 * // }
 * ```
 */
export function transformOpenCodeDeltaToGeminiStreamChunk(
  delta: OpenCodeStreamDelta
): GeminiStreamChunk {
  // Extract content from first choice's delta
  const choice = delta.choices[0];
  const content = choice?.delta?.content;
  const finishReason = choice?.finish_reason;
  
  // Build chunk structure
  const chunk: GeminiStreamChunk = {};
  
  // Only include candidates if we have content or finish reason
  if (content || finishReason) {
    chunk.candidates = [{
      ...(content ? {
        content: {
          parts: [{ text: content }]
        }
      } : {}),
      ...(finishReason ? {
        finishReason: finishReason.toUpperCase()
      } : {})
    }];
  }
  
  return chunk;
}

/**
 * Helper: Create a streaming transformer pipeline
 * 
 * Returns a TransformStream that converts Gemini chunks to OpenCode deltas
 * on-the-fly for use with ReadableStream.pipeThrough().
 * 
 * @returns TransformStream for Gemini → OpenCode streaming
 * 
 * @example
 * ```typescript
 * const geminiStream = getGeminiStreamFromAPI();
 * const openCodeStream = geminiStream
 *   .pipeThrough(createGeminiToOpenCodeStreamTransformer());
 * 
 * for await (const delta of openCodeStream) {
 *   console.log(delta.choices[0].delta.content);
 * }
 * ```
 */
export function createGeminiToOpenCodeStreamTransformer(): TransformStream<GeminiStreamChunk, OpenCodeStreamDelta> {
  return new TransformStream({
    transform(chunk, controller) {
      try {
        const delta = transformGeminiStreamChunkToOpenCodeDelta(chunk);
        controller.enqueue(delta);
      } catch (error) {
        controller.error(error);
      }
    }
  });
}

/**
 * Helper: Create a reverse streaming transformer pipeline
 * 
 * Returns a TransformStream that converts OpenCode deltas to Gemini chunks
 * on-the-fly for use with ReadableStream.pipeThrough().
 * 
 * @returns TransformStream for OpenCode → Gemini streaming
 * 
 * @example
 * ```typescript
 * const openCodeStream = getOpenCodeStreamFromAPI();
 * const geminiStream = openCodeStream
 *   .pipeThrough(createOpenCodeToGeminiStreamTransformer());
 * 
 * for await (const chunk of geminiStream) {
 *   console.log(chunk.candidates?.[0]?.content?.parts?.[0]?.text);
 * }
 * ```
 */
export function createOpenCodeToGeminiStreamTransformer(): TransformStream<OpenCodeStreamDelta, GeminiStreamChunk> {
  return new TransformStream({
    transform(delta, controller) {
      try {
        const chunk = transformOpenCodeDeltaToGeminiStreamChunk(delta);
        controller.enqueue(chunk);
      } catch (error) {
        controller.error(error);
      }
    }
  });
}
