
import type { SafeStitchResponse, SanitizationContext, ContentBlock } from './types';

export const DEFAULT_CONTEXT: SanitizationContext = {
  maxContentLength: 1024 * 1024, // 1MB
  maxChoices: 10,
  allowedContentTypes: new Set(['CONTENT_TYPE_TEXT', 'CONTENT_TYPE_REASONING'])
};

/**
 * Sanitizes a raw Stitch response to ensure it conforms to the SafeStitchResponse interface.
 * Handles missing fields, incorrect types, and enforces constraints like max content length.
 * 
 * @param data The raw response data
 * @param context Configuration for sanitization
 * @returns A safe, typed Stitch response object
 */
export function sanitizeStitchResponse(
  data: unknown,
  context: SanitizationContext = DEFAULT_CONTEXT
): SafeStitchResponse {
  
  // Helper for deep property access with default value
  const safeGet = <T>(obj: any, path: string[], fallback: T): T => {
    try {
      // If obj is null/undefined at start, return fallback
      if (obj === null || obj === undefined) return fallback;
      
      return path.reduce((acc, key) => {
          if (acc === null || acc === undefined) return undefined;
          return acc[key];
      }, obj) ?? fallback;
    } catch {
      return fallback;
    }
  };
  
  // Extract response object safely
  // Expected structure: { result: { response: { ... } } }
  const result = safeGet<any>(data, ['result'], {});
  const response = safeGet<any>(result, ['response'], {});
  
  // Sanitize choices array
  const rawChoices = Array.isArray(response.choices) ? response.choices : [];
  // Limit number of choices to prevent massive responses
  const limitedChoices = rawChoices.slice(0, context.maxChoices);
  
  const choices = limitedChoices.map((choice: any, idx: number) => ({
    index: typeof choice?.index === 'number' ? choice.index : idx,
    content: sanitizeContent(choice?.content, context),
    finish_reason: sanitizeFinishReason(choice?.finish_reason)
  }));
  
  // Ensure we always have at least one choice if the original response had choices
  // This prevents empty array issues downstream if sanitization filtered everything out (unlikely)
  if (choices.length === 0 && rawChoices.length > 0) {
      // Fallback empty choice
      choices.push({
          index: 0,
          content: [],
          finish_reason: null
      });
  }

  return {
    choices,
    usage: sanitizeUsage(response.usage),
    model: String(response.model || 'unknown')
  };
}

/**
 * Sanitizes the content array of a choice.
 */
function sanitizeContent(
  content: unknown,
  context: SanitizationContext
): ContentBlock[] {
  if (!Array.isArray(content)) {
      return [];
  }
  
  return content
    .filter(block => 
      block && 
      typeof block === 'object' &&
      // Ensure type exists and is allowed string
      typeof block.type === 'string' &&
      (context.allowedContentTypes?.has(block.type) ?? DEFAULT_CONTEXT.allowedContentTypes.has(block.type))
    )
    .map(block => ({
      type: block.type,
      // Ensure data is string and truncated if necessary
      data: truncateString(
        String(block.data === null || block.data === undefined ? '' : block.data), 
        context.maxContentLength
      )
    }));
}

/**
 * Truncates a string to a maximum length, appending a marker if truncated.
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '... [truncated]';
}

/**
 * Sanitizes the finish_reason field.
 * Normalizes Stitch enum constants (e.g., 'FINISH_REASON_STOP') to OpenAI format (e.g., 'stop')
 */
function sanitizeFinishReason(reason: unknown): string | null {
  if (typeof reason !== 'string') return null;
  
  // Normalize to uppercase for consistent mapping
  const normalized = reason.toUpperCase();
  
  const mapping: Record<string, string> = {
    // Handle Stitch enum constants
    'FINISH_REASON_STOP': 'stop',
    'FINISH_REASON_LENGTH': 'length',
    'FINISH_REASON_CONTENT_FILTER': 'content_filter',
    'FINISH_REASON_TOOL_CALLS': 'tool_calls',
    'FINISH_REASON_ERROR': 'stop',
    // Backward compatibility for lowercase values
    'STOP': 'stop',
    'LENGTH': 'length',
    'MAX_TOKENS': 'length',
    'CONTENT_FILTER': 'content_filter',
    'TOOL_USE': 'tool_calls',
    'TOOL_CALLS': 'tool_calls',
    'ERROR': 'stop'
  };
  
  return mapping[normalized] || 'stop';
}

/**
 * Sanitizes usage statistics, ensuring all fields are numbers.
 * Handles both snake_case (from Stitch backend) and camelCase (legacy) field names.
 * Also extracts nested cache and reasoning token statistics.
 * Following stitch-cli reference: usage.promptTokens -> usage.prompt_tokens
 */
function sanitizeUsage(usage: unknown): Record<string, number> {
  if (!usage || typeof usage !== 'object') {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }
  
  const safeUsage = usage as any;
  
  // Extract usage with proper field name mapping
  // Stitch uses camelCase (promptTokens), OpenCode expects snake_case (prompt_tokens)
  const promptTokens = Number(safeUsage.promptTokens || safeUsage.prompt_tokens || 0);
  const completionTokens = Number(safeUsage.completionTokens || safeUsage.completion_tokens || 0);
  const totalTokens = Number(safeUsage.totalTokens || safeUsage.total_tokens || (promptTokens + completionTokens));
  
  const result: Record<string, number> = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens
  };
  
  // Extract nested cache tokens from promptTokensDetails
  // Following stitch-cli reference implementation
  const promptDetails = safeUsage.promptTokensDetails || safeUsage.prompt_tokens_details;
  if (promptDetails && typeof promptDetails === 'object') {
    const cacheCreationTokens = Number(
      promptDetails.inputCacheCreationTokens ||
      promptDetails.input_cache_creation_tokens ||
      0
    );
    const cachedTokens = Number(
      promptDetails.cachedTokens ||
      promptDetails.cached_tokens ||
      0
    );
    
    if (cacheCreationTokens > 0) {
      result.cache_write_tokens = cacheCreationTokens;
    }
    if (cachedTokens > 0) {
      result.cache_read_tokens = cachedTokens;
    }
  }
  
  // Extract reasoning tokens from completionTokensDetails
  // Following stitch-cli reference implementation
  const completionDetails = safeUsage.completionTokensDetails || safeUsage.completion_tokens_details;
  if (completionDetails && typeof completionDetails === 'object') {
    const reasoningTokens = Number(
      completionDetails.reasoningTokens ||
      completionDetails.reasoning_tokens ||
      0
    );
    
    if (reasoningTokens > 0) {
      result.reasoning_tokens = reasoningTokens;
    }
  }
  
  return result;
}
