#!/bin/bash

echo "═══════════════════════════════════════════════════════════════"
echo "OpenCode Comprehensive Diagnostic Test Suite"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "This will run 5 diagnostic tests to gather evidence about why"
echo "OpenCode doesn't appear in the terminal."
echo ""
echo "Press Enter to continue..."
read

cd /Users/kamal.nayan@grofers.com/StudioProjects/opencode/packages/opencode

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: import.meta.main verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bun run ./test-import-meta-main.ts
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: Yargs behavior with no arguments"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bun run ./test-yargs-behavior.ts
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: OpenCode with diagnostic logs (saved to file)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bun run ./src/index.ts 2>&1 | tee opencode-full-diagnostic.txt
EXIT_CODE=$?
echo ""
echo "Exit code: $EXIT_CODE"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: OpenCode with --help flag"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
bun run ./src/index.ts --help
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 5: Comparison of bun run vs bun direct"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Running: bun run ./src/index.ts"
bun run ./src/index.ts
echo "Exit code: $?"
echo ""
echo "Running: bun ./src/index.ts"
bun ./src/index.ts
echo "Exit code: $?"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RESULTS SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Saved diagnostic output file:"
ls -lh opencode-full-diagnostic.txt
echo ""
echo "First 30 lines of diagnostic output:"
head -30 opencode-full-diagnostic.txt
echo ""
echo "Last 10 lines of diagnostic output:"
tail -10 opencode-full-diagnostic.txt
echo ""
echo "Total lines in diagnostic output:"
wc -l opencode-full-diagnostic.txt
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Tests complete! Review the output above."
echo "═══════════════════════════════════════════════════════════════"
