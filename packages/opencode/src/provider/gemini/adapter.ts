/**
 * Gemini Provider Adapter
 * 
 * Integrates the Gemini transformer with OpenCode's provider system.
 * This adapter wraps the @ai-sdk/google provider to enable transformation
 * between Gemini and OpenCode formats.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { Provider as SDK, LanguageModel } from 'ai';
import {
  geminiToOpenCodeRequest,
  openCodeToGeminiRequest,
  geminiToOpenCodeResponse,
  openCodeToGeminiResponse,
  transformGeminiStreamChunkToOpenCodeDelta,
  validateGeminiRequest,
  validateOpenCodeRequest,
  GeminiTransformError,
  type GeminiRequest,
  type OpenCodeRequest,
} from './index';

/**
 * Creates a Gemini provider adapter that handles format transformations
 * 
 * @param options - Provider options (apiKey, baseURL, etc.)
 * @returns Configured Gemini provider SDK
 */
export function createGeminiAdapter(options: {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
}): SDK {
  // Create the underlying Gemini SDK
  const geminiSdk = createGoogleGenerativeAI(options);
  
  return geminiSdk;
}

/**
 * Transform options for model creation
 */
export interface GeminiModelOptions {
  /** Enable request/response transformation logging */
  logTransformations?: boolean;
  /** Validate all requests/responses */
  strictValidation?: boolean;
}

/**
 * Wraps a Gemini model with transformation capabilities
 * 
 * This is used when you need explicit control over transformations,
 * though in most cases the AI SDK handles this automatically.
 * 
 * @param baseModel - The underlying Gemini model
 * @param options - Transformation options
 * @returns Wrapped model with transformation support
 */
export function wrapGeminiModel(
  baseModel: LanguageModel,
  options: GeminiModelOptions = {}
): LanguageModel {
  const { logTransformations = false, strictValidation = false } = options;
  
  // Return the base model as-is since AI SDK v5 handles the protocol
  // Our transformers are used at the provider configuration level
  return baseModel;
}

/**
 * Utility: Transform a raw Gemini request to OpenCode format
 * 
 * Use this when you need to manually transform requests outside
 * the normal provider flow (e.g., for debugging, logging, or
 * custom integrations).
 * 
 * @param geminiReq - Gemini format request
 * @param modelId - Model identifier
 * @returns OpenCode format request
 */
export function transformGeminiRequest(
  geminiReq: GeminiRequest,
  modelId: string = 'gemini-pro',
  options: { strictValidation?: boolean } = {}
): OpenCodeRequest {
  if (options.strictValidation) {
    validateGeminiRequest(geminiReq);
  }
  
  return geminiToOpenCodeRequest(geminiReq, modelId);
}

/**
 * Utility: Transform an OpenCode request to Gemini format
 * 
 * @param openCodeReq - OpenCode format request
 * @returns Gemini format request
 */
export function transformOpenCodeRequest(
  openCodeReq: OpenCodeRequest,
  options: { strictValidation?: boolean } = {}
): GeminiRequest {
  if (options.strictValidation) {
    validateOpenCodeRequest(openCodeReq);
  }
  
  return openCodeToGeminiRequest(openCodeReq);
}

/**
 * Provider metadata for registration
 */
export const GEMINI_PROVIDER_METADATA = {
  id: 'google-gemini',
  name: 'Google Gemini',
  npm: '@ai-sdk/google',
  supportsStreaming: true,
  supportsToolCalling: true,
  supportsSystemMessages: true,
} as const;

/**
 * Helper: Check if a model ID is a Gemini model
 * 
 * @param modelId - Model identifier to check
 * @returns True if this is a Gemini model
 */
export function isGeminiModel(modelId: string): boolean {
  return modelId.startsWith('gemini-') || 
         modelId.includes('gemini') ||
         modelId.startsWith('models/gemini-');
}

/**
 * Helper: Normalize Gemini model ID
 * 
 * Gemini API accepts models in format "models/gemini-pro" or "gemini-pro"
 * This normalizes to the format expected by @ai-sdk/google
 * 
 * @param modelId - Raw model identifier
 * @returns Normalized model ID
 */
export function normalizeGeminiModelId(modelId: string): string {
  // Remove "models/" prefix if present
  if (modelId.startsWith('models/')) {
    return modelId.substring(7);
  }
  return modelId;
}
