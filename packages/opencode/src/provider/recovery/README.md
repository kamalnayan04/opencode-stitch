
# Stitch CLI Error Recovery Layer

This module provides intelligent error recovery mechanisms for the Stitch CLI provider in OpenCode.

## Overview

The recovery layer ensures that the application is resilient to transient failures such as network glitches, rate limits, and temporary service outages. It implements industry-standard patterns like Exponential Backoff and Circuit Breaker.

### Core Components

1.  **Error Classifier**: Categorizes errors into Retriable, Rate-Limited (Backoff), or Fatal.
2.  **Retry Logic**: Re-executes failed operations with configurable backoff and jitter.
3.  **Circuit Breaker**: Detects high failure rates and fails fast to prevent cascading issues.
4.  **Configuration**: Centralized settings for timeouts, thresholds, and limits.

## Usage

```typescript
import { CircuitBreaker } from './circuit-breaker';
import { withRetry } from './retry';
import { classifyError } from './error-classifier';
import { DEFAULT_RECOVERY } from './config';

const breaker = new CircuitBreaker(DEFAULT_RECOVERY.circuitBreaker);

// Execute an operation with full protection
const result = await breaker.execute(
  async () => {
    return withRetry(
      async () => await fetch('https://api.example.com'),
      DEFAULT_RECOVERY.retry,
      classifyError
    );
  },
  // Fallback when circuit is open
  () => ({ ok: false, status: 503 }) 
);
```

## Configuration

The layer provides two presets in `config.ts`:

-   **AGGRESSIVE_RECOVERY**: Retries more often, shorter delays (Good for dev/testing).
-   **CONSERVATIVE_RECOVERY**: Retries less, longer delays (Good for production).

Configurable parameters include:

-   `maxAttempts`: Max retry attempts.
-   `baseDelayMs`: Initial wait time.
-   `failureThreshold`: Failures before opening circuit.
-   `openStateDurationMs`: Time to wait before testing circuit recovery.

## Architecture

1.  **Request Initiation**: Provider initiates a request.
2.  **Circuit Check**: Circuit Breaker checks state. If OPEN, returns fallback immediately.
3.  **Execution**: `withRetry` attempts the operation.
4.  **Failure Handling**:
    -   If error is transient -> Retry after delay.
    -   If error is fatal -> Throw immediately.
5.  **Circuit Update**:
    -   If operation succeeds -> Circuit state resets (if HALF-OPEN).
    -   If operation fails repeatedly -> Circuit trips to OPEN.
