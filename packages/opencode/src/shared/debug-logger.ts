
import { appendFileSync, existsSync, mkdirSync } from "fs"
import { dirname } from "path"

const LOG_FILE = process.env.DEBUG_LOG_FILE || "opencode-flow-debug.log"

export class FlowDebugLogger {
  private enabled: boolean

  constructor() {
    this.enabled = process.env.FLOW_DEBUG !== 'false'
  }

  private write(level: string, layer: string, message: string, data?: any) {
    if (!this.enabled) return
    
    const timestamp = new Date().toISOString()
    const logEntry = {
      timestamp,
      level,
      layer,
      message,
      ...(data && { data })
    }
    
    try {
      const dir = dirname(LOG_FILE)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n')
    } catch (error) {
      // Silent fail - don't break app due to logging
    }
  }

  provider(message: string, data?: any) {
    this.write('INFO', 'PROVIDER', message, data)
  }

  consumer(message: string, data?: any) {
    this.write('INFO', 'CONSUMER', message, data)
  }

  eventBus(message: string, data?: any) {
    this.write('INFO', 'EVENT_BUS', message, data)
  }

  uiReducer(message: string, data?: any) {
    this.write('INFO', 'UI_REDUCER', message, data)
  }

  error(layer: string, message: string, error?: any) {
    this.write('ERROR', layer, message, { error })
  }
}

export const flowLogger = new FlowDebugLogger()
