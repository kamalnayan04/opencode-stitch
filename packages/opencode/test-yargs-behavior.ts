#!/usr/bin/env bun
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

console.log('======================================')
console.log('Testing yargs behavior with no args')
console.log('======================================')
console.log('')
console.log('Process argv:', process.argv)
console.log('After hideBin:', hideBin(process.argv))
console.log('')

const cli = yargs(hideBin(process.argv))
  .scriptName("test-cli")
  .help("help", "show help")
  .command('foo', 'A foo command', () => {}, () => { console.log('Foo executed') })
  .strict()

console.log('Calling cli.parse()...')
await cli.parse()
console.log('cli.parse() completed')
console.log('')
console.log('Expected behavior:')
console.log('- With no args: parse succeeds silently (no output)')
console.log('- With --help: shows help')
console.log('- With invalid command: shows error due to .strict()')
console.log('')
console.log('Test complete')
console.log('======================================')
