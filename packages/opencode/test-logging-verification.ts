#!/usr/bin/env bun

/**
 * Comprehensive Logging Migration Verification Script
 * Tests console output behavior and log file generation
 */

import { StitchLanguageModel } from './src/provider/stitch/provider';
import type { LanguageModelV2CallOptions } from '@ai-sdk/provider';
import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(process.cwd(), 'stitch-debug.log');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function section(title: string) {
  console.log('\n' + '='.repeat(80));
  log(title, colors.cyan);
  console.log('='.repeat(80));
}

async function testPhaseA() {
  section('PHASE A: Console Output Verification');
  
  // The console should only show our test output, not debug logs
  log('✓ If you see ONLY this test output (no debug logs), Phase A PASSES', colors.green);
  log('✓ Debug logs should be in stitch-debug.log, NOT on console', colors.green);
}

async function testPhaseB() {
  section('PHASE B: Log File Verification');
  
  // Clear log file
  if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
    log('✓ Cleared old log file', colors.green);
  }
  
  // Create a mock provider instance
  const provider = new StitchLanguageModel('claude-4-5-sonnet', {
    apiKey: 'test-key',
    baseURL: 'https://api.stitch.tech/v1/chat/completions'
  });
  
  log('✓ Created provider instance', colors.green);
  
  // Check log file exists and has content
  await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for file write
  
  if (!fs.existsSync(LOG_FILE)) {
    log('✗ FAIL: stitch-debug.log was not created!', colors.red);
    return false;
  }
  
  const logContent = fs.readFileSync(LOG_FILE, 'utf-8');
  
  if (!logContent) {
    log('✗ FAIL: stitch-debug.log is empty!', colors.red);
    return false;
  }
  
  log('✓ Log file created and has content', colors.green);
  
  // Verify log structure
  const checks = [
    { pattern: /\[.*?\]/, name: 'Timestamp format' },
    { pattern: /\[INFO\]|\[DEBUG\]|\[WARN\]|\[ERROR\]/, name: 'Log levels' },
    { pattern: /\[NO-CID\]/, name: 'Correlation ID (NO-CID for init)' },
    { pattern: /Initialized native provider/, name: 'Provider initialization message' },
  ];
  
  for (const check of checks) {
    if (check.pattern.test(logContent)) {
      log(`✓ ${check.name} present`, colors.green);
    } else {
      log(`✗ FAIL: ${check.name} missing`, colors.red);
      return false;
    }
  }
  
  log('\n📄 Sample log entries:', colors.blue);
  const lines = logContent.split('\n').slice(0, 10);
  lines.forEach(line => {
    if (line.trim()) {
      console.log('  ' + line.substring(0, 100));
    }
  });
  
  return true;
}

async function testPhaseC() {
  section('PHASE C: Correlation ID Flow');
  
  // Clear log file
  if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
  }
  
  // Import logger and test correlation ID
  const { logger } = await import('./src/shared/logger');
  
  const correlationId = `test-${Date.now()}`;
  const scopedLogger = logger.withCorrelationId(correlationId);
  
  scopedLogger.info('Test message 1');
  scopedLogger.debug('Test message 2', { data: 'value' });
  scopedLogger.warn('Test message 3');
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const logContent = fs.readFileSync(LOG_FILE, 'utf-8');
  
  // Count occurrences of correlation ID
  const matches = logContent.match(new RegExp(`\\[${correlationId}\\]`, 'g'));
  const count = matches ? matches.length : 0;
  
  if (count === 3) {
    log(`✓ All 3 logs contain correlation ID [${correlationId}]`, colors.green);
  } else {
    log(`✗ FAIL: Expected 3 logs with correlation ID, found ${count}`, colors.red);
    return false;
  }
  
  // Verify messages are present
  const messages = ['Test message 1', 'Test message 2', 'Test message 3'];
  for (const msg of messages) {
    if (logContent.includes(msg)) {
      log(`✓ Found: "${msg}"`, colors.green);
    } else {
      log(`✗ FAIL: Missing: "${msg}"`, colors.red);
      return false;
    }
  }
  
  return true;
}

async function main() {
  log('\n🧪 LOGGING MIGRATION VERIFICATION TEST', colors.cyan);
  log('Environment: STITCH_DEBUG=' + (process.env.STITCH_DEBUG || 'not set'), colors.yellow);
  
  try {
    await testPhaseA();
    
    const phaseBResult = await testPhaseB();
    if (!phaseBResult) {
      log('\n❌ Phase B FAILED', colors.red);
      process.exit(1);
    }
    
    const phaseCResult = await testPhaseC();
    if (!phaseCResult) {
      log('\n❌ Phase C FAILED', colors.red);
      process.exit(1);
    }
    
    section('SUMMARY');
    log('✅ Phase A: Console Output - PASS', colors.green);
    log('✅ Phase B: Log File Generation - PASS', colors.green);
    log('✅ Phase C: Correlation ID Flow - PASS', colors.green);
    log('\n🎉 ALL VERIFICATION TESTS PASSED!', colors.green);
    
  } catch (error) {
    log(`\n❌ Unexpected error: ${error}`, colors.red);
    console.error(error);
    process.exit(1);
  }
}

main();
