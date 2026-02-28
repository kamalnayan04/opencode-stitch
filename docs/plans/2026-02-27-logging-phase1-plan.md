
# Logging System Phase 1: Critical Path Implementation

**Date**: 2026-02-27  
**Status**: Ready for Implementation  
**Time Estimate**: 1-2 days  
**Design Reference**: [`2026-02-27-logging-improvement-design.md`](2026-02-27-logging-improvement-design.md:1)

---

## 1. Goal

Enable debugging of production issues from `stitch-debug.log` alone by implementing correlation IDs and migrating critical path console.log calls to a structured logging system.

---

## 2. Context

### Why Phase 1 First?

The design document (Approach D - Progressive Enhancement) identified that **Phase 1 delivers 80% of debugging value** by focusing on the critical request path:
- [`provider.ts`](../../packages/opencode/src/provider/stitch/provider.ts:1) - Entry point for all LLM requests (~60 console.log calls)
- [`stream.ts`](../../packages/opencode/src/provider/stitch/stream.ts:1) - Handles streaming responses (~10 console.log calls)
- [`request.ts`](../../packages/opencode/src/provider/stitch/request.ts:1) - Request transformations (already uses debugLogger)
- [`response.ts`](../../packages/opencode/src/provider/stitch/response.ts:1) - Response transformations

### Current State

From [`debug-logger.ts`](../../packages/opencode/src/provider/stitch/debug-logger.ts:1):
- ✅ Basic file logging exists (writes to `stitch-debug.log`)
- ✅ Simple API: `log()`, `error()`, `warning()`, `success()`
- ❌ No correlation ID support
- ❌ No log levels (DEBUG, INFO, WARN, ERROR)
- ❌ No payload size limits
- ❌ No sanitization (API keys in logs)
- ❌ Synchronous writes (potential performance issue)
- ❌ No STITCH_DEBUG env var handling

### What Phase 1 Delivers

After Phase 1:
1. **Complete request tracing** - Every API request has a correlation ID that flows through all logs
2. **Full context debugging** - Request/response payloads, transformations, errors all logged with context
3. **Clean console** - No debug noise (only CLI output and errors remain)
4. **Production-ready logs** - Sanitized payloads (no API keys), structured format
5. **Performance-safe** - Respects `STITCH_DEBUG=false` (zero overhead when disabled)

---

## 3. Steps

### Step 1: Enhance debug-logger.ts with Core Features

**Objective**: Add correlation IDs, log levels, request lifecycle methods, and payload sanitization.

**Test-First Approach**:
```typescript
// Create: opencode/packages/opencode/src/provider/stitch/__tests__/debug-logger.test.ts
describe('DebugLogger', () => {
  it('should include correlation ID in log entries', () => {
    const logger = debugLogger.withCorrelationId('req-123');
    logger.debug('test message');
    // Assert: stitch-debug.log contains [req-123]
  });
  
  it('should sanitize API keys from payloads', () => {
    debugLogger.debug('request', { apiKey: 'secret', data: 'safe' });
    // Assert: log contains "data" but not "secret"
  });
  
  it('should respect STITCH_DEBUG=false', () => {
    process.env.STITCH_DEBUG = 'false';
    const sizeBefore = getLogFileSize();
    debugLogger.debug('should not appear');
    // Assert: log file size unchanged
  });
});
```

**Implementation Changes** in [`debug-logger.ts`](../../packages/opencode/src/provider/stitch/debug-logger.ts:1):

1. Add types and interfaces:
```typescript
type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogMetadata {
  correlationId?: string;
  level: LogLevel;
  timestamp: string;
  context?: Record<string, any>;
}
```

2. Update constructor to check `STITCH_DEBUG` env var:
```typescript
constructor() {
  this.isEnabled = process.env.STITCH_DEBUG !== 'false';
  // ... rest of constructor
}
```

3. Add correlation ID support:
```typescript
private correlationId: string | null = null;

withCorrelationId(id: string): DebugLogger {
  const instance = Object.create(DebugLogger.prototype);
  instance.logPath = this.logPath;
  instance.isEnabled = this.isEnabled;
  instance.correlationId = id;
  return instance;
}
```

