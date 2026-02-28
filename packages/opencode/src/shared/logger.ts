
/**
 * Logger Facade
 *
 * Thin wrapper around debugLogger providing clean API for application code.
 * All logging respects STITCH_DEBUG environment variable.
 *
 * ## Usage Examples
 *
 * ### Basic Logging
 * ```typescript
 * import { logger } from 'shared/logger';
 *
 * logger.debug('Debug message', { data: 'value' });
 * logger.info('Info message');
 * logger.warn('Warning message');
 * logger.error('Error message', new Error('Something went wrong'));
 * ```
 *
 * ### Correlation ID for Request Tracking
 * ```typescript
 * import { logger } from 'shared/logger';
 *
 * const requestLogger = logger.withCorrelationId('req-12345');
 * requestLogger.info('Request started');
 * requestLogger.debug('Processing data', { userId: 123 });
 * requestLogger.info('Request completed');
 * // All logs will include [req-12345] in output
 * ```
 *
 * ## Environment Variables
 * - `STITCH_DEBUG=false` - Disables all logging
 * - `STITCH_DEBUG=true` or unset - Enables logging to stitch-debug.log
 *
 * ## Features
 * - Automatic correlation ID tracking
 * - Sensitive data redaction (API keys, tokens, passwords)
 * - Large payload truncation
 * - Structured JSON logging to file
 * - Zero configuration required
 */

import { debugLogger } from '../provider/stitch/debug-logger';

class Logger {
  private correlationId: string | null = null;
  
  /**
   * Create a scoped logger with a correlation ID
   * All logs from this instance will include the correlation ID
   *
   * @param id - Unique identifier (e.g., request ID, transaction ID)
   * @returns A new Logger instance scoped to this correlation ID
   *
   * @example
   * ```typescript
   * const requestLogger = logger.withCorrelationId('req-789');
   * requestLogger.info('Processing request');
   * // Output: [2024-02-27T...] [INFO] [req-789] Processing request
   * ```
   */
  withCorrelationId(id: string): Logger {
    const instance = new Logger();
    instance.correlationId = id;
    return instance;
  }
  
  private getLogger() {
    return this.correlationId
      ? debugLogger.withCorrelationId(this.correlationId)
      : debugLogger;
  }
  
  /**
   * Log debug-level message
   * @param message - The message to log
   * @param data - Optional structured data (will be sanitized)
   */
  debug(message: string, data?: any) {
    this.getLogger().debug(message, data);
  }
  
  /**
   * Log info-level message
   * @param message - The message to log
   * @param data - Optional structured data (will be sanitized)
   */
  info(message: string, data?: any) {
    this.getLogger().info(message, data);
  }
  
  /**
   * Log warning-level message
   * @param message - The message to log
   * @param data - Optional structured data (will be sanitized)
   */
  warn(message: string, data?: any) {
    this.getLogger().warn(message, data);
  }
  
  /**
   * Log error-level message
   * @param message - The message to log
   * @param data - Optional error or structured data (will be sanitized)
   */
  error(message: string, data?: any) {
    this.getLogger().error(message, data);
  }
}

/**
 * Singleton logger instance for application-wide use
 *
 * @example
 * ```typescript
 * import { logger } from 'shared/logger';
 * logger.info('Application started');
 * ```
 */
export const logger = new Logger();
