
# Stitch Provider Configuration

The Stitch provider in OpenCode is highly configurable to ensure robustness and recoverability. This document details the available configuration options.

## Environment Variables

You can control the behavior of the provider using the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `STITCH_VALIDATION` | Enable/disable response validation | `true` |
| `STITCH_VALIDATION_STRICT` | If true, fail on warnings (not just errors) | `false` |
| `STITCH_MAX_CONTENT` | Max content length in characters | `1048576` (1MB) |
| `STITCH_MAX_CHOICES` | Max number of choices to process | `10` |
| `STITCH_TELEMETRY` | Enable/disable internal telemetry logging | `true` |
| `STITCH_DEBUG` | Enable verbose debug logging | `false` |
| `NODE_ENV` | Environment mode (`development` or `production`) | - |

## Recovery Strategies

The system automatically selects a recovery strategy based on `NODE_ENV`.

### Aggressive Recovery (Development)
Used when `NODE_ENV !== 'production'`.
- Max Retries: 5
- Base Delay: 500ms
- Circuit Breaker Threshold: 3 failures
- Open State Duration: 30s

### Conservative Recovery (Production)
Used when `NODE_ENV === 'production'`.
- Max Retries: 2
- Base Delay: 2000ms
- Circuit Breaker Threshold: 10 failures
- Open State Duration: 120s

## Robustness Features

### Validation
Ensures that the API response has the expected structure (e.g., `result.response.choices` array). If validation fails critically, a fallback error is generated instead of crashing the app.

### Sanitization
- Truncates extremely long content strings to prevent memory issues.
- Filters out unsupported content types (e.g., images if not supported).
- Ensures usage statistics are numbers.

### Fallbacks
When errors occur (network, parsing, validation), the system generates a user-friendly fallback message that mimics a valid AI response. This keeps the chat UI functional and informative.

### Circuit Breaker
Prevents the system from overwhelming the Stitch API during outages. If failures exceed the threshold, the circuit "opens" and fails fast for a set duration before testing the connection again.