4. Add request lifecycle methods:
```typescript
startRequest(correlationId: string, method: string, data: any) {
  this.withCorrelationId(correlationId).log(
    'INFO',
    `⏩ REQUEST START: ${method}`,
    this.sanitize(data)
  );
}

endRequest(correlationId: string, duration: number, data?: any) {
  this.withCorrelationId(correlationId).log(
    'INFO',
    `⏸️  REQUEST END (${duration}ms)`,
    this.sanitize(data)
  );
}

logChunk(correlationId: string, chunkData: any) {
  this.withCorrelationId(correlationId).log(
    'DEBUG',
    '📦 CHUNK',
    this.sanitize(chunkData, { maxSize: 1000 })
  );
}
```

5. Add payload sanitization:
```typescript
private sanitize(data: any, options?: { maxSize?: number }): any {
  if (!data) return data;
  
  const sensitiveKeys = ['apiKey', 'api_key', 'authorization', 'token', 'password'];
  
  const sanitized = JSON.parse(JSON.stringify(data, (key, value) => {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      return '[REDACTED]';
    }
    return value;
  }));
  
  // Truncate large payloads
  const jsonStr = JSON.stringify(sanitized);
  if (options?.maxSize && jsonStr.length > options.maxSize) {
    return jsonStr.substring(0, options.maxSize) + '... [TRUNCATED]';
  }
  
  return sanitized;
}
```

6. Update `log()` method to include level and correlation ID:
```typescript
log(level: LogLevel, message: string, data?: any) {
  if (!this.isEnabled) return;
  
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
    // Silently fail
  }
}
```

7. Update existing methods to use log levels:
```typescript
debug(message: string, data?: any) {
  this.log('DEBUG', message, data);
}

info(message: string, data?: any) {
  this.log('INFO', message, data);
}

error(message: string, error?: any) {
  this.log('ERROR', `❌ ERROR: ${message}`, error);
}

warning(message: string, data?: any) {
  this.log('WARN', `⚠️  WARNING: ${message}`, data);
}
```

**Verification**:
```bash
cd opencode/packages/opencode
bun test src/provider/stitch/__tests__/debug-logger.test.ts
```

**Success Criteria**:
- ✅ All tests pass
- ✅ Log entries include `[correlationId]`
- ✅ Sensitive keys are `[REDACTED]`
- ✅ `STITCH_DEBUG=false` prevents logging
- ✅ Large payloads are truncated with `[TRUNCATED]`

---

### Step 2: Create Logger Facade (src/shared/logger.ts)

**Objective**: Provide a clean, importable interface that wraps `debugLogger` and handles env vars.

**Test-First Approach**:
```typescript
// Create: opencode/packages/opencode/src/shared/__tests__/logger.test.ts
describe('Logger Facade', () => {
  it('should export singleton logger instance', () => {
    expect(logger).toBeDefined();
    expect(logger.debug).toBeInstanceOf(Function);
  });
  
  it('should forward calls to debugLogger', () => {
    logger.debug('test message', { data: 'value' });
    // Assert: stitch-debug.log contains entry
  });
  
  it('should create scoped loggers with correlation ID', () => {
    const scoped = logger.withCorrelationId('req-456');
    scoped.info('scoped message');
    // Assert: log contains [req-456]
  });
});
```

**Implementation** - Create new file `opencode/packages/opencode/src/shared/logger.ts`:

```typescript
/**
 * Logger Facade
 * 
 * Thin wrapper around debugLogger providing clean API for application code.
 * All logging respects STITCH_DEBUG environment variable.
 */

import { debugLogger } from '../provider/stitch/debug-logger';

class Logger {
  private correlationId: string | null = null;
  
  /**
   * Create a scoped logger with a correlation ID
   * All logs from this instance will include the correlation ID
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
  
  debug(message: string, data?: any) {
    this.getLogger().debug(message, data);
  }
  
  info(message: string, data?: any) {
    this.getLogger().info(message, data);
  }
  
  warn(message: string, data?: any) {
    this.getLogger().warning(message, data);
  }
  
  error(message: string, error?: any) {
    this.getLogger().error(message, error);
  }
  
  // Request lifecycle helpers
  startRequest(correlationId: string, method: string, data?: any) {
    debugLogger.startRequest(correlationId, method, data);
  }
  
  endRequest(correlationId: string, duration: number, data?: any) {
    debugLogger.endRequest(correlationId, duration, data);
  }
  
  logChunk(correlationId: string, chunkData: any) {
    debugLogger.logChunk(correlationId, chunkData);
  }
}

/**
 * Singleton logger instance
 * Import and use throughout the codebase
 */
export const logger = new Logger();
```

