
# Stitch Provider Robustness Examples

This document demonstrates how to use the robustness layer directly for testing or custom implementations.

## Basic Usage

```typescript
import { createRobustnessLayer, DEFAULT_CONFIG } from './index';

// 1. Create the layer
const robustness = createRobustnessLayer(DEFAULT_CONFIG);

// 2. Process data
const rawData = { result: { response: { choices: [...] } } };
const transformed = robustness.transform(rawData);

console.log(transformed.choices[0].delta.content);
```

## Handling Errors Manually

```typescript
try {
  // Simulate an error
  throw new Error('Something went wrong');
} catch (error) {
  // Generate a safe fallback response
  const fallback = robustness.handleError(error, { phase: 'processing' });
  
  // This is now an OpenAI-compatible response object
  console.log(fallback.choices[0].delta.content);
  // Output: "⚠️ An error occurred: Something went wrong. Please try again."
}
```

## Custom Configuration

```typescript
import { createRobustnessLayer } from './index';

const customConfig = {
  validation: { enabled: true, strictMode: true },
  sanitization: {
    maxContentLength: 500, // Very short limit
    maxChoices: 1,         // Only take first choice
    truncateOverflow: true
  },
  fallbacks: { enabled: true, userFriendlyMessages: true, includeErrorDetails: true },
  telemetry: { enabled: true, maxEvents: 100, exportInterval: 60000 }
};

const strictLayer = createRobustnessLayer(customConfig);
```

## Inspecting Metrics

```typescript
// After some operations...
const metrics = robustness.getMetrics();

console.log(`Success Rate: ${metrics.successRate * 100}%`);
console.log(`Errors: ${metrics.errorCount}`);
console.log(`Fallbacks Used: ${metrics.fallbackCount}`);
```
