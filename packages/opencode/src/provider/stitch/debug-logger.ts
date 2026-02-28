
import * as fs from 'fs';
import * as path from 'path';

class DebugLogger {
  private logPath: string;
  private isEnabled: boolean;
  private correlationId: string | null = null;
  private initialized: boolean = false;

  constructor() {
    // Log to a file in the opencode directory
    this.logPath = path.join(process.cwd(), 'stitch-debug.log');
    this.isEnabled = process.env.STITCH_DEBUG !== 'false';

    // Lazy initialization - no file operations in constructor
    // File will be created on first write operation
  }

  private static seenSessionIds = new Set<string>();

  private ensureInitialized(correlationId: string | null): void {
    if (!this.isEnabled || !correlationId) {
      return;
    }

    if (!DebugLogger.seenSessionIds.has(correlationId)) {
      try {
        fs.appendFileSync(this.logPath, '\n\n' + '='.repeat(80) + `\n🆕 NEW SESSION START: ${correlationId}\n` + '='.repeat(80) + '\n\n');
        DebugLogger.seenSessionIds.add(correlationId);
      } catch (err) {
        // Fail silently if can't create log file
        this.isEnabled = false;
      }
    }
  }

  withCorrelationId(id: string): DebugLogger {
    // Create a shallow copy without invoking constructor
    const instance = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    instance.correlationId = id;
    return instance;
  }

  trace(message: string, data?: any) {
    this.log('TRACE', message, this.sanitize(data));
  }

  debug(message: string, data?: any) {
    this.log('DEBUG', message, this.sanitize(data));
  }

  info(message: string, data?: any) {
    this.log('INFO', message, this.sanitize(data));
  }

  warn(message: string, data?: any) {
    this.log('WARN', message, this.sanitize(data));
  }

  error(message: string, data?: any) {
    this.log('ERROR', message, this.sanitize(data));
  }

  startRequest(correlationId: string, method: string, data: any) {
    this.withCorrelationId(correlationId).info(
      `⏩ REQUEST START: ${method}`,
      this.sanitize(data)
    );
  }

  endRequest(correlationId: string, duration: number, data?: any) {
    this.withCorrelationId(correlationId).info(
      `⏸️  REQUEST END (${duration}ms)`,
      this.sanitize(data)
    );
  }

  logChunk(correlationId: string, chunkData: any) {
    this.withCorrelationId(correlationId).debug(
      '📦 CHUNK',
      this.sanitize(chunkData, { maxSize: 1000 })
    );
  }

  private sanitize(data: any, options?: { maxSize?: number }): any {
    if (!data) return data;

    const sensitiveKeys = ['apikey', 'api_key', 'authorization', 'token', 'password'];

    const sanitized = JSON.parse(JSON.stringify(data, (key, value) => {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        return '[REDACTED]';
      }
      return value;
    }));

    // Truncate large payloads
    if (options?.maxSize) {
      const jsonStr = JSON.stringify(sanitized);
      if (jsonStr.length > options.maxSize) {
        return jsonStr.substring(0, options.maxSize) + '... [TRUNCATED]';
      }
    }

    return sanitized;
  }

  private log(level: string, message: string, data?: any) {
    if (!this.isEnabled) return;

    // Ensure file is initialized before first write
    this.ensureInitialized(this.correlationId);

    const timestamp = new Date().toISOString();
    const correlationId = this.correlationId || 'NO-CID';
    let logLine = `[${timestamp}] [${level}] [${correlationId}] ${message}`;

    if (data !== undefined) {
      try {
        logLine += '\n' + JSON.stringify(data, null, 2);
      } catch (err) {
        logLine += '\n[Circular object - cannot stringify]';
      }
    }

    logLine += '\n';

    try {
      fs.appendFileSync(this.logPath, logLine);
    } catch (err) {
      // Silently fail if we can't write
    }
  }

  section(title: string) {
    this.info(`\n${'='.repeat(80)}`);
    this.info(`${title}`);
    this.info(`${'='.repeat(80)}`);
  }

  subsection(title: string) {
    this.info(`\n${'-'.repeat(60)}`);
    this.info(`${title}`);
    this.info(`${'-'.repeat(60)}`);
  }

  // Legacy methods for backward compatibility
  warning(message: string, data?: any) {
    this.warn(`⚠️  WARNING: ${message}`, data);
  }

  success(message: string, data?: any) {
    this.info(`✅ SUCCESS: ${message}`, data);
  }
}

export const debugLogger = new DebugLogger();
