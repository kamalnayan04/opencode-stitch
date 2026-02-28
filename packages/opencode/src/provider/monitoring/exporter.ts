
import { TelemetryLogger } from '../robustness/telemetry';
import type { TelemetryEvent } from '../robustness/types';

/**
 * Interface for telemetry exporters.
 */
export interface TelemetryExporter {
  export(events: TelemetryEvent[]): Promise<void>;
}

/**
 * Console exporter for development.
 */
export class ConsoleExporter implements TelemetryExporter {
  async export(events: TelemetryEvent[]): Promise<void> {
    if (events.length === 0) return;
    
    console.group('[Stitch Telemetry Export]');
    console.log(`Exporting ${events.length} events`);
    
    // Group by type for cleaner output
    const byType = events.reduce((acc, event) => {
      acc[event.eventType] = (acc[event.eventType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.table(byType);
    
    // Log critical events in detail
    const critical = events.filter(e => e.severity === 'critical');
    if (critical.length > 0) {
      console.warn('Critical events:', critical);
    }
    
    console.groupEnd();
  }
}

/**
 * Manager to handle periodic exports.
 */
export class MonitoringManager {
  private static instance: MonitoringManager;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private exporters: TelemetryExporter[] = [];
  
  private constructor() {
    // Add default console exporter in dev
    if (process.env.NODE_ENV !== 'production') {
      this.exporters.push(new ConsoleExporter());
    }
  }
  
  static getInstance(): MonitoringManager {
    if (!MonitoringManager.instance) {
      MonitoringManager.instance = new MonitoringManager();
    }
    return MonitoringManager.instance;
  }
  
  addExporter(exporter: TelemetryExporter): void {
    this.exporters.push(exporter);
  }
  
  start(intervalMs: number = 60000): void {
    if (this.intervalId) return;
    
    this.intervalId = setInterval(() => {
      this.flush();
    }, intervalMs);
    
    console.log(`[Stitch Monitoring] Started telemetry export every ${intervalMs}ms`);
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  async flush(): Promise<void> {
    const logger = TelemetryLogger.getInstance();
    const events = logger.export();
    
    if (events.length === 0) return;
    
    // Clear logger buffer after retrieving
    logger.clear();
    
    await Promise.all(
      this.exporters.map(exporter => exporter.export(events).catch(err => {
        console.error('[Stitch Monitoring] Export failed:', err);
      }))
    );
  }
}
