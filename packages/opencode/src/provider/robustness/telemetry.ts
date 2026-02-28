
import type { TelemetryEvent, TelemetryMetrics } from './types';

/**
 * Logger for robustness layer events.
 * Uses a circular buffer to store recent events in memory.
 * Provides metrics aggregation and console logging for development.
 */
export class TelemetryLogger {
  private static instance: TelemetryLogger;
  private events: TelemetryEvent[] = [];
  private readonly maxEvents = 1000;
  
  private constructor() {}
  
  /**
   * Get the singleton instance of the logger.
   */
  static getInstance(): TelemetryLogger {
    if (!TelemetryLogger.instance) {
      TelemetryLogger.instance = new TelemetryLogger();
    }
    return TelemetryLogger.instance;
  }
  
  /**
   * Log an event to the telemetry system.
   * @param event Event details (timestamp is added automatically)
   */
  log(event: Omit<TelemetryEvent, 'timestamp'>): void {
    const fullEvent: TelemetryEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };
    
    // Add to circular buffer
    this.events.push(fullEvent);
    if (this.events.length > this.maxEvents) {
      // Remove oldest events if buffer is full
      // Using slice is cleaner than shift in a loop for large overflows
      this.events = this.events.slice(-this.maxEvents);
    }
    
    // Console logging for dev visibility
    // In production, this might be connected to an external logging service
    if (event.severity === 'critical' || event.severity === 'warning') {
      console.warn('[Stitch Robustness]', fullEvent);
    }
  }
  
  /**
   * Get aggregated metrics from the recent event history.
   * Metrics are calculated over the last 24 hours.
   */
  getMetrics(): TelemetryMetrics {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    // Filter for events within the last 24 hours
    const recentEvents = this.events.filter(e => 
      now - new Date(e.timestamp).getTime() < oneDayMs
    );
    
    const totalEvents = recentEvents.length;
    if (totalEvents === 0) {
        return { totalEvents: 0, errorCount: 0, fallbackCount: 0, successRate: 1 };
    }

    const errorCount = recentEvents.filter(e => 
        e.eventType.includes('error') || e.severity === 'critical'
    ).length;
    
    const fallbackCount = recentEvents.filter(e => 
        e.eventType === 'fallback_used'
    ).length;
    
    const successCount = recentEvents.filter(e => 
        e.eventType === 'success' || e.eventType === 'retry_success'
    ).length;
    
    // Success rate is based on explicit success events relative to total operations
    // This is an approximation
    const operationCount = successCount + errorCount + fallbackCount;
    const successRate = operationCount > 0 ? successCount / operationCount : 1;

    return {
      totalEvents,
      errorCount,
      fallbackCount,
      successRate
    };
  }
  
  /**
   * Export all stored events.
   */
  export(): TelemetryEvent[] {
    return [...this.events];
  }
  
  /**
   * Clear all stored events.
   */
  clear(): void {
    this.events = [];
  }
}
