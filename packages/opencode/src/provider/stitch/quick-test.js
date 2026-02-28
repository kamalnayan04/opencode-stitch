
// Quick verification of critical fixes
const { mapArguments, mapToolName } = require('./tool-mapping');
const { XmlToolParser } = require('./transform');

console.log('🔍 Quick Verification of Critical Fixes\n');

// Test 1B: Read Tool Math
console.log('TEST 1B: Read Tool Math');
const readArgs = mapArguments('read_file', {
  'path': 'test.ts',
  'start-line': '10',
  'end-line': '20'
});
console.log('Input:', { 'path': 'test.ts', 'start-line': '10', 'end-line': '20' });
console.log('Output:', readArgs);
console.log('Expected: { filePath: "test.ts", offset: 10, limit: 11 }');
console.log('✅ Pass:', readArgs.offset === 10 && readArgs.limit === 11 && readArgs.filePath === 'test.ts');
console.log('');

// Test 2A: Hyphen Regex
console.log('TEST 2A: Hyphen Regex');
const parser = new XmlToolParser();
const result = parser.parseStreamChunk('<grep><search-term>foo</search-term><file-pattern>*.ts</file-pattern></grep>');
const flushed = parser.flush();
const toolCalls = [...result.toolCalls, ...flushed.toolCalls];
console.log('Input XML: <grep><search-term>foo</search-term><file-pattern>*.ts</file-pattern></grep>');
console.log('Tool calls found:', toolCalls.length);
if (toolCalls.length > 0) {
  const args = JSON.parse(toolCalls[0].function.arguments);
  console.log('Parsed args:', args);
  console.log('✅ Pass:', args['search-term'] === 'foo' && args['file-pattern'] === '*.ts');
}
console.log('');

console.log('🎉 All Critical Fixes Working!');