**Verification**:
```bash
cd opencode/packages/opencode
bun test src/shared/__tests__/logger.test.ts
```

**Success Criteria**:
- ✅ Tests pass
- ✅ `logger` can be imported in any file
- ✅ Scoped loggers maintain correlation IDs
- ✅ All methods forward to `debugLogger`

---

### Step 3: Migrate provider.ts

**Objective**: Replace ~60 console.log calls, add correlation IDs to each request, log complete request/response cycles.

**Test-First Approach**:
```typescript
// Add to existing provider tests or create new test file
describe('StitchLanguageModel Logging', () => {
  it('should log doGenerate with correlation ID', async () => {
    const model = new StitchLanguageModel('stitch-1', config);
    await model.doGenerate(options);
    // Assert: stitch-debug.log contains REQUEST START and END with same correlation ID
  });
  
  it('should not pollute console during normal operation', async () => {
    const consoleSpy = jest.spyOn(console, 'log');
    const model = new StitchLanguageModel('stitch-1', config);
    await model.doGenerate(options);
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
```

**Implementation Changes** in [`provider.ts`](../../packages/opencode/src/provider/stitch/provider.ts:1):

1. Add import at top of file:
```typescript
import { logger } from '../../shared/logger';
import { generateId } from '@ai-sdk/provider-utils';
```

2. Replace ALL `console.log` calls following this pattern:

**BEFORE** (lines 66-69):
```typescript
if (process.env.STITCH_DEBUG === 'true') {
  console.log(`[Stitch Provider] Mapped model "${modelId}" to ${modelMappings[modelId]}`);
}
```

**AFTER**:
```typescript
logger.debug(`Mapped model "${modelId}" to ${modelMappings[modelId]}`);
```

3. In `doGenerate()` method (line 210), add correlation ID at start:
```typescript
async doGenerate(options: LanguageModelV2CallOptions): Promise<...> {
  const correlationId = generateId();
  const scopedLogger = logger.withCorrelationId(correlationId);
  const startTime = Date.now();
  
  scopedLogger.info('doGenerate START', {
    modelId: this.modelId,
    hasTools: !!(options.tools && options.tools.length > 0),
    messageCount: options.prompt.length
  });
  
  // ... existing code ...
```

4. Before API call (line 277), log request:
```typescript
logger.startRequest(correlationId, 'POST /v1/chat/completions', {
  model: routedModel,
  messageCount: messages.length,
  maxTokens: request.request.config.max_tokens,
  temperature: request.request.config.temperature
});
```

5. After successful response (line 296), log response:
```typescript
const duration = Date.now() - startTime;
logger.endRequest(correlationId, duration, {
  finishReason: choice.finish_reason,
  promptTokens: response.result.response.usage?.prompt_tokens,
  completionTokens: response.result.response.usage?.completion_tokens
});
```

6. In `doStream()` method (line 337), add correlation ID:
```typescript
async *doStream(options: LanguageModelV2CallOptions): AsyncGenerator<...> {
  const correlationId = generateId();
  const scopedLogger = logger.withCorrelationId(correlationId);
  const startTime = Date.now();
  
  scopedLogger.info('doStream START', {
    modelId: this.modelId,
    hasTools: !!(options.tools && options.tools.length > 0),
    messageCount: options.prompt.length
  });
  
  // ... existing code ...
```

7. Replace all `console.log` in doStream (lines 345-372, 398-407) with `scopedLogger.debug()`

