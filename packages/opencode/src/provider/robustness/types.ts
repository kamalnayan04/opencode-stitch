
/**
 * Shared type definitions for the Stitch CLI robustness layer.
 */

/**
 * Result of a validation operation.
 */
export interface ValidationResult {
  /** Whether the data is considered valid enough to proceed */
  valid: boolean;
  /** Severity of the validation outcome */
  severity: 'critical' | 'warning' | 'minor';
  /** List of validation issues found */
  issues: ValidationIssue[];
}

/**
 * Specific issue found during validation.
 */
export interface ValidationIssue {
  /** The field path where the issue was found (e.g. "result.response.choices") */
  field: string;
  /** Description of what was expected */
  expected: string;
  /** Description of what was actually found */
  actual: string;
  /** Whether the issue can be recovered from (e.g. by using a default value) */
  recoverable: boolean;
}

/**
 * A sanitized version of the Stitch API response.
 * Guaranteed to have safe types and structure.
 */
export interface SafeStitchResponse {
  choices: SafeChoice[];
  usage: Record<string, number>;
  model: string;
}

export interface SafeChoice {
  index: number;
  content: ContentBlock[];
  finish_reason: string | null;
}

export interface ContentBlock {
  type: string;
  data: string;
}

/**
 * Configuration options for the sanitization process.
 */
export interface SanitizationContext {
  /** Maximum length for content strings before truncation */
  maxContentLength: number;
  /** Maximum number of choices to process */
  maxChoices: number;
  /** Set of allowed content types (e.g. "CONTENT_TYPE_TEXT") */
  allowedContentTypes: Set<string>;
}

/**
 * Options for generating a fallback response.
 */
export interface FallbackOptions {
  /** The type of error that occurred */
  errorType: string;
  /** A human-readable error message */
  errorMessage: string;
  /** Additional context about the failure */
  context?: {
    attemptCount?: number;
    lastValidContent?: string;
    [key: string]: unknown;
  };
}

/**
 * Event logged by the telemetry system.
 */
export interface TelemetryEvent {
  /** ISO timestamp of the event */
  timestamp: string;
  /** Type of event */
  eventType: 'validation_error' | 'sanitization' | 'fallback_used' | 'success' | 'retry_attempt' | 'retry_success' | 'retry_failed' | 'retry_exhausted' | 'circuit_breaker_open' | 'circuit_breaker_half_open' | 'circuit_breaker_closed' | 'circuit_breaker_opened';
  /** Severity level */
  severity: 'critical' | 'warning' | 'info';
  /** Additional details specific to the event */
  details: Record<string, unknown>;
}

/**
 * Aggregated metrics from the telemetry system.
 */
export interface TelemetryMetrics {
  totalEvents: number;
  errorCount: number;
  fallbackCount: number;
  successRate: number;
}

/**
 * Main configuration for the robustness layer.
 */
export interface RobustnessConfig {
  validation: {
    enabled: boolean;
    strictMode: boolean; // If true, fail on warnings, not just critical errors
  };
  sanitization: {
    maxContentLength: number;
    maxChoices: number;
    truncateOverflow: boolean;
  };
  fallbacks: {
    enabled: boolean;
    userFriendlyMessages: boolean;
    includeErrorDetails: boolean;
  };
  telemetry: {
    enabled: boolean;
    maxEvents: number;
    exportInterval: number; // in milliseconds
  };
}

export const DEFAULT_CONFIG: RobustnessConfig = {
  validation: {
    enabled: true,
    strictMode: false
  },
  sanitization: {
    maxContentLength: 1024 * 1024, // 1MB
    maxChoices: 10,
    truncateOverflow: true
  },
  fallbacks: {
    enabled: true,
    userFriendlyMessages: true,
    includeErrorDetails: process.env.NODE_ENV === 'development'
  },
  telemetry: {
    enabled: true,
    maxEvents: 1000,
    exportInterval: 60000 // 1 minute
  }
};

/**
 * Interface for the main robustness layer API.
 */
export interface RobustnessLayer {
  /** Validate raw Stitch response data */
  validate(data: unknown): ValidationResult;
  /** Sanitize raw data into a safe structure */
  sanitize(data: unknown): SafeStitchResponse;
  /** Transform raw data into OpenAI format, handling errors gracefully */
  transform(data: unknown, isStreaming?: boolean): any; // Returns OpenAI-compatible response
  /** Generate a fallback response for an error */
  handleError(error: Error, context: unknown): any; // Returns OpenAI-compatible response
  /** Get current metrics */
  getMetrics(): TelemetryMetrics;
}
