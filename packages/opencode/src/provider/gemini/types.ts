/**
 * Gemini ↔ OpenCode Transformer Library - Type Definitions
 * 
 * This module provides strict TypeScript type definitions for:
 * - Gemini API request/response formats (Google Gemini API style)
 * - OpenCode CLI request/response formats (OpenAI-style chat completions)
 * 
 * These types ensure type safety throughout the transformation pipeline.
 */

// ============================================================================
// GEMINI REQUEST TYPES
// ============================================================================

/**
 * Gemini content part - can be text, inline data, or file reference
 */
export interface GeminiContentPart {
  /** Text content */
  text?: string;
  /** Inline binary data (base64 encoded) */
  inlineData?: {
    mimeType: string;
    data: string;
  };
  /** File reference (e.g., Google Cloud Storage URI) */
  fileData?: {
    mimeType: string;
    fileUri: string;
  };
}

/**
 * Gemini conversation content with role and parts
 */
export interface GeminiContent {
  /** Role: "user" for user messages, "model" for assistant responses */
  role: "user" | "model";
  /** Array of content parts (text, images, files, etc.) */
  parts: GeminiContentPart[];
}

/**
 * Gemini system instruction (analogous to system message in OpenAI)
 */
export interface GeminiSystemInstruction {
  parts: Array<{ text: string }>;
}

/**
 * Gemini generation configuration parameters
 */
export interface GeminiGenerationConfig {
  /** Controls randomness. Range: 0.0 to 2.0 */
  temperature?: number;
  /** Nucleus sampling threshold. Range: 0.0 to 1.0 */
  topP?: number;
  /** Top-k sampling parameter */
  topK?: number;
  /** Maximum tokens to generate */
  maxOutputTokens?: number;
  /** Sequences that will stop generation */
  stopSequences?: string[];
}

/**
 * Complete Gemini API request
 */
export interface GeminiRequest {
  /** Conversation contents (required) */
  contents: GeminiContent[];
  /** System instruction (optional) */
  systemInstruction?: GeminiSystemInstruction;
  /** Generation parameters (optional) */
  generationConfig?: GeminiGenerationConfig;
}

// ============================================================================
// GEMINI RESPONSE TYPES
// ============================================================================

/**
 * Gemini response candidate with content and finish reason
 */
export interface GeminiResponseCandidate {
  content: {
    role?: "model";
    parts: Array<{ text?: string }>;
  };
  /** Reason generation stopped (e.g., "STOP", "MAX_TOKENS", "SAFETY") */
  finishReason?: string;
}

/**
 * Gemini token usage metadata
 */
export interface GeminiUsageMetadata {
  /** Tokens in the prompt */
  promptTokenCount?: number;
  /** Tokens in the generated response */
  candidatesTokenCount?: number;
  /** Total tokens used */
  totalTokenCount?: number;
}

/**
 * Complete Gemini API response
 */
export interface GeminiResponse {
  /** Array of generated candidates (typically one) */
  candidates: GeminiResponseCandidate[];
  /** Token usage information */
  usageMetadata?: GeminiUsageMetadata;
}

// ============================================================================
// OPENCODE REQUEST TYPES (OpenAI-style)
// ============================================================================

/**
 * OpenCode message in conversation
 */
export interface OpenCodeMessage {
  /** Message role */
  role: "system" | "user" | "assistant";
  /** Message content (text only in basic format) */
  content: string;
}

/**
 * Complete OpenCode API request (OpenAI chat completion style)
 */
export interface OpenCodeRequest {
  /** Model identifier */
  model: string;
  /** Array of conversation messages */
  messages: OpenCodeMessage[];
  /** Sampling temperature (0.0 to 2.0) */
  temperature?: number;
  /** Nucleus sampling (0.0 to 1.0) */
  top_p?: number;
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Stop sequences */
  stop?: string[];
}

// ============================================================================
// OPENCODE RESPONSE TYPES (OpenAI-style)
// ============================================================================

/**
 * OpenCode response choice
 */
export interface OpenCodeChoice {
  /** Choice index (usually 0) */
  index: number;
  /** Generated message */
  message: {
    role: "assistant";
    content: string;
  };
  /** Reason generation stopped */
  finish_reason?: string;
}

/**
 * OpenCode token usage
 */
export interface OpenCodeUsage {
  /** Tokens in prompt */
  prompt_tokens?: number;
  /** Tokens in completion */
  completion_tokens?: number;
  /** Total tokens used */
  total_tokens?: number;
}

/**
 * Complete OpenCode API response
 */
export interface OpenCodeResponse {
  /** Unique response identifier */
  id: string;
  /** Object type (always "chat.completion") */
  object: "chat.completion";
  /** Array of choices (typically one) */
  choices: OpenCodeChoice[];
  /** Token usage statistics */
  usage?: OpenCodeUsage;
}

// ============================================================================
// STREAMING TYPES
// ============================================================================

/**
 * Gemini streaming chunk (partial response)
 */
export interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
}

/**
 * OpenCode streaming delta (OpenAI-style)
 */
export interface OpenCodeStreamDelta {
  /** Unique chunk identifier */
  id: string;
  /** Object type (always "chat.completion.chunk") */
  object: "chat.completion.chunk";
  /** Array of delta choices */
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
    };
    finish_reason?: string | null;
  }>;
}