8. In stream parsing loop (line 449), log chunks:
```typescript
for (const line of lines) {
  if (!line.trim()) continue;
  
  try {
    const parsed = JSON.parse(line);
    logger.logChunk(correlationId, { 
      type: 'ndjson',
      hasContent: !!parsed?.result?.response?.choices?.[0]?.content
    });
    
    // ... rest of parsing ...
```

9. At stream end (after line 510), log completion:
```typescript
const duration = Date.now() - startTime;
scopedLogger.info('doStream END', { 
  duration,
  hasEmittedToolCalls,
  finishReason: mappedReason
});
```

10. **CRITICAL**: Remove ALL `if (process.env.STITCH_DEBUG === 'true')` checks - the logger handles this internally.

**Verification**:
```bash
# Run provider and check logs
cd opencode/packages/opencode
STITCH_DEBUG=true bun run dev
# Make a request, then check:
cat stitch-debug.log | grep "doGenerate START"
cat stitch-debug.log | grep "REQUEST START"
cat stitch-debug.log | grep "REQUEST END"

# Verify correlation IDs match
cat stitch-debug.log | grep "\[req-" | head -20

# Verify console is clean
STITCH_DEBUG=false bun run dev
# Console should be empty except CLI output
```

**Success Criteria**:
- ✅ `stitch-debug.log` contains REQUEST START and END entries
- ✅ Each request has unique correlation ID
- ✅ All logs for a request share same correlation ID
- ✅ Console is clean (no debug noise)
- ✅ Full request/response payloads present
- ✅ API keys are `[REDACTED]`

---

### Step 4: Migrate stream.ts

**Objective**: Replace console.log in transformer, log chunk processing, tool calls, and errors.

**Test-First Approach**:
```typescript
// Add to stream tests
describe('Stream Logging', () => {
  it('should log stream chunks with correlation ID', async () => {
    const stream = createStream(correlationId);
    // Process stream
    // Assert: stitch-debug.log contains CHUNK entries with correlation ID
  });
  
  it('should log tool call extraction', async () => {
    const stream = createStreamWithToolCall(correlationId);
    // Process stream
    // Assert: log contains tool call details
  });
});
```

**Implementation Changes** in [`stream.ts`](../../packages/opencode/src/provider/stitch/stream.ts:1):

1. Add import:
```typescript
import { logger } from '../../shared/logger';
```

2. Add correlation ID to transformer functions - update function signatures to accept correlationId:
```typescript
export function createStitchStreamTransformer(correlationId: string) {
  const scopedLogger = logger.withCorrelationId(correlationId);
  const parser = new XmlToolParser();
  
  return new TransformStream<Uint8Array, LanguageModelV2StreamPart>({
    async transform(chunk, controller) {
      scopedLogger.debug('Processing stream chunk', { size: chunk.length });
      // ... rest of transform logic
```

3. Replace any console.log calls with `scopedLogger.debug()` or `scopedLogger.error()`

4. Log tool call extraction:
```typescript
for (const toolCall of toolCalls) {
  scopedLogger.debug('Extracted tool call', {
    toolName: toolCall.function.name,
    toolCallId: toolCall.id,
    argsLength: toolCall.function.arguments.length
  });
  
  controller.enqueue({
    type: 'tool-call',
    // ... rest of tool call
  });
}
```

5. Log errors in stream:
```typescript
catch (err) {
  scopedLogger.error('Stream parsing error', {
    error: err instanceof Error ? err.message : String(err),
    chunk: chunk.toString().substring(0, 200)
  });
  throw err;
}
```

6. Update call sites in `provider.ts` to pass correlation ID to stream transformer

**Verification**:
```bash
cd opencode/packages/opencode
# Run streaming test
STITCH_DEBUG=true bun test --grep "stream"
# Check logs
cat stitch-debug.log | grep "Processing stream chunk"
cat stitch-debug.log | grep "Extracted tool call"
```

**Success Criteria**:
- ✅ Stream chunks logged with correlation ID
- ✅ Tool call extraction logged
- ✅ Errors include context (partial chunk data)
- ✅ No console pollution

---

### Step 5: Migrate request.ts and response.ts

**Objective**: Log transformations, tool mapping, and ensure consistent correlation ID flow.

