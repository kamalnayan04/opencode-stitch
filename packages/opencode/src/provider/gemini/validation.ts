/**
 * Gemini ↔ OpenCode Validation and Error Handling
 * 
 * This module provides:
 * 1. Input validation for requests and responses
 * 2. Custom error types for transformation failures
 * 3. Type guards for runtime type checking
 * 4. Defensive null/undefined checks
 * 
 * All validation functions throw GeminiTransformError with descriptive
 * messages to help diagnose issues in production.
 */

import type {
  GeminiRequest,
  GeminiResponse,
  OpenCodeRequest,
  OpenCodeResponse,
} from './types';

/**
 * Custom error class for Gemini transformation failures
 * 
 * Provides structured error information with optional cause chain
 * for debugging complex transformation issues.
 */
export class GeminiTransformError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'GeminiTransformError';
    
    // Maintain proper stack trace for V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GeminiTransformError);
    }
  }
}

/**
 * Validate Gemini request structure
 * 
 * Ensures request meets minimum requirements:
 * - Is an object
 * - Has non-empty contents array
 * - Each content has valid role and non-empty parts
 * 
 * @param req - Request object to validate
 * @throws GeminiTransformError if validation fails
 * 
 * @example
 * ```typescript
 * try {
 *   validateGeminiRequest(req);
 *   // Safe to proceed with transformation
 * } catch (error) {
 *   console.error('Invalid request:', error.message);
 * }
 * ```
 */
export function validateGeminiRequest(req: unknown): asserts req is GeminiRequest {
  // Check if req is an object
  if (!req || typeof req !== 'object') {
    throw new GeminiTransformError('Request must be an object');
  }
  
  const r = req as Record<string, unknown>;
  
  // Check contents array exists
  if (!Array.isArray(r.contents)) {
    throw new GeminiTransformError('Request must have "contents" array');
  }
  
  // Check contents is not empty
  if (r.contents.length === 0) {
    throw new GeminiTransformError('Contents array cannot be empty');
  }
  
  // Validate each content item
  for (let i = 0; i < r.contents.length; i++) {
    const content = r.contents[i];
    
    if (!content || typeof content !== 'object') {
      throw new GeminiTransformError(`Content at index ${i} must be an object`);
    }
    
    const c = content as Record<string, unknown>;
    
    // Validate role
    if (c.role !== 'user' && c.role !== 'model') {
      throw new GeminiTransformError(
        `Invalid role at index ${i}: "${c.role}". Must be "user" or "model"`
      );
    }
    
    // Validate parts array
    if (!Array.isArray(c.parts)) {
      throw new GeminiTransformError(`Content at index ${i} must have "parts" array`);
    }
    
    if (c.parts.length === 0) {
      throw new GeminiTransformError(`Content at index ${i} has empty "parts" array`);
    }
    
    // Validate each part has at least one field
    for (let j = 0; j < c.parts.length; j++) {
      const part = c.parts[j];
      if (!part || typeof part !== 'object') {
        throw new GeminiTransformError(`Part ${j} in content ${i} must be an object`);
      }
      
      const p = part as Record<string, unknown>;
      if (!p.text && !p.inlineData && !p.fileData) {
        throw new GeminiTransformError(
          `Part ${j} in content ${i} must have at least one of: text, inlineData, fileData`
        );
      }
    }
  }
  
  // Validate systemInstruction if present
  if (r.systemInstruction !== undefined) {
    if (typeof r.systemInstruction !== 'object' || r.systemInstruction === null) {
      throw new GeminiTransformError('systemInstruction must be an object');
    }
    
    const si = r.systemInstruction as Record<string, unknown>;
    if (!Array.isArray(si.parts)) {
      throw new GeminiTransformError('systemInstruction must have "parts" array');
    }
    
    if (si.parts.length === 0) {
      throw new GeminiTransformError('systemInstruction.parts cannot be empty');
    }
  }
  
  // Validate generationConfig if present
  if (r.generationConfig !== undefined) {
    if (typeof r.generationConfig !== 'object' || r.generationConfig === null) {
      throw new GeminiTransformError('generationConfig must be an object');
    }
    
    const gc = r.generationConfig as Record<string, unknown>;
    
    // Validate temperature range
    if (gc.temperature !== undefined) {
      if (typeof gc.temperature !== 'number') {
        throw new GeminiTransformError('temperature must be a number');
      }
      if (gc.temperature < 0 || gc.temperature > 2) {
        throw new GeminiTransformError('temperature must be between 0 and 2');
      }
    }
    
    // Validate topP range
    if (gc.topP !== undefined) {
      if (typeof gc.topP !== 'number') {
        throw new GeminiTransformError('topP must be a number');
      }
      if (gc.topP < 0 || gc.topP > 1) {
        throw new GeminiTransformError('topP must be between 0 and 1');
      }
    }
    
    // Validate topK
    if (gc.topK !== undefined) {
      if (typeof gc.topK !== 'number' || gc.topK < 0) {
        throw new GeminiTransformError('topK must be a non-negative number');
      }
    }
    
    // Validate maxOutputTokens
    if (gc.maxOutputTokens !== undefined) {
      if (typeof gc.maxOutputTokens !== 'number' || gc.maxOutputTokens < 1) {
        throw new GeminiTransformError('maxOutputTokens must be a positive number');
      }
    }
  }
}

/**
 * Validate OpenCode request structure
 * 
 * Ensures request meets minimum requirements:
 * - Is an object
 * - Has model string
 * - Has non-empty messages array
 * - Each message has valid role and string content
 * 
 * @param req - Request object to validate
 * @throws GeminiTransformError if validation fails
 */
