
import type { FallbackOptions } from './types';

/**
 * Generates a fallback OpenAI-compatible response when an error occurs.
 * Tailors the message based on the error type to provide better user guidance.
 * 
 * @param options Options for generating the fallback response
 * @returns An OpenAI-compatible chat completion chunk object
 */
export function generateFallbackResponse(options: FallbackOptions): any {
  const { errorType, errorMessage, context } = options;
  
  // Strategy pattern for different fallback messages
  const fallbackStrategies: Record<string, () => string> = {
    'parse_error': () => 
      '⚠️ Unable to process the response format. Please try again.',
    
    'missing_content': () => 
      context?.lastValidContent 
        ? `${context.lastValidContent}\n\n⚠️ Response incomplete due to connection issue.`
        : '⚠️ No content received. Please check your network and try again.',
    
    'rate_limit': () => 
      '⚠️ Rate limit exceeded. Please wait a moment before trying again.',
    
    'validation_error': () => 
      '⚠️ Response validation failed. The system is recovering...',
    
    'network_error': () => 
      '⚠️ Network connection issue. Attempting to reconnect...',
      
    'circuit_breaker_open': () =>
      '⚠️ Service is temporarily unavailable due to high error rates. Please try again later.',
    
    'default': () => 
      `⚠️ An error occurred: ${errorMessage}. Please try again.`
  };
  
  // Select strategy or default
  const getMessage = fallbackStrategies[errorType] || fallbackStrategies['default'];
  
  // Construct OpenAI-compatible chunk
  return {
    choices: [{
      index: 0,
      delta: {
        content: getMessage(),
        role: 'assistant'
      },
      finish_reason: 'error'
    }],
    // Include error object for debugging/client-side handling
    error: {
      type: errorType,
      message: errorMessage,
      code: errorType.toUpperCase(),
      recoverable: true
    },
    // Dummy usage to prevent crashes
    usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
    }
  };
}
