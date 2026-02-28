
/**
 * Manual verification script for logger migration
 * Run with: STITCH_DEBUG=true bun run test-logger-migration.ts
 */

import { StitchLanguageModel } from './src/provider/stitch/provider';

async function testLogging() {
  console.log('Testing logger migration...\n');
  
  // Create a model instance (this should log initialization)
  const model = new StitchLanguageModel('stitch-1', {
    apiKey: 'test-key',
    baseURL: 'https://api.stitch.tech/v1/chat/completions'
  });
  
  console.log('✅ Model created - check stitch-debug.log for initialization log');
  console.log('✅ Console should be quiet (no [STITCH-DEBUG] output)\n');
  
  console.log('Migration verification complete!');
  console.log('Next: Check stitch-debug.log file for logs with correlation IDs');
}

testLogging().catch(console.error);
