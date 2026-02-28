/**
 * Gemini ↔ OpenCode Response Transformations
 * 
 * This module handles bidirectional transformation of response objects:
 * 1. geminiToOpenCodeResponse: Gemini → OpenCode
 * 2. openCodeToGeminiResponse: OpenCode → Gemini
 * 
 * Transformation Rules:
 * 
 * Gemini → OpenCode:
 * - Use first candidate only
 * - Extract all parts[].text and concatenate
 * - Map finishReason → finish_reason (lowercase)
 * - Map usage: promptTokenCount → prompt_tokens
 * - Map usage: candidatesTokenCount → completion_tokens
 * - Map usage: totalTokenCount → total_tokens
 * - Generate synthetic id and object type
 * 
 * OpenCode → Gemini:
 * - Use first choice only
 * - Convert message to { role: "model", parts: [{ text: content }] }
 * - Map usage fields appropriately
 * - Map finish_reason → finishReason (uppercase)
 */

import type {
  GeminiResponse,
  GeminiResponseCandidate,
  GeminiUsageMetadata,
  OpenCodeResponse,
  OpenCodeChoice,
  OpenCodeUsage,
} from './types';

/**
 * Transform Gemini response to OpenCode format
 * 
 * @param geminiRes - Gemini API response object
 * @returns OpenCode-compatible response object
 * @throws Error if no candidates in response
 * 
 * @example
 * ```typescript
 * const geminiRes: GeminiResponse = {
 *   candidates: [{
 *     content: {
 *       role: 'model',
 *       parts: [{ text: 'Hello! How can I help?' }]
 *     },
 *     finishReason: 'STOP'
 *   }],
 *   usageMetadata: {
 *     promptTokenCount: 10,
 *     candidatesTokenCount: 20,
 *     totalTokenCount: 30
 *   }
 * };
 * 
 * const openCodeRes = geminiToOpenCodeResponse(geminiRes);
 * // Result: { id: '...', object: 'chat.completion', choices: [...], usage: {...} }
 * ```
 */
export function geminiToOpenCodeResponse(
  geminiRes: GeminiResponse
): OpenCodeResponse {
  // Use first candidate only (as per requirements)
  const candidate = geminiRes.candidates[0];
  
  if (!candidate) {
    throw new Error('Gemini response must contain at least one candidate');
  }
  
  // Extract and concatenate all text parts
  const content = candidate.content.parts
    .map(p => p.text)
    .filter(Boolean)
    .join('');
  
  // Map usage metadata if present
  const usage: OpenCodeUsage | undefined = geminiRes.usageMetadata ? {
    prompt_tokens: geminiRes.usageMetadata.promptTokenCount,
    completion_tokens: geminiRes.usageMetadata.candidatesTokenCount,
    total_tokens: geminiRes.usageMetadata.totalTokenCount
  } : undefined;
  
  // Generate synthetic ID (format: gemini-{timestamp}-{random})
  const id = `gemini-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  // Map finish reason (convert to lowercase if present)
  const finishReason = candidate.finishReason?.toLowerCase();
  
  return {
    id,
    object: "chat.completion",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content
      },
      finish_reason: finishReason
    }],
    usage
  };
}

/**
 * Transform OpenCode response to Gemini format
 * 
 * @param openCodeRes - OpenCode API response object
 * @returns Gemini-compatible response object
 * @throws Error if no choices in response
 * 
 * @example
 * ```typescript
 * const openCodeRes: OpenCodeResponse = {
 *   id: 'chatcmpl-123',
 *   object: 'chat.completion',
 *   choices: [{
 *     index: 0,
 *     message: {
 *       role: 'assistant',
 *       content: 'Hello! How can I help?'
 *     },
 *     finish_reason: 'stop'
 *   }],
 *   usage: {
 *     prompt_tokens: 10,
 *     completion_tokens: 20,
 *     total_tokens: 30
 *   }
 * };
 * 
 * const geminiRes = openCodeToGeminiResponse(openCodeRes);
 * // Result: { candidates: [...], usageMetadata: {...} }
 * ```
 */
export function openCodeToGeminiResponse(
  openCodeRes: OpenCodeResponse
): GeminiResponse {
  // Use first choice only (as per requirements)
  const choice = openCodeRes.choices[0];
  
  if (!choice) {
    throw new Error('OpenCode response must contain at least one choice');
  }
  
  // Build candidate with model role and text parts
  const candidate: GeminiResponseCandidate = {
    content: {
      role: "model",
      parts: [{ text: choice.message.content }]
    }
  };
  
  // Map finish reason (convert to uppercase if present)
  if (choice.finish_reason) {
    candidate.finishReason = choice.finish_reason.toUpperCase();
  }
  
  // Map usage metadata if present
  const usageMetadata: GeminiUsageMetadata | undefined = openCodeRes.usage ? {
    promptTokenCount: openCodeRes.usage.prompt_tokens,
    candidatesTokenCount: openCodeRes.usage.completion_tokens,
    totalTokenCount: openCodeRes.usage.total_tokens
  } : undefined;
  
  return {
    candidates: [candidate],
    usageMetadata
  };
}
