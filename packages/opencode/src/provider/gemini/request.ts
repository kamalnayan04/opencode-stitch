/**
 * Gemini ↔ OpenCode Request Transformations
 * 
 * This module handles bidirectional transformation of request objects:
 * 1. geminiToOpenCodeRequest: Gemini → OpenCode
 * 2. openCodeToGeminiRequest: OpenCode → Gemini
 * 
 * Transformation Rules:
 * 
 * Gemini → OpenCode:
 * - systemInstruction.parts[].text → single "system" message
 * - contents[].role: "user"→"user", "model"→"assistant"
 * - Concatenate all parts[].text into single string per message
 * - Ignore non-text parts (inlineData, fileData) with warning
 * - generationConfig.temperature → temperature
 * - generationConfig.topP → top_p
 * - generationConfig.maxOutputTokens → max_tokens
 * - generationConfig.stopSequences → stop
 * 
 * OpenCode → Gemini:
 * - Extract "system" messages → systemInstruction
 * - "assistant" → "model", "user" → "user"
 * - Wrap content as parts: [{ text: content }]
 * - temperature → generationConfig.temperature
 * - top_p → generationConfig.topP
 * - max_tokens → generationConfig.maxOutputTokens
 * - stop → generationConfig.stopSequences
 */

import type {
  GeminiRequest,
  GeminiContent,
  GeminiSystemInstruction,
  GeminiGenerationConfig,
  OpenCodeRequest,
  OpenCodeMessage,
} from './types';

/**
 * Transform Gemini request to OpenCode format
 * 
 * @param geminiReq - Gemini API request object
 * @param model - Model identifier (default: "gemini-pro")
 * @returns OpenCode-compatible request object
 * 
 * @example
 * ```typescript
 * const geminiReq: GeminiRequest = {
 *   contents: [{
 *     role: 'user',
 *     parts: [{ text: 'Hello!' }]
 *   }],
 *   generationConfig: {
 *     temperature: 0.7,
 *     maxOutputTokens: 1024
 *   }
 * };
 * 
 * const openCodeReq = geminiToOpenCodeRequest(geminiReq, 'gemini-pro');
 * // Result: { model: 'gemini-pro', messages: [...], temperature: 0.7, max_tokens: 1024 }
 * ```
 */
export function geminiToOpenCodeRequest(
  geminiReq: GeminiRequest,
  model: string = "gemini-pro"
): OpenCodeRequest {
  const messages: OpenCodeMessage[] = [];
  
  // Step 1: Extract system instruction if present
  if (geminiReq.systemInstruction?.parts) {
    const systemText = geminiReq.systemInstruction.parts
      .map(p => p.text)
      .filter(Boolean)
      .join('\n');
    
    if (systemText) {
      messages.push({
        role: "system",
        content: systemText
      });
    }
  }
  
  // Step 2: Transform conversation contents
  for (const content of geminiReq.contents) {
    // Map role: "model" → "assistant", "user" → "user"
    const role: "user" | "assistant" = content.role === "model" ? "assistant" : "user";
    
    // Extract text parts
    const textParts: string[] = [];
    let hasMultimodal = false;
    
    for (const part of content.parts) {
      if (part.text !== undefined) {
        textParts.push(part.text);
      }
      if (part.inlineData || part.fileData) {
        hasMultimodal = true;
      }
    }
    
    // Warn about multimodal content (limitation: not supported in OpenCode)
    if (hasMultimodal) {
      console.warn(
        '⚠️ Gemini multimodal content detected but not supported in OpenCode format. ' +
        'Only text parts will be preserved.'
      );
    }
    
    // Add message if we have text content
    if (textParts.length > 0) {
      messages.push({
        role,
        content: textParts.join('\n')
      });
    }
  }
  
  // Step 3: Build base request
  const request: OpenCodeRequest = {
    model,
    messages
  };
  
  // Step 4: Map generation config parameters
  const config = geminiReq.generationConfig;
  if (config) {
    if (config.temperature !== undefined) {
      request.temperature = config.temperature;
    }
    if (config.topP !== undefined) {
      request.top_p = config.topP;
    }
    if (config.maxOutputTokens !== undefined) {
      request.max_tokens = config.maxOutputTokens;
    }
    if (config.stopSequences !== undefined && config.stopSequences.length > 0) {
      request.stop = config.stopSequences;
    }
  }
  
  return request;
}

/**
 * Transform OpenCode request to Gemini format
 * 
 * @param openCodeReq - OpenCode API request object
 * @returns Gemini-compatible request object
 * 
 * @example
 * ```typescript
 * const openCodeReq: OpenCodeRequest = {
 *   model: 'gemini-pro',
 *   messages: [
 *     { role: 'system', content: 'You are helpful.' },
 *     { role: 'user', content: 'Hello!' }
 *   ],
 *   temperature: 0.7
 * };
 * 
 * const geminiReq = openCodeToGeminiRequest(openCodeReq);
 * // Result: { systemInstruction: {...}, contents: [...], generationConfig: {...} }
 * ```
 */
export function openCodeToGeminiRequest(
  openCodeReq: OpenCodeRequest
): GeminiRequest {
  const contents: GeminiContent[] = [];
  let systemInstruction: GeminiSystemInstruction | undefined;
  
  // Step 1: Process messages and separate system messages
  for (const msg of openCodeReq.messages) {
    if (msg.role === "system") {
      // Accumulate system messages into systemInstruction
      if (!systemInstruction) {
        systemInstruction = { parts: [] };
      }
      systemInstruction.parts.push({ text: msg.content });
    } else {
      // Convert role: "assistant" → "model", "user" → "user"
      const role: "user" | "model" = msg.role === "assistant" ? "model" : "user";
      
      // Wrap content as text part
      contents.push({
        role,
        parts: [{ text: msg.content }]
      });
    }
  }
  
  // Step 2: Build generation config
  const generationConfig: GeminiGenerationConfig = {};
  let hasConfig = false;
  
  if (openCodeReq.temperature !== undefined) {
    generationConfig.temperature = openCodeReq.temperature;
    hasConfig = true;
  }
  if (openCodeReq.top_p !== undefined) {
    generationConfig.topP = openCodeReq.top_p;
    hasConfig = true;
  }
  if (openCodeReq.max_tokens !== undefined) {
    generationConfig.maxOutputTokens = openCodeReq.max_tokens;
    hasConfig = true;
  }
  if (openCodeReq.stop !== undefined && openCodeReq.stop.length > 0) {
    generationConfig.stopSequences = openCodeReq.stop;
    hasConfig = true;
  }
  
  // Step 3: Build final request
  const request: GeminiRequest = { contents };
  
  if (systemInstruction && systemInstruction.parts.length > 0) {
    request.systemInstruction = systemInstruction;
  }
  
  if (hasConfig) {
    request.generationConfig = generationConfig;
  }
  
  return request;
}
