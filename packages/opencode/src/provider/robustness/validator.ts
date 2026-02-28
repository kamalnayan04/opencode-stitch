
import type { ValidationResult, ValidationIssue } from './types';

/**
 * Validates the structure and critical fields of a Stitch API response.
 * Focuses on ensuring that transformation can proceed without crashing.
 * 
 * @param data The raw response data (usually parsed from JSON)
 * @returns ValidationResult with status and any issues found
 */
export function validateStitchResponse(data: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  
  // 1. Root object validation
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      severity: 'critical',
      issues: [{
        field: 'root',
        expected: 'object',
        actual: data === null ? 'null' : typeof data,
        recoverable: false
      }]
    };
  }
  
  // 2. Response envelope validation
  // Stitch responses are wrapped in { result: { response: { ... } } }
  const result = (data as any)?.result;
  if (!result || typeof result !== 'object') {
     // Check if it's an error response directly
    if ((data as any)?.error) {
        // It's a valid error response structure, so we mark it as valid structure but note it
        // The transformation layer will handle the error object
        return { valid: true, severity: 'minor', issues: [] }; 
    }

    issues.push({
        field: 'result',
        expected: 'object',
        actual: typeof result,
        recoverable: false // If result is missing, we can't find response
    });
  }

  const response = result?.response;
  if (!response && !issues.some(i => i.field === 'result')) {
    issues.push({
      field: 'result.response',
      expected: 'object',
      actual: 'undefined',
      recoverable: true // We might be able to construct a dummy response
    });
  }
  
  // 3. Choices array validation
  // Most critical part for chat completions
  if (response && !Array.isArray(response?.choices)) {
    issues.push({
      field: 'choices',
      expected: 'array',
      actual: typeof response?.choices,
      recoverable: true // We can treat as empty choices
    });
  }
  
  // 4. Content validation (at least one choice should have content structure)
  // We don't enforce content presence (it might be empty delta), but structure must be array
  if (response && Array.isArray(response.choices) && response.choices.length > 0) {
    // Check the first choice as a sample
    const firstChoice = response.choices[0];
    if (firstChoice && !Array.isArray(firstChoice.content) && firstChoice.content !== null && firstChoice.content !== undefined) {
         issues.push({
            field: 'choices[0].content',
            expected: 'array or null',
            actual: typeof firstChoice.content,
            recoverable: true // We can treat as empty content
        });
    }
  }
  
  // Determine severity
  // Critical: Cannot proceed with transformation at all
  // Warning: Can proceed but data might be missing
  // Minor: Cosmetic or non-critical issues
  const severity = issues.some(i => !i.recoverable) ? 'critical'
                 : issues.length > 0 ? 'warning'
                 : 'minor';
  
  return {
    valid: issues.length === 0 || severity !== 'critical',
    severity,
    issues
  };
}