**Test-First Approach**:
```typescript
describe('Request/Response Logging', () => {
  it('should log request transformations', () => {
    const transformed = transformRequest(data, correlationId);
    // Assert: log contains transformation details
  });
  
  it('should log tool schema injection', () => {
    const withTools = injectTools(request, tools, correlationId);
    // Assert: log contains tool count and names
  });
});
```

**Implementation Changes**:

1. [`request.ts`](../../packages/opencode/src/provider/stitch/request.ts:1):
   - Already imports `debugLogger`, replace with `logger` from facade
   - Add correlation ID parameter to transformation functions
   - Log before/after transformations
   - Log tool injection with tool names and schemas

2. [`response.ts`](../../packages/opencode/src/provider/stitch/response.ts:1):
   - Add `logger` import
   - Add correlation ID parameter
   - Log response parsing steps
   - Log tool call extraction

**Example for request.ts**:
```typescript
import { logger } from '../../shared/logger';

export function transformRequest(
  request: OpenCodeRequest, 
  correlationId: string
): StitchRequest {
  const scopedLogger = logger.withCorrelationId(correlationId);
  
  scopedLogger.debug('Transforming request', {
    messageCount: request.messages.length,
    hasTools: !!request.tools
  });
  
  // ... transformation logic ...
  
  scopedLogger.debug('Request transformed', {
    stitchMessageCount: stitchMessages.length,
    model: result.model
  });
  
  return result;
}
```

**Verification**:
```bash
cd opencode/packages/opencode
bun test src/provider/stitch/__tests__/request.test.ts
bun test src/provider/stitch/__tests__/response.test.ts
```

**Success Criteria**:
- ✅ Transformation steps logged
- ✅ Tool injection logged with details
- ✅ Correlation IDs flow through all functions
- ✅ Existing tests still pass

---

### Step 6: Verify End-to-End

**Objective**: Make a complete request and verify stitch-debug.log has full debugging context.

**Manual Test Script**:
```bash
cd opencode/packages/opencode

# Enable debug logging
export STITCH_DEBUG=true

# Clear old logs
rm -f stitch-debug.log

# Make a test request (use existing test or CLI)
bun run cli "Write hello world to a file"

# Verify log structure
echo "=== Checking Log Structure ==="
cat stitch-debug.log | grep "\[req-" | head -5

echo "=== Checking Correlation IDs ==="
# Extract first correlation ID
FIRST_CID=$(cat stitch-debug.log | grep -o "\[req-[^]]*\]" | head -1)
echo "First Correlation ID: $FIRST_CID"
# Count occurrences (should be > 10 for a single request)
COUNT=$(cat stitch-debug.log | grep -c "$FIRST_CID")
echo "Occurrences: $COUNT"

echo "=== Checking for Sensitive Data ==="
# Should NOT find real API keys
if cat stitch-debug.log | grep -qi "sk-[a-z0-9]"; then
  echo "❌ FAILED: Found potential API key in logs!"
else
  echo "✅ PASSED: No API keys found"
fi

echo "=== Checking Request Lifecycle ==="
cat stitch-debug.log | grep "REQUEST START"
cat stitch-debug.log | grep "REQUEST END"

echo "=== Sample Log Entries ==="
cat stitch-debug.log | head -50
```

**Automated Verification Test**:
```typescript
// Create: opencode/packages/opencode/src/__tests__/logging-integration.test.ts
describe('Logging Integration', () => {
  beforeEach(() => {
    // Clear log file
    fs.writeFileSync('stitch-debug.log', '');
  });
  
  it('should trace complete request with correlation ID', async () => {
    const provider = createStitchProvider();
    const response = await provider.doGenerate({
      prompt: [{ role: 'user', content: 'Hello' }]
    });
    
    const logContent = fs.readFileSync('stitch-debug.log', 'utf-8');
    
    // Extract correlation ID from first log entry
    const cidMatch = logContent.match(/\[(req-[^\]]+)\]/);
    expect(cidMatch).toBeTruthy();
    
    const correlationId = cidMatch![1];
    
    // Verify lifecycle
    expect(logContent).toContain(`[${correlationId}] [INFO] doGenerate START`);
    expect(logContent).toContain(`[${correlationId}] [INFO] REQUEST START`);
    expect(logContent).toContain(`[${correlationId}] [INFO] REQUEST END`);
    
    // Verify no sensitive data
    expect(logContent).not.toMatch(/sk-[a-zA-Z0-9]{32,}/);
    expect(logContent).toMatch(/\[REDACTED\]/);
    
    // Verify console is clean
    const consoleSpy = jest.spyOn(console, 'log');
    await provider.doGenerate({
      prompt: [{ role: 'user', content: 'Test' }]
    });
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
```