export function validateOpenCodeRequest(req: unknown): asserts req is OpenCodeRequest {
  // Check if req is an object
  if (!req || typeof req !== 'object') {
    throw new GeminiTransformError('Request must be an object');
  }
  
  const r = req as Record<string, unknown>;
  
  // Check model field
  if (typeof r.model !== 'string') {
    throw new GeminiTransformError('Request must have "model" string');
  }
  
  if (r.model.trim() === '') {
    throw new GeminiTransformError('Model string cannot be empty');
  }
  
  // Check messages array
  if (!Array.isArray(r.messages)) {
    throw new GeminiTransformError('Request must have "messages" array');
  }
  
  if (r.messages.length === 0) {
    throw new GeminiTransformError('Messages array cannot be empty');
  }
  
  // Validate each message
  for (let i = 0; i < r.messages.length; i++) {
    const msg = r.messages[i];
    
    if (!msg || typeof msg !== 'object') {
      throw new GeminiTransformError(`Message at index ${i} must be an object`);
    }
    
    const m = msg as Record<string, unknown>;
    
    // Validate role
    if (!['system', 'user', 'assistant'].includes(m.role as string)) {
      throw new GeminiTransformError(
        `Invalid role at index ${i}: "${m.role}". Must be "system", "user", or "assistant"`
      );
    }
    
    // Validate content
    if (typeof m.content !== 'string') {
      throw new GeminiTransformError(`Message at index ${i} must have "content" string`);
    }
  }
  
  // Validate optional parameters
  if (r.temperature !== undefined) {
    if (typeof r.temperature !== 'number') {
      throw new GeminiTransformError('temperature must be a number');
    }
    if (r.temperature < 0 || r.temperature > 2) {
      throw new GeminiTransformError('temperature must be between 0 and 2');
    }
  }
  
  if (r.top_p !== undefined) {
    if (typeof r.top_p !== 'number') {
      throw new GeminiTransformError('top_p must be a number');
    }
    if (r.top_p < 0 || r.top_p > 1) {
      throw new GeminiTransformError('top_p must be between 0 and 1');
    }
  }
  
  if (r.max_tokens !== undefined) {
    if (typeof r.max_tokens !== 'number' || r.max_tokens < 1) {
      throw new GeminiTransformError('max_tokens must be a positive number');
    }
  }
}

/**
 * Validate Gemini response structure
 * 
 * Ensures response has at least one candidate with valid structure.
 * 
 * @param res - Response object to validate
 * @throws GeminiTransformError if validation fails
 */
export function validateGeminiResponse(res: unknown): asserts res is GeminiResponse {
  if (!res || typeof res !== 'object') {
    throw new GeminiTransformError('Response must be an object');
  }
  
  const r = res as Record<string, unknown>;
  
  if (!Array.isArray(r.candidates)) {
    throw new GeminiTransformError('Response must have "candidates" array');
  }
  
  if (r.candidates.length === 0) {
    throw new GeminiTransformError('Response must have at least one candidate');
  }
  
  // Validate first candidate structure
  const candidate = r.candidates[0];
  if (!candidate || typeof candidate !== 'object') {
    throw new GeminiTransformError('Candidate must be an object');
  }
  
  const c = candidate as Record<string, unknown>;
  if (!c.content || typeof c.content !== 'object') {
    throw new GeminiTransformError('Candidate must have "content" object');
  }
  
  const content = c.content as Record<string, unknown>;
  if (!Array.isArray(content.parts)) {
    throw new GeminiTransformError('Candidate content must have "parts" array');
  }
}

/**
 * Validate OpenCode response structure
 * 
 * Ensures response has required fields and at least one choice.
 * 
 * @param res - Response object to validate
 * @throws GeminiTransformError if validation fails
 */
export function validateOpenCodeResponse(res: unknown): asserts res is OpenCodeResponse {
  if (!res || typeof res !== 'object') {
    throw new GeminiTransformError('Response must be an object');
  }
  
  const r = res as Record<string, unknown>;
  
  if (typeof r.id !== 'string') {
    throw new GeminiTransformError('Response must have "id" string');
  }
  
  if (r.object !== 'chat.completion') {
    throw new GeminiTransformError('Response object must be "chat.completion"');
  }
  
  if (!Array.isArray(r.choices)) {
    throw new GeminiTransformError('Response must have "choices" array');
  }
  
  if (r.choices.length === 0) {
    throw new GeminiTransformError('Response must have at least one choice');
  }
  
  // Validate first choice structure
  const choice = r.choices[0];
  if (!choice || typeof choice !== 'object') {
    throw new GeminiTransformError('Choice must be an object');
  }
  
  const c = choice as Record<string, unknown>;
  if (!c.message || typeof c.message !== 'object') {
    throw new GeminiTransformError('Choice must have "message" object');
  }
  
  const message = c.message as Record<string, unknown>;
  if (message.role !== 'assistant') {
    throw new GeminiTransformError('Choice message role must be "assistant"');
  }
  
  if (typeof message.content !== 'string') {
    throw new GeminiTransformError('Choice message must have "content" string');
  }
}

/**
 * Type guard: Check if value is a Gemini request
 */
export function isGeminiRequest(value: unknown): value is GeminiRequest {
  try {
    validateGeminiRequest(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Type guard: Check if value is an OpenCode request
 */
export function isOpenCodeRequest(value: unknown): value is OpenCodeRequest {
  try {
    validateOpenCodeRequest(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Type guard: Check if value is a Gemini response
 */
export function isGeminiResponse(value: unknown): value is GeminiResponse {
  try {
    validateGeminiResponse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Type guard: Check if value is an OpenCode response
 */
export function isOpenCodeResponse(value: unknown): value is OpenCodeResponse {
  try {
    validateOpenCodeResponse(value);
    return true;
  } catch {
    return false;
  }
}
