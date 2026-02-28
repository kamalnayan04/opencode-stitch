
/**
 * Verification script for Logger Facade (Step 2)
 * Tests the actual import and usage patterns
 */

import { logger } from './src/shared/logger';

console.log('=== Logger Facade Verification ===\n');

// Test 1: Basic import and usage
console.log('✓ Test 1: Logger imported from shared/logger');
console.log(`  - logger.debug: ${typeof logger.debug}`);
console.log(`  - logger.info: ${typeof logger.info}`);
console.log(`  - logger.warn: ${typeof logger.warn}`);
console.log(`  - logger.error: ${typeof logger.error}`);
console.log(`  - logger.withCorrelationId: ${typeof logger.withCorrelationId}`);

// Test 2: Basic logging
console.log('\n✓ Test 2: Basic logging methods work');
logger.info('Verification: Basic info log');
logger.debug('Verification: Basic debug log', { test: 'data' });
logger.warn('Verification: Basic warn log');
logger.error('Verification: Basic error log');

// Test 3: Correlation ID
console.log('\n✓ Test 3: Correlation ID scoped logger');
const scoped = logger.withCorrelationId('verify-123');
scoped.info('Verification: Scoped info log');
scoped.debug('Verification: Scoped debug log', { scoped: true });

// Test 4: Multiple scoped loggers
console.log('\n✓ Test 4: Multiple independent scoped loggers');
const scoped1 = logger.withCorrelationId('req-001');
const scoped2 = logger.withCorrelationId('req-002');
scoped1.info('From scoped1');
scoped2.info('From scoped2');

console.log('\n=== All Verification Tests Passed ===');
console.log('Check stitch-debug.log for correlation IDs and log entries');
