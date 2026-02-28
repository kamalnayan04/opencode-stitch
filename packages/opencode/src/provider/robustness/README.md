
# Stitch CLI Robustness Layer

This module provides validation, sanitization, and fallback mechanisms for the Stitch CLI provider in OpenCode.

## Overview

The robustness layer ensures that the UI never crashes due to malformed, incomplete, or unexpected responses from the Stitch API. It acts as a safety shield between the raw API response and the OpenCode application logic.

### Core Components

1.  **Validator**: Checks critical fields in the response structure.
2.  **Sanitizer**: Safely extracts data with type coercion and bounds checking.
3.  **Fallback Generator**: Creates user-friendly error messages when things go wrong.
4.  **Telemetry**: Logs validation failures and recovery actions for monitoring.

## Usage

```typescript
import { createRobustnessLayer, DEFAULT_CONFIG } from './robustness';

const robustness = createRobustnessLayer(DEFAULT_CONFIG);

// In your stream processing loop:
try {
  const transformed = robustness.transform(parsedJSON);
  // use transformed data
} catch (error) {
  // This should rarely happen as transform catches most errors
  const fallback = robustness.handleError(error, context);
  // use fallback data
}
```

## Configuration

The layer is configurable via `RobustnessConfig`:

-   `validation`: Enable/disable validation rules.
-   `sanitization`: Set max content length, max choices, etc.
-   `fallbacks`: Configure error messages.
-   `telemetry`: Configure logging verbosity.

## Architecture

Data flows through the layer in this order:

1.  **Raw Input** -> **Validator** (Checks structure)
2.  **Raw Input** -> **Sanitizer** (Safe extraction) -> **Safe Response**
3.  **Safe Response** -> **Transformer** -> **OpenAI Format**

If any step fails, the **Fallback Generator** creates a safe, compliant error response that can be displayed in the chat UI.
