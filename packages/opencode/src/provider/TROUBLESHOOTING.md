
# Stitch Provider Troubleshooting

## Common Issues

### 1. "Service temporarily unavailable (Circuit Open)"
**Cause**: The Circuit Breaker has tripped due to a high rate of failures.
**Solution**:
- Check if the Stitch API is down.
- Wait for the circuit to close (default: 30-120 seconds).
- Check logs for the underlying error that caused the trip.

### 2. "Unable to process the response format"
**Cause**: The API returned a response that couldn't be parsed or validated.
**Solution**:
- Check `STITCH-DEBUG` logs to see the raw response.
- Ensure the API is returning valid NDJSON.
- If the schema has changed, update `validator.ts`.

### 3. "Response validation failed"
**Cause**: The response structure didn't match expectations (e.g. missing `choices` array).
**Solution**:
- This is usually a backend issue.
- The robustness layer prevents a crash, but the response will be empty.
- Verify API compatibility.

### 4. "Rate limit exceeded"
**Cause**: Too many requests in a short period.
**Solution**:
- The system automatically retries with exponential backoff.
- If it persists, increase your quota or reduce concurrency.

## Debugging

Enable verbose logging by setting the environment variable:
```bash
STITCH_DEBUG=true
```

This will output detailed logs for:
- Request transformation
- Raw response chunks
- Validation failures
- Retry attempts
- Circuit breaker state changes

## Telemetry

The provider maintains internal telemetry metrics. You can access them via the `RobustnessLayer` API if you have a reference to it:

```typescript
const metrics = robustnessLayer.getMetrics();
console.log(metrics);
// { totalEvents: 100, errorCount: 2, successRate: 0.98 }
```
