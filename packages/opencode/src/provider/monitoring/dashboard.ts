
import { TelemetryLogger } from '../robustness/telemetry';

/**
 * A simple utility to visualize metrics in the console.
 * Useful for development and debugging sessions.
 */
export class ConsoleDashboard {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  
  start(refreshRateMs: number = 5000): void {
    if (this.intervalId) return;
    
    console.log('[Stitch Dashboard] Starting...');
    
    this.intervalId = setInterval(() => {
      this.render();
    }, refreshRateMs);
  }
  
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Stitch Dashboard] Stopped');
    }
  }
  
  render(): void {
    const logger = TelemetryLogger.getInstance();
    const metrics = logger.getMetrics();
    
    console.clear();
    console.log('--- Stitch Provider Health ---');
    console.log(`Time: ${new Date().toLocaleTimeString()}`);
    console.log(`Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
    console.log(`Total Events: ${metrics.totalEvents}`);
    console.log(`Errors: ${metrics.errorCount}`);
    console.log(`Fallbacks: ${metrics.fallbackCount}`);
    console.log('------------------------------');
  }
}
