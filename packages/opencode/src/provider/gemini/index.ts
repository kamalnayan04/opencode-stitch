/**
 * Gemini ↔ OpenCode Transformer Library
 * 
 * Production-ready bidirectional transformer for converting between:
 * - Gemini CLI request/response format (Google Gemini API style)
 * - OpenCode CLI request/response format (OpenAI-style chat completions)
 * 
 * Features:
 * - ✅ Bidirectional transformations (4 directions)
 * - ✅ Streaming support for real-time responses
 * - ✅ Comprehensive validation and error handling
 * - ✅ Type-safe with strict TypeScript definitions
 * - ✅ Zero external dependencies
 * - ✅ Production-ready with extensive test coverage
 * 
 * @example Basic Request Transformation
 * ```typescript
 * import { geminiToOpenCodeRequest } from '@opencode/provider/gemini';
 * 
 * const geminiReq = {
 *   contents: [{ role: 'user', parts: [{ text: 'Hello!' }] }],
 *   generationConfig: { temperature: 0.7 }
 * };
 * 
 * const openCodeReq = geminiToOpenCodeRequest(geminiReq, 'gemini-pro');
 * ```
 * 
 * @example Basic Response Transformation
 * ```typescript
 * import { openCodeToGeminiResponse } from '@opencode/provider/gemini';
 * 
 * const openCodeRes = {
 *   id: 'chatcmpl-123',
 *   object: 'chat.completion',
 *   choices: [{ index: 0, message: { role: 'assistant', content: 'Hi!' }, finish_reason: 'stop' }]
 * };
 * 
 * const geminiRes = openCodeToGeminiResponse(openCodeRes);
 * ```
 * 
 * @example Streaming
 * ```typescript
 * import { transformGeminiStreamChunkToOpenCodeDelta } from '@opencode/provider/gemini';
 * 
 * for await (const chunk of geminiStream) {
 *   const delta = transformGeminiStreamChunkToOpenCodeDelta(chunk);
 *   console.log(delta.choices[0].delta.content);
 * }
 * ```
 * 
 * @module gemini
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  // Gemini types
  GeminiRequest,
  GeminiContent,
  GeminiContentPart,
  GeminiSystemInstruction,
  GeminiGenerationConfig,
  GeminiResponse,
  GeminiResponseCandidate,
  GeminiUsageMetadata,
  GeminiStreamChunk,
  
  // OpenCode types
  OpenCodeRequest,
  OpenCodeMessage,
  OpenCodeResponse,
  OpenCodeChoice,
  OpenCodeUsage,
  OpenCodeStreamDelta,
} from './types';

// ============================================================================
// REQUEST TRANSFORMATIONS
// ============================================================================

export {
  geminiToOpenCodeRequest,
  openCodeToGeminiRequest,
} from './request';

// ============================================================================
// RESPONSE TRANSFORMATIONS
// ============================================================================

export {
  geminiToOpenCodeResponse,
  openCodeToGeminiResponse,
} from './response';

// ============================================================================
// STREAMING TRANSFORMATIONS
// ============================================================================

export {
  transformGeminiStreamChunkToOpenCodeDelta,
  transformOpenCodeDeltaToGeminiStreamChunk,
  createGeminiToOpenCodeStreamTransformer,
  createOpenCodeToGeminiStreamTransformer,
} from './stream';

// ============================================================================
// VALIDATION AND ERROR HANDLING
// ============================================================================

export {
  GeminiTransformError,
  validateGeminiRequest,
  validateOpenCodeRequest,
  validateGeminiResponse,
  validateOpenCodeResponse,
  isGeminiRequest,
  isOpenCodeRequest,
  isGeminiResponse,
  isOpenCodeResponse,
} from './validation';

// ============================================================================
// ADAPTER (Provider Integration)
// ============================================================================

export {
  createGeminiAdapter,
  wrapGeminiModel,
  transformGeminiRequest,
  transformOpenCodeRequest,
  isGeminiModel,
  normalizeGeminiModelId,
  GEMINI_PROVIDER_METADATA,
  type GeminiModelOptions,
} from './adapter';

// ============================================================================
// VERSION
// ============================================================================

/**
 * Library version following semantic versioning
 */
export const VERSION = '1.0.0';

/**
 * Supported transformation directions
 */
export const TRANSFORMATIONS = [
  'gemini-to-opencode-request',
  'opencode-to-gemini-request',
  'gemini-to-opencode-response',
  'opencode-to-gemini-response',
] as const;

export type TransformationDirection = typeof TRANSFORMATIONS[number];
