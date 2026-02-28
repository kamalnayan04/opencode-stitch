
/**
 * Stitch Native Provider for Vercel AI SDK
 *
 * This module provides a native Vercel AI SDK provider for Stitch,
 * allowing direct integration without middleware transformation layers.
 *
 * Features:
 * - ✅ Native Vercel AI SDK v5 integration
 * - ✅ Full tool calling support
 * - ✅ Streaming responses
 * - ✅ Type-safe with strict TypeScript definitions
 * - ✅ Production-ready with error recovery
 *
 * @example Basic Usage
 * ```typescript
 * import { createStitch } from '@opencode/provider/stitch';
 *
 * const stitch = createStitch({
 *   apiKey: process.env.STITCH_API_KEY,
 * });
 *
 * const model = stitch('claude-4-5-sonnet');
 * ```
 *
 * @module stitch
 */

// ============================================================================
// STATE MACHINE PARSER
// ============================================================================

export {
  UniversalXmlParser,
} from './state-machine-parser';

// ============================================================================
// NATIVE PROVIDER
// ============================================================================

export {
  StitchLanguageModel,
  createStitch
} from './provider';

export type {
  StitchProvider
} from './provider';

export type {
  StitchConfig,
  StitchProviderSettings,
  StitchModelId,
  StitchApiRequest,
  StitchApiResponse
} from './provider-types';

export {
  serializeTools,
  createToolInstructions,
  injectToolsIntoPrompt,
  extractToolSchemas
} from './tool-injection';

// ============================================================================
// PROVIDER METADATA
// ============================================================================

/**
 * Provider metadata for registration
 */
export const STITCH_PROVIDER_METADATA = {
  id: 'stitch',
  name: 'Stitch',
  supportsStreaming: true,
  supportsToolCalling: true,
  supportsSystemMessages: true,
  supportsReasoning: true,
  supportsCaching: true,
  streamingFormat: 'ndjson',
  outputFormat: 'openai', // CRITICAL FIX: Removes the SSE bypass hack
} as const;