**Verification**:
```bash
cd opencode/packages/opencode
bun test src/__tests__/logging-integration.test.ts
```

**Success Criteria**:
- ✅ Single request generates 15-30 log entries with same correlation ID
- ✅ Log includes: REQUEST START, doGenerate/doStream START, CHUNK entries, REQUEST END
- ✅ Full request/response payloads present (sanitized)
- ✅ No API keys or tokens in logs
- ✅ Console is clean when STITCH_DEBUG=false
- ✅ Log file size reasonable (<10MB for 100 requests)
- ✅ Can debug production issue from logs alone

---

## 4. Verification

### Per-Step Verification

Each step includes specific verification commands and success criteria (see above).

### Overall Verification Checklist

Run this checklist after completing all steps:

```bash
#!/bin/bash
# Phase 1 Verification Script

echo "=== Phase 1 Verification ==="

# 1. Run all tests
echo "Running tests..."
cd opencode/packages/opencode
bun test 2>&1 | tee test-results.txt
if [ ${PIPESTATUS[0]} -ne 0 ]; then
  echo "❌ Tests failed"
  exit 1
fi
echo "✅ All tests pass"

# 2. Check for console.log in critical files
echo "Checking for remaining console.log calls..."
CONSOLE_LOGS=$(grep -r "console\.log" src/provider/stitch/provider.ts src/provider/stitch/stream.ts src/provider/stitch/request.ts 2>/dev/null | wc -l)
if [ $CONSOLE_LOGS -gt 0 ]; then
  echo "⚠️  Found $CONSOLE_LOGS console.log calls in critical files"
  grep -n "console\.log" src/provider/stitch/provider.ts src/provider/stitch/stream.ts src/provider/stitch/request.ts
else
  echo "✅ No console.log in critical files"
fi

# 3. Verify logger facade exists
echo "Checking logger facade..."
if [ -f "src/shared/logger.ts" ]; then
  echo "✅ Logger facade exists"
else
  echo "❌ Logger facade missing"
  exit 1
fi

# 4. Verify debug-logger enhancements
echo "Checking debug-logger enhancements..."
if grep -q "withCorrelationId" src/provider/stitch/debug-logger.ts; then
  echo "✅ Correlation ID support added"
else
  echo "❌ Missing correlation ID support"
  exit 1
fi

if grep -q "sanitize" src/provider/stitch/debug-logger.ts; then
  echo "✅ Sanitization added"
else
  echo "❌ Missing sanitization"
  exit 1
fi

# 5. Make test request and verify logs
echo "Making test request..."
export STITCH_DEBUG=true
rm -f stitch-debug.log
bun run cli "test logging" 2>&1 > /dev/null

if [ -f "stitch-debug.log" ]; then
  echo "✅ Log file created"
  
  # Check for correlation IDs
  CID_COUNT=$(grep -o "\[req-[^]]*\]" stitch-debug.log | wc -l)
  if [ $CID_COUNT -gt 0 ]; then
    echo "✅ Found $CID_COUNT correlation ID entries"
  else
    echo "❌ No correlation IDs found"
    exit 1
  fi
  
  # Check for sensitive data
  if grep -qi "sk-[a-z0-9]\{32,\}" stitch-debug.log; then
    echo "❌ Found potential API key in logs!"
    exit 1
  else
    echo "✅ No API keys in logs"
  fi
  
  # Check for lifecycle
  if grep -q "REQUEST START" stitch-debug.log && grep -q "REQUEST END" stitch-debug.log; then
    echo "✅ Request lifecycle logged"
  else
    echo "❌ Incomplete request lifecycle"
    exit 1
  fi
else
  echo "❌ Log file not created"
  exit 1
fi

echo ""
echo "=== ✅ Phase 1 Verification Complete ==="
echo "All checks passed! Phase 1 is ready for production."
```

