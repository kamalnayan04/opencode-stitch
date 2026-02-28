
import { validateStitchResponse } from './validator';
import { sanitizeStitchResponse } from './sanitizer';
import { generateFallbackResponse } from './fallback';
import { TelemetryLogger } from './telemetry';
import { RobustnessConfig, RobustnessLayer, TelemetryMetrics } from './types';

// Export all types and helper functions for external use
export * from './types';
export * from './validator';
export * from './sanitizer';
export * from './fallback';
export * from './telemetry';

/**
 * Maps Stitch role enum values to OpenAI role format
 * Handles ROLE_ASSISTANT, ROLE_USER, ROLE_SYSTEM enums
 */
function mapRole(role: string | undefined): string {
  if (!role) return 'assistant';
  
  const roleStr = String(role).toUpperCase();
  
  if (roleStr.includes('ASSISTANT')) return 'assistant';
  if (roleStr.includes('USER')) return 'user';
  if (roleStr.includes('SYSTEM')) return 'system';
  
  return 'assistant'; // default fallback
}



/**
 * Creates a configured instance of the robustness layer.
 * 
 * @param config Configuration for validation, sanitization, and fallbacks
 * @returns A robust transformer for Stitch API responses
 */
export function createRobustnessLayer(
  config: RobustnessConfig
): RobustnessLayer {
  const telemetry = TelemetryLogger.getInstance();
  
  return {
    validate: (data) => validateStitchResponse(data),
    
    sanitize: (data) => sanitizeStitchResponse(data, config.sanitization),
    
    transform: (data, isStreaming = false) => {
      // NOTE: This transform function handles the Stitch-specific response structure
      // and converts it to OpenAI format, but delegates the *core* logic to
      // the existing provider functions if possible, or implements it here.
      // To avoid circular dependencies or massive refactoring, we'll keep the core logic
      // in the provider but wrap it here.
      //
      // However, the interface defines transform(data) -> OpenAIResponse.
      // Since we can't easily import the original `transformStitchToOpenAI` here without
      // potential circular dependencies (if provider imports this), we will assume
      // this method is used as a wrapper OR implementing the logic directly.
      //
      // Given the design, we are moving towards this layer OWNING the transformation safety.
      // Let's implement the safe transformation logic here directly, reusing the sanitization.
      
      try {
        // 1. Validation
        const validation = validateStitchResponse(data);
        
        if (!validation.valid && validation.severity === 'critical') {
          telemetry.log({
            eventType: 'validation_error',
            severity: 'critical',
            details: { issues: validation.issues, data }
          });
          
          return generateFallbackResponse({
            errorType: 'validation_error',
            errorMessage: validation.issues[0]?.expected || 'Unknown validation error'
          });
        }
        
        // 2. Sanitization
        const safeData = sanitizeStitchResponse(data, config.sanitization);
        
        // 3. Transformation (Safe implementation following stitch-cli reference)
        // We replicate the logic from stitch-cli's gateway-client.ts but using safe types
        
        // Defensive guard: handle edge case of empty or missing choices
        if (!safeData.choices || safeData.choices.length === 0) {
            return {
                choices: [{
                    index: 0,
                    delta: {}, // Empty delta, no content field
                    finish_reason: null
                }],
                usage: safeData.usage,
                model: safeData.model,
                id: (data as any)?.result?.response?.id || `stitch-${Date.now()}`
            };
        }
        
        const choices = safeData.choices.map((choice, idx) => {
            // Extract ONLY text content blocks, filter out REASONING
            // Following stitch-cli reference: only CONTENT_TYPE_TEXT goes into main content
            const textBlocks = choice.content
                .filter(c => c.type === 'CONTENT_TYPE_TEXT')
                .map(c => c.data);
            
            const content = textBlocks.join('');
            
            if (isStreaming) {
                const delta: any = {};
                
                // CRITICAL: Only add content if non-empty (UI contract)
                // Empty strings from empty content arrays break the UI
                if (content.length > 0) {
                    delta.content = content;
                }
                
                // Add role on first chunk with content
                // Map role enum if present in choice, default to 'assistant'
                if (content.length > 0 || choice.index === 0) {
                    delta.role = mapRole((choice as any).role) || 'assistant';
                }
                
                return {
                    index: choice.index ?? idx,
                    delta,  // Now follows UI contract: content omitted if empty
                    finish_reason: choice.finish_reason || null
                };
            } else {
                // Non-streaming: full message
                return {
                    index: choice.index ?? idx,
                    message: {
                        role: mapRole((choice as any).role) || 'assistant',
                        content: content
                    },
                    finish_reason: choice.finish_reason || null
                };
            }
        });

        const response = {
            choices,
            usage: safeData.usage,
            model: safeData.model,
            // Add ID if available in original data safely, else generate one
            id: (data as any)?.result?.response?.id || `stitch-${Date.now()}`
        };

        telemetry.log({
          eventType: 'success',
          severity: 'info',
          details: {
              model: response.model,
              choices: response.choices.length
          }
        });
        
        return response;
        
      } catch (error) {
        return handleError(error, data);
      }
    },
    
    handleError: (error, context) => {
      return handleError(error, context);
    },
    
    getMetrics: () => telemetry.getMetrics()
  };
}

/**
 * Internal error handler helper
 */
function handleError(error: unknown, context: unknown): any {
    const telemetry = TelemetryLogger.getInstance();
    const err = error instanceof Error ? error : new Error(String(error));

    telemetry.log({
        eventType: 'fallback_used',
        severity: 'warning',
        details: { error: err.message, context }
    });
    
    return generateFallbackResponse({
        errorType: err.name || 'Error',
        errorMessage: err.message,
        context: typeof context === 'object' ? context as any : { raw: context }
    });
}
