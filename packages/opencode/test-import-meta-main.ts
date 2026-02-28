#!/usr/bin/env bun
console.log('======================================')
console.log('Testing import.meta.main in Bun')
console.log('======================================')
console.log('')
console.log('1. Value of import.meta.main:', import.meta.main)
console.log('2. Type of import.meta.main:', typeof import.meta.main)
console.log('3. Truthy check:', !!import.meta.main)
console.log('')

if (import.meta.main) {
  console.log('✓ Guard ENTERED - import.meta.main is truthy')
} else {
  console.log('✗ Guard NOT entered - import.meta.main is falsy')
}

console.log('')
console.log('4. import.meta object:', import.meta)
console.log('')
console.log('5. process.argv:', process.argv)
console.log('')
console.log('======================================')
console.log('Test complete')
console.log('======================================')