**Expected Output**:
```
=== Phase 1 Verification ===
Running tests...
✅ All tests pass
Checking for remaining console.log calls...
✅ No console.log in critical files
Checking logger facade...
✅ Logger facade exists
Checking debug-logger enhancements...
✅ Correlation ID support added
✅ Sanitization added
Making test request...
✅ Log file created
✅ Found 23 correlation ID entries
✅ No API keys in logs
✅ Request lifecycle logged

=== ✅ Phase 1 Verification Complete ===
All checks passed! Phase 1 is ready for production.
```

---

## 5. Risks and Mitigations

### Risk 1: File I/O Performance Impact
**Impact**: HIGH  
**Probability**: MEDIUM

**Problem**: Synchronous `fs.appendFileSync()` in hot path could slow down streaming requests.

**Mitigation**:
1. **Phase 1**: Keep synchronous writes (proven to work, low risk)
2. **Monitor**: Add timing metrics around file writes
3. **If needed**: Move to async `fs.appendFile()` in Phase 2
4. **Fallback**: Add in-memory buffer, batch writes every 100ms

**Detection**:
```typescript
const writeStart = Date.now();
fs.appendFileSync(this.logPath, logLine);
const writeDuration = Date.now() - writeStart;
if (writeDuration > 10) {
  console.warn(`Slow log write: ${writeDuration}ms`);
}
```

---

### Risk 2: Log File Size Explosion
**Impact**: MEDIUM  
**Probability**: MEDIUM

**Problem**: Full payloads in logs could create multi-GB files.

**Mitigation**:
1. **Implemented in Step 1**: Truncate large payloads (>1000 chars per chunk)
2. **Log rotation**: Clear log on startup (already implemented)
3. **Size limit**: Add max file size check (50MB), stop logging if exceeded
4. **Documentation**: Warn users about disk space

**Detection**:
```typescript
const stats = fs.statSync(this.logPath);
if (stats.size > 50 * 1024 * 1024) { // 50MB
  this.isEnabled = false;
  console.warn('Log file too large, disabling debug logging');
}
```

---

### Risk 3: Missing Console Output for Errors
**Impact**: HIGH  
**Probability**: LOW

**Problem**: Critical errors might only go to file, user won't see them in console.

**Mitigation**:
1. **Keep console.error**: Don't replace `console.error`, only `console.log`
2. **Dual logging**: Errors go to BOTH file AND console
3. **Exit codes**: Ensure process exits with correct code on fatal errors

**Implementation**:
```typescript
error(message: string, error?: any) {
  // Log to file
  this.log('ERROR', `❌ ERROR: ${message}`, error);
  
  // ALSO log to console (always, regardless of STITCH_DEBUG)
  console.error(`[Stitch Error] ${message}`, error);
}
```

---

### Risk 4: Breaking Existing Debug Workflows
**Impact**: MEDIUM  
**Probability**: MEDIUM

**Problem**: Developers might depend on console.log output for debugging.

**Mitigation**:
1. **Preserve STITCH_DEBUG=true**: Keep environment variable behavior
2. **Documentation**: Update README with new debugging approach
3. **Gradual rollout**: Phase 1 only touches critical files, doesn't break others
4. **Rollback plan**: Keep git history clean, easy to revert per-file

**Rollback Strategy**:
```bash
# If Step 3 (provider.ts) causes issues, revert just that file:
git checkout HEAD~1 -- opencode/packages/opencode/src/provider/stitch/provider.ts

# Steps 1-2 (debug-logger, logger facade) can stay, they don't break anything
```

---

### Risk 5: Correlation ID Loss in Async Code
**Impact**: MEDIUM  
**Probability**: LOW

**Problem**: Correlation IDs might not propagate through async generators, promises.

**Mitigation**:
1. **Explicit passing**: Pass correlationId as parameter (not async context)
2. **Scoped loggers**: Create `scopedLogger = logger.withCorrelationId(id)` at function start
3. **Testing**: Verify correlation ID appears in all logs for a single request (Step 6)

