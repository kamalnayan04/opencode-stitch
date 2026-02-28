
/**
 * Stitch Native Provider Type Definitions
 * 
 * Type definitions for the native Stitch provider implementation
 * based on Vercel AI SDK v5 interfaces.
 */

import type { FetchFunction } from '@ai-sdk/provider-utils';

/**
 * Configuration for the Stitch language model
 */
export interface StitchConfig {
  /** API endpoint URL */
  baseURL?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Custom headers */
  headers?: Record<string, string | undefined>;
  /** Custom fetch function */
  fetch?: FetchFunction;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Settings for creating a Stitch provider
 */
export interface StitchProviderSettings {
  /** API endpoint URL (defaults to environment variable or production endpoint) */
  baseURL?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
  /** Custom fetch implementation */
  fetch?: FetchFunction;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Provider name for identification */
  name?: string;
}

/**
 * Stitch model identifier type
 */
export type StitchModelId = string;

/**
 * Stitch API request format (Gemini-compatible with native tools support)
 */
export interface StitchApiRequest {
  request: {
    model: string;
    fallback_model: string;
    systemInstruction?: {
      parts: Array<{
        text: string;
      }>;
    };
    tools?: Array<{
      functionDeclaration: {
        name: string;
        description: string;
        parameters: object;
      };
    }>;
    messages: Array<{
      role: 'MESSAGE_ROLE_USER' | 'MESSAGE_ROLE_ASSISTANT';
      content: Array<{
        type: 'CONTENT_TYPE_TEXT' | 'CONTENT_TYPE_REASONING';
        data: string;
      }>;
    }>;
    config: {
      temperature?: number;
      max_tokens?: number;
      reasoning_config?: {
        reasoning_budget?: number;
      };
    };
    client_options: {
      source: string;
      retry_options?: {
        max_retries: number;
      };
      request_options?: {
        content_type: string;
        timeout_ms: number;
      };
    };
  };
}

/**
 * Stitch API response format (with native function call support)
 */
export interface StitchApiResponse {
  result: {
    response: {
      model?: string;
      choices: Array<{
        index: number;
        content?: Array<{
          type: string;
          data: string;
          functionCall?: {
            name: string;
            args: object;
          };
        }>;
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        prompt_tokens_details?: {
          cached_tokens?: number;
          input_cache_creation_tokens?: number;
        };
        completion_tokens_details?: {
          reasoning_tokens?: number;
        };
      };
    };
  };
}