**Detection Test**:
```typescript
it('should maintain correlation ID through async generator', async () => {
  const correlationId = 'test-123';
  const generator = doStream(options, correlationId);
  
  // Process entire stream
  for await (const chunk of generator) {
    // ... process chunk
  }
  
  // Verify all log entries have same correlation ID
  const logContent = fs.readFileSync('stitch-debug.log', 'utf-8');
  const cids = logContent.match(/\[(req-[^\]]+)\]/g);
  const uniqueCids = new Set(cids);
  expect(uniqueCids.size).toBe(1); // Only one unique correlation ID
});
```

---

### Risk 6: Sanitization Too Aggressive
**Impact**: LOW  
**Probability**: MEDIUM

**Problem**: Sanitization might remove data needed for debugging.

**Mitigation**:
1. **Conservative approach**: Only remove known sensitive keys (apiKey, authorization, token)
2. **Keep structure**: Don't remove entire objects, just replace sensitive values with `[REDACTED]`
3. **Truncation over removal**: Truncate large strings rather than omit them
4. **Test with real data**: Verify debug scenarios still work with sanitized logs

**Example**:
```typescript
// Input:
{ apiKey: 'sk-secret123', request: { model: 'claude', messages: [...] } }

// Output (GOOD):
{ apiKey: '[REDACTED]', request: { model: 'claude', messages: [...] } }

// Output (BAD - too aggressive):
{ request: { model: 'claude' } } // Lost messages structure
```

---

## Appendix A: Rollback Plan

If Phase 1 causes issues, here's the rollback strategy:

### Full Rollback (worst case)
```bash
cd opencode/packages/opencode

# Revert all Phase 1 changes
git revert <phase-1-commit-hash>

# Or revert file-by-file:
git checkout HEAD~1 -- src/provider/stitch/debug-logger.ts
git checkout HEAD~1 -- src/shared/logger.ts
git checkout HEAD~1 -- src/provider/stitch/provider.ts
git checkout HEAD~1 -- src/provider/stitch/stream.ts
git checkout HEAD~1 -- src/provider/stitch/request.ts

# Verify tests still pass
bun test

# Commit rollback
git commit -m "Rollback Phase 1 logging changes"
```

### Partial Rollback (keep enhancements, revert migrations)
```bash
# Keep debug-logger and logger facade (Steps 1-2), revert migrations (Steps 3-5)
git checkout HEAD~1 -- src/provider/stitch/provider.ts
git checkout HEAD~1 -- src/provider/stitch/stream.ts

# This keeps the infrastructure but reverts the console.log replacements
```

---

## Appendix B: Quick Reference

### Import Pattern
```typescript
import { logger } from '../../shared/logger';
```

### Usage Pattern
```typescript
async function doSomething(options) {
  const correlationId = generateId();
  const scopedLogger = logger.withCorrelationId(correlationId);
  const startTime = Date.now();
  
  scopedLogger.info('Operation START', { /* context */ });
  
  try {
    // ... do work ...
    
    scopedLogger.debug('Step complete', { /* data */ });
    
    const duration = Date.now() - startTime;
    scopedLogger.info('Operation END', { duration });
  } catch (error) {
    scopedLogger.error('Operation failed', error);
    throw error;
  }
}
```

### Request Lifecycle Pattern
```typescript
const correlationId = generateId();
logger.startRequest(correlationId, 'POST /api/endpoint', requestData);

// ... make request ...

logger.endRequest(correlationId, duration, responseData);
```

### Don't Replace These
- `console.error()` - Keep for user-visible errors
- `console.warn()` - Keep for user-visible warnings  
- `process.stdout.write()` - Keep for CLI output
- `throw new Error()` - Keep all error throwing

---

## Next Steps After Phase 1

1. **Review logs** from production usage
2. **Measure performance** impact (log write times, file size)
3. **Gather feedback** from team on debugging experience
4. **Decide on Phase 2**: Based on learnings, adjust Phase 2 scope
5. **Document patterns**: Update CONTRIBUTING.md with logging best practices

---

**End of Phase 1 Implementation Plan**
